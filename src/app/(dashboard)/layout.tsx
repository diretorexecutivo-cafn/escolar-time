import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { CanEditProvider } from '@/components/auth/can-edit'
import { canEdit } from '@/lib/auth/roles'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // A RLS esconde o perfil de usuário desativado: sem perfil ativo, sem acesso.
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (!profile) redirect('/auth/signout?error=inactive')

  const editor = canEdit(profile.role)

  return (
    <CanEditProvider canEdit={editor}>
      <div className="flex min-h-screen">
        <Sidebar
          userName={profile.name ?? user.email ?? 'Usuário'}
          userEmail={profile.email ?? user.email ?? ''}
          isAdmin={profile.role === 'ADMIN'}
          canEdit={editor}
        />
        <main className="flex-1 bg-white overflow-y-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </CanEditProvider>
  )
}
