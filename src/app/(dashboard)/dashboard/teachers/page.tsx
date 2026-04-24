import { createClient } from '@/lib/supabase/server'
import { TeachersTable } from '@/components/teachers/teachers-table'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function TeachersPage() {
  const supabase = await createClient()

  const { data: teachers } = await supabase
    .from('teachers')
    .select('id, name, active')
    .eq('tenant_id', TENANT_ID)
    .order('name')

  return <TeachersTable teachers={teachers ?? []} />
}
