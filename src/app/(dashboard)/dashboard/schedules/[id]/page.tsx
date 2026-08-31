import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ScheduleGrid } from '@/components/schedule/schedule-grid'

type Props = {
  params: Promise<{ id: string }>
}

type GridSlotRow = {
  id: string
  day_of_week: number | null
  slot_order: number
  start_time: string
  end_time: string
  type: string | null
  label: string | null
}

export default async function ScheduleDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: schedule } = await supabase
    .from('generated_schedules')
    .select('id, name, status, score, violations, config_snapshot, created_at')
    .eq('id', id)
    .single()

  if (!schedule) notFound()

  if (schedule.status === 'FAILED') {
    const errors = Array.isArray(schedule.violations)
      ? (schedule.violations as string[])
      : []
    const snapshot = (schedule.config_snapshot ?? {}) as { warnings?: string[] }
    const warnings = snapshot.warnings ?? []

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">{schedule.name}</h1>
          <p className="text-slate text-sm mt-1">Este horário falhou durante a geração.</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-6 space-y-3">
          <p className="font-semibold text-red-700">Erros encontrados:</p>
          {errors.length === 0 ? (
            <p className="text-sm text-red-600">Erro desconhecido.</p>
          ) : (
            <ul className="list-disc list-inside space-y-1">
              {errors.map((err, i) => (
                <li key={i} className="text-sm text-red-600">
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-6 space-y-2">
            <p className="font-semibold text-amber-800">Avisos:</p>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-700">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const { data: entries } = await supabase
    .from('schedule_entries')
    .select(`
      id,
      day_of_week,
      locked,
      time_slot_id,
      teaching_assignments (
        id,
        teachers ( id, name ),
        class_subjects (
          id,
          subjects ( id, name, color ),
          class_groups (
            id,
            name,
            school_units ( id, name )
          )
        )
      )
    `)
    .eq('generated_schedule_id', id)
    .order('day_of_week')

  // A grade completa não pode ser derivada das entradas: intervalos e horários
  // vagos não geram schedule_entries, e cada dia tem um número diferente de aulas.
  const classGroupIds = Array.from(
    new Set(
      (entries ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => e.teaching_assignments?.class_subjects?.class_groups?.id)
        .filter((v): v is string => typeof v === 'string')
    )
  )

  const { data: grids } = classGroupIds.length
    ? await supabase
        .from('time_grids')
        .select(
          'id, class_group_id, time_slots (id, day_of_week, slot_order, start_time, end_time, type, label)'
        )
        .in('class_group_id', classGroupIds)
        .eq('active', true)
    : { data: [] }

  const gridsByClass = (grids ?? []).map((g) => ({
    classGroupId: g.class_group_id as string,
    slots: ((g.time_slots ?? []) as GridSlotRow[]).filter((s) => s.day_of_week != null),
  }))

  return (
    <ScheduleGrid
      schedule={schedule}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries={(entries ?? []) as any}
      grids={gridsByClass}
    />
  )
}
