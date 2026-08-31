import { createClient } from '@/lib/supabase/server'
import { SchedulesHistory } from '@/components/schedule/schedules-history'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function SchedulesPage() {
  const supabase = await createClient()

  const { data: schedules } = await supabase
    .from('generated_schedules')
    .select('id, name, created_at, status, score, is_baseline, violations, created_by, profiles(id, name)')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SchedulesHistory schedules={(schedules ?? []) as any} />
}
