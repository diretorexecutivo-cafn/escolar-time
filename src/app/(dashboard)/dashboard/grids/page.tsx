import { createClient } from '@/lib/supabase/server'
import { GridsTable } from '@/components/grids/grids-table'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function GridsPage() {
  const supabase = await createClient()

  const { data: grids } = await supabase
    .from('time_grids')
    .select(
      'id, name, shift, days_of_week, start_time, active, class_group_id, class_groups(id, name, school_units(id, name)), time_slots(id, type, day_of_week)'
    )
    .eq('tenant_id', TENANT_ID)
    .order('name')

  return <GridsTable grids={grids ?? []} />
}
