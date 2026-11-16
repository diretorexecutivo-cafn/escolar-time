import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth/session'
import { UserForm } from '@/components/users/user-form'
import type { RoleKey } from '@/lib/auth/roles'

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await getAdminProfile()
  if (!admin) redirect('/dashboard')

  const { id } = await params
  const supabase = await createClient()

  const { data: user } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', id)
    .eq('tenant_id', admin.tenant_id)
    .maybeSingle()

  if (!user) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Usuário</h1>
        <p className="text-slate text-sm mt-1">Altere o nome e o papel do usuário.</p>
      </div>
      <UserForm
        initialData={{ ...user, role: user.role as RoleKey }}
        isSelf={user.id === admin.id}
      />
    </div>
  )
}
