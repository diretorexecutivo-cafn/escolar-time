import { createClient } from '@/lib/supabase/server'
import { ClassesTable } from '@/components/classes/classes-table'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function ClassesPage() {
  const supabase = await createClient()

  const [{ data: classes }, { data: units }] = await Promise.all([
    supabase
      .from('class_groups')
      .select('id, name, shift, year, active, school_units(id, name)')
      .eq('tenant_id', TENANT_ID)
      .order('name'),
    supabase
      .from('school_units')
      .select('id, name')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
  ])

  return <ClassesTable classes={classes ?? []} units={units ?? []} />
}
