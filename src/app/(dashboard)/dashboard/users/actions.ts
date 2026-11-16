'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { getAdminProfile, type SessionProfile } from '@/lib/auth/session'
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/allowed-domain'

type ActionResult = { success: boolean; error?: string }

const roleSchema = z.enum(['ADMIN', 'COORDINATOR', 'VIEWER'])

const createSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine(isAllowedEmail, `Use um e-mail @${ALLOWED_EMAIL_DOMAIN}`),
  role: roleSchema,
})

const updateSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  role: roleSchema,
})

const NOT_ADMIN: ActionResult = {
  success: false,
  error: 'Apenas administradores podem gerenciar usuários.',
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

/** Há outro administrador ativo além de `exceptId`? Evita trancar o sistema. */
async function hasOtherActiveAdmin(admin: SessionProfile, exceptId: string) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', admin.tenant_id)
    .eq('role', 'ADMIN')
    .eq('active', true)
    .neq('id', exceptId)
  return (count ?? 0) > 0
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const found = data.users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found.id
    if (data.users.length < 200) return null
  }
  return null
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
  const { name, email, role } = parsed.data

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', admin.tenant_id)
    .eq('email', email)
    .maybeSingle()
  if (existing) return { success: false, error: 'Já existe um usuário com este e-mail.' }

  // A conta de login (auth.users) nasce sem senha: a pessoa entra com o Google
  // da escola, ou define uma senha em "Esqueci minha senha".
  let authUserId: string | null = null
  let createdAuthUser = false

  const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  })

  if (created?.user) {
    authUserId = created.user.id
    createdAuthUser = true
  } else {
    // A conta pode já existir (ex.: tentou entrar com o Google antes de ter perfil).
    authUserId = await findAuthUserIdByEmail(email)
    if (!authUserId) {
      return {
        success: false,
        error: `Não foi possível criar a conta: ${createError?.message ?? 'erro desconhecido'}`,
      }
    }
  }

  // Inserido com o cliente do admin logado: a RLS confere o papel e o histórico
  // registra quem criou.
  const { error: insertError } = await supabase.from('profiles').insert({
    id: authUserId,
    tenant_id: admin.tenant_id,
    name,
    email,
    role,
    active: true,
  })

  if (insertError) {
    if (createdAuthUser) await adminSupabase.auth.admin.deleteUser(authUserId)
    return { success: false, error: insertError.message }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
  const { name, role } = parsed.data

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', id)
    .eq('tenant_id', admin.tenant_id)
    .maybeSingle()
  if (!target) return { success: false, error: 'Usuário não encontrado.' }

  if (target.role === 'ADMIN' && role !== 'ADMIN') {
    if (id === admin.id) {
      return { success: false, error: 'Você não pode remover o seu próprio papel de administrador.' }
    }
    if (target.active && !(await hasOtherActiveAdmin(admin, id))) {
      return { success: false, error: 'O sistema precisa de pelo menos um administrador ativo.' }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ name, role })
    .eq('id', id)
    .eq('tenant_id', admin.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/users')
  revalidatePath('/dashboard', 'layout')
  return { success: true }
}

export async function toggleUserActive(id: string): Promise<ActionResult> {
  const admin = await getAdminProfile()
  if (!admin) return NOT_ADMIN

  if (id === admin.id) {
    return { success: false, error: 'Você não pode desativar o seu próprio acesso.' }
  }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', id)
    .eq('tenant_id', admin.tenant_id)
    .maybeSingle()
  if (!target) return { success: false, error: 'Usuário não encontrado.' }

  if (target.active && target.role === 'ADMIN' && !(await hasOtherActiveAdmin(admin, id))) {
    return { success: false, error: 'O sistema precisa de pelo menos um administrador ativo.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active: !target.active })
    .eq('id', id)
    .eq('tenant_id', admin.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/users')
  return { success: true }
}
