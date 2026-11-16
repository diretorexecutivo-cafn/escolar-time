'use server'

import { createClient } from '@/lib/supabase/server'

export async function loginAction(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { success: false, error: 'E-mail ou senha inválidos.' }
  }

  // Usuário desativado (ou sem perfil) não entra: a RLS esconde o perfil dele.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('id').eq('id', user.id).eq('active', true).maybeSingle()
    : { data: null }

  if (!profile) {
    await supabase.auth.signOut()
    return { success: false, error: 'Seu acesso está desativado. Fale com o administrador.' }
  }

  return { success: true }
}
