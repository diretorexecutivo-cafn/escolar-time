import { createClient } from '@/lib/supabase/server'
import { UnitsTable } from '@/components/units/units-table'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function UnitsPage() {
  const supabase = await createClient()

  const { data: units } = await supabase
    .from('school_units')
    .select('id, name, code, address, active, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('name')

  return <UnitsTable units={units ?? []} />
}
