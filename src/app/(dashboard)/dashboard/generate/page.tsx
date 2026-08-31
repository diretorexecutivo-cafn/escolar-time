import { createClient } from '@/lib/supabase/server'
import { GenerateScheduleForm } from '@/components/schedule/generate-schedule-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function GeneratePage() {
  const supabase = await createClient()

  const { data: schedules } = await supabase
    .from('generated_schedules')
    .select('id, name, created_at, score, status')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })

  return <GenerateScheduleForm existingSchedules={schedules ?? []} />
}
