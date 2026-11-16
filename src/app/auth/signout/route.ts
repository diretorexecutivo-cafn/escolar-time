import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

// Encerra a sessão e volta ao login. Usado quando um usuário logado perde o
// acesso (perfil desativado): um Server Component não consegue apagar cookies,
// e o middleware mandaria um usuário logado de /login de volta ao dashboard.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto =
    request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '')
  const origin = host ? `${proto}://${host}` : request.nextUrl.origin

  const reason = request.nextUrl.searchParams.get('error')
  const query = reason === 'inactive' ? '?error=inactive' : ''
  return NextResponse.redirect(`${origin}/login${query}`)
}
