import { createClient } from '@/lib/supabase/server'
import { GenerateScheduleForm } from '@/components/schedule/generate-schedule-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function GeneratePage() {
  const supabase = await createClient()

  const [{ data: schedules }, { data: grids }] = await Promise.all([
    supabase
      .from('generated_schedules')
      .select('id, name, created_at, score, status')
      .eq('tenant_id', TENANT_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('time_grids').select('vigencia').eq('tenant_id', TENANT_ID).eq('active', true),
  ])

  const vigencias = [
    ...new Set((grids ?? []).map((g) => g.vigencia).filter((v): v is string => !!v)),
  ].sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }))
  const hasNoVigencia = (grids ?? []).some((g) => !g.vigencia)

  return (
    <GenerateScheduleForm
      existingSchedules={schedules ?? []}
      vigencias={vigencias}
      hasNoVigencia={hasNoVigencia}
    />
  )
}
