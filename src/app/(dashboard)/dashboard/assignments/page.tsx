import { createClient } from '@/lib/supabase/server'
import { AssignmentsManager } from '@/components/assignments/assignments-manager'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function AssignmentsPage() {
  const supabase = await createClient()

  const { data: units } = await supabase
    .from('school_units')
    .select('id, name')
    .eq('tenant_id', TENANT_ID)
    .eq('active', true)
    .order('name')

  return <AssignmentsManager units={units ?? []} />
}
