import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth/allowed-domain'

// Destino do OAuth (Google). Troca o `code` pela sessão e só a mantém se a
// conta for do domínio da escola E já tiver perfil cadastrado no sistema.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const code = searchParams.get('code')

  const fail = async (
    reason: 'oauth' | 'domain' | 'no_profile',
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return fail('no_profile', true)

  return NextResponse.redirect(`${origin}/dashboard`)
}
