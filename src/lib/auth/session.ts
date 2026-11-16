import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { canEdit } from './roles'

export type { RoleKey as Role } from './roles'
import type { RoleKey as Role } from './roles'

export type SessionProfile = {
  id: string
  tenant_id: string
  name: string
  email: string
  role: Role
}

/**
 * Perfil ativo do usuário logado, ou null. Usuário desativado não tem acesso:
 * a RLS (auth_tenant_id, migration 008) já esconde o perfil dele, e o filtro de
 * `active` aqui deixa isso explícito. Memorizado por requisição (layout, página
 * e componentes do servidor consultam o banco uma vez só).
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, name, email, role')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle()

  return (profile as SessionProfile | null) ?? null
})

/** Perfil do usuário logado se for ADMIN ativo; senão null. */
export async function getAdminProfile(): Promise<SessionProfile | null> {
  const profile = await getSessionProfile()
  return profile?.role === 'ADMIN' ? profile : null
}

/** Perfil do usuário logado se ele puder alterar dados (ADMIN ou COORDINATOR); senão null. */
export async function getEditorProfile(): Promise<SessionProfile | null> {
  const profile = await getSessionProfile()
  return profile && canEdit(profile.role) ? profile : null
}

export const READ_ONLY_ERROR = 'Seu perfil é somente de consulta. Peça acesso ao administrador.'

/**
 * Guarda das server actions que gravam dados: devolve o erro a retornar quando o
 * usuário é Visualizador. A RLS (migration 009) também bloqueia, mas um UPDATE ou
 * DELETE barrado por ela não dá erro — só afeta zero linhas e pareceria sucesso.
 */
export async function denyIfReadOnly(): Promise<{ success: false; error: string } | null> {
  return (await getEditorProfile()) ? null : { success: false, error: READ_ONLY_ERROR }
}
