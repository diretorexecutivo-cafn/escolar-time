import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { getAdminProfile } from '@/lib/auth/session'
import { UsersTable } from '@/components/users/users-table'

export default async function UsersPage() {
  const admin = await getAdminProfile()
  if (!admin) redirect('/dashboard')

  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, created_at')
    .eq('tenant_id', admin.tenant_id)
    .order('name')

  // Último acesso vem das contas de login (auth.users), só visíveis à service-role.
  const lastSignIn = new Map<string, string | null>()
  const { data: authUsers } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
  for (const u of authUsers?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null)

  const users = (profiles ?? []).map((p) => ({
    ...p,
    last_sign_in_at: lastSignIn.get(p.id) ?? null,
  }))

  return <UsersTable users={users} currentUserId={admin.id} />
}
