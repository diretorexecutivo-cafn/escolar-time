import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GridForm } from '@/components/grids/grid-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

async function loadVigencias(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from('time_grids').select('vigencia').eq('tenant_id', TENANT_ID)
  return [...new Set((data ?? []).map((g) => g.vigencia).filter((v): v is string => !!v))].sort(
    (a, b) => b.localeCompare(a, 'pt-BR', { numeric: true })
  )
}

interface EditGridPageProps {
  params: Promise<{ id: string }>
}

type DbSlot = {
  id: string
  day_of_week: number
  slot_order: number
  duration_minutes: number
  type: string
  label: string | null
}

export default async function EditGridPage({ params }: EditGridPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: grid }, { data: classGroups }, vigencias] = await Promise.all([
    supabase
      .from('time_grids')
      .select(
        'id, name, shift, start_time, days_of_week, active, vigencia, class_group_id, school_unit_id, time_slots(id, day_of_week, slot_order, duration_minutes, type, label)'
      )
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)
      .single(),
    supabase
      .from('class_groups')
      .select('id, name, school_units(id, name)')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
    loadVigencias(supabase),
  ])

  if (!grid) notFound()

  const allSlots = (grid.time_slots as DbSlot[] | null) ?? []

  // Group by day_of_week, sorted by slot_order
  const slotsByDay: Record<number, DbSlot[]> = {}
  for (const slot of allSlots) {
    if (!slotsByDay[slot.day_of_week]) slotsByDay[slot.day_of_week] = []
    slotsByDay[slot.day_of_week].push(slot)
  }
  for (const day of Object.keys(slotsByDay)) {
    slotsByDay[Number(day)].sort((a, b) => a.slot_order - b.slot_order)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Grade Horária</h1>
        <p className="text-slate text-sm mt-1">
          Atualize os horários de aulas e intervalos por dia da semana.
        </p>
      </div>
      <GridForm
        classGroups={classGroups ?? []}
        vigencias={vigencias}
        initialData={{
          id: grid.id,
          class_group_id: grid.class_group_id,
          name: grid.name,
          vigencia: grid.vigencia ?? '',
          shift: grid.shift,
          start_time: grid.start_time ?? '07:00',
          days_of_week: grid.days_of_week ?? [],
          active: grid.active,
          slotsByDay,
        }}
      />
    </div>
  )
}
