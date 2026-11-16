import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { adminSupabase, adminSupabaseAs } from '@/lib/supabase/admin'
import { isAllowedEmail } from '@/lib/auth/allowed-domain'
import { DEFAULT_ROLE } from '@/lib/auth/roles'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// Destino do OAuth (Google). Troca o `code` pela sessão e só a mantém se a
// conta for do domínio da escola. Quem entra pela primeira vez ganha um perfil
// de Visualizador (só consulta); o administrador promove quem precisar editar.
// Perfil desativado continua sem acesso.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  // Atrás de proxy reverso (Coolify) `nextUrl.origin` é o endereço interno
  // (localhost:3000). O host público vem nos cabeçalhos encaminhados.
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '')
  const origin = host ? `${proto}://${host}` : request.nextUrl.origin
  const code = searchParams.get('code')

  const fail = async (
    reason: 'oauth' | 'domain' | 'no_profile' | 'inactive',
    signOut = false
  ) => {
    if (signOut) {
      const supabase = await createClient()
      await supabase.auth.signOut()
    }
    return NextResponse.redirect(`${origin}/login?error=${reason}`)
  }

  if (!code) return fail('oauth')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return fail('oauth')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // O parâmetro `hd` do Google é só uma dica de UI e pode ser adulterado:
  // a restrição de domínio de fato é validada aqui, no servidor.
  if (!user || !isAllowedEmail(user.email)) return fail('domain', true)

  // Lido com a service-role: a RLS esconde o perfil de usuário desativado, e
  // aqui precisamos distinguir "sem cadastro" de "desativado".
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle()

  if (profile && !profile.active) return fail('inactive', true)

  if (!profile) {
    const meta = user.user_metadata ?? {}
    const email = user.email!.trim().toLowerCase()
    const name =
      [meta.full_name, meta.name].find(
        (v): v is string => typeof v === 'string' && v.trim() !== ''
      )?.trim() ?? email.split('@')[0]

    // Service-role: a RLS só deixa ADMIN criar perfis. O x-actor-id faz o
    // histórico registrar a própria pessoa como autora do cadastro.
    const { error: insertError } = await adminSupabaseAs(user.id)
      .from('profiles')
      .upsert(
        { id: user.id, tenant_id: TENANT_ID, name, email, role: DEFAULT_ROLE, active: true },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    if (insertError) return fail('no_profile', true)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
