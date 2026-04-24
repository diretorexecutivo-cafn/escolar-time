import { createClient } from '@/lib/supabase/server'
import { SubjectsTable } from '@/components/subjects/subjects-table'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function SubjectsPage() {
  const supabase = await createClient()

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name, code, color, active')
    .eq('tenant_id', TENANT_ID)
    .order('name')

  return <SubjectsTable subjects={subjects ?? []} />
}
