'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ─── Types ────────────────────────────────────────────────────────────────────

type GridData = {
  class_group_id: string | null
  name: string
  shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
  start_time: string
  days_of_week: number[]
}

/** LESSON = aula · BREAK = intervalo · ROUTINE = atividade fixa (não é aula nem intervalo). */
type SlotKind = 'LESSON' | 'BREAK' | 'ROUTINE'

type SlotData = {
  slot_order: number
  duration_minutes: number
  start_time: string
  end_time: string
  type: SlotKind
  label?: string
}

type SlotsByDay = Record<number, SlotData[]>

type ActionResult = { success: boolean; error?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSchoolUnitId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  classGroupId: string
): Promise<{ school_unit_id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('class_groups')
    .select('school_unit_id')
    .eq('id', classGroupId)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (error || !data) return { school_unit_id: null, error: 'Turma não encontrada.' }
  return { school_unit_id: data.school_unit_id, error: null }
}

function flattenSlots(slotsByDay: SlotsByDay, gridId: string) {
  const rows: Array<{
    time_grid_id: string
    day_of_week: number
    slot_order: number
    duration_minutes: number
    start_time: string
    end_time: string
    type: SlotKind
    label: string | null
  }> = []

  for (const [dayStr, slots] of Object.entries(slotsByDay)) {
    const day = Number(dayStr)
    slots.forEach((slot, idx) => {
      rows.push({
        time_grid_id: gridId,
        day_of_week: day,
        slot_order: idx + 1,
        duration_minutes: slot.duration_minutes,
        start_time: slot.start_time,
        end_time: slot.end_time,
        type: slot.type,
        label: slot.label ?? null,
      })
    })
  }

  return rows
}

/**
 * Sincroniza os slots da grade sem apagar tudo: slots existentes na mesma posição
 * (dia + ordem) são atualizados no lugar, mantendo o id — isso preserva as referências
 * de horários já gerados (schedule_entries.time_slot_id). Só insere os novos e remove
 * os que deixaram de existir.
 */
async function syncTimeSlots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gridId: string,
  rows: ReturnType<typeof flattenSlots>
): Promise<string | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('time_slots')
    .select('id, day_of_week, slot_order')
    .eq('time_grid_id', gridId)

  if (fetchError) return fetchError.message

  const key = (day: number, order: number) => `${day}:${order}`
  const existingByKey = new Map(
    (existing ?? []).map((s) => [key(s.day_of_week, s.slot_order), s.id as string])
  )
  const keptKeys = new Set<string>()
  const toInsert: typeof rows = []

  for (const row of rows) {
    const k = key(row.day_of_week, row.slot_order)
    const slotId = existingByKey.get(k)
    if (!slotId) {
      toInsert.push(row)
      continue
    }
    keptKeys.add(k)
    const { error } = await supabase
      .from('time_slots')
      .update({
        duration_minutes: row.duration_minutes,
        start_time: row.start_time,
        end_time: row.end_time,
        type: row.type,
        label: row.label,
      })
      .eq('id', slotId)
    if (error) return error.message
  }

  const toDeleteIds = [...existingByKey.entries()]
    .filter(([k]) => !keptKeys.has(k))
    .map(([, slotId]) => slotId)

  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from('time_slots').delete().in('id', toDeleteIds)
    if (error) {
      if (error.code === '23503') {
        return 'Não é possível remover horários que já são usados em um horário gerado. Exclua esse horário gerado antes ou mantenha a quantidade de slots.'
      }
      return error.message
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('time_slots').insert(toInsert)
    if (error) return error.message
  }

  return null
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function createTimeGrid(
  gridData: GridData,
  slotsByDay: SlotsByDay
): Promise<ActionResult> {
  const supabase = await createClient()

  if (!gridData.class_group_id) return { success: false, error: 'Turma é obrigatória.' }

  const { school_unit_id, error: resolveError } = await resolveSchoolUnitId(
    supabase,
    gridData.class_group_id
  )
  if (resolveError || !school_unit_id) return { success: false, error: resolveError ?? 'Turma inválida.' }

  const { data: grid, error: gridError } = await supabase
    .from('time_grids')
    .insert({
      tenant_id: TENANT_ID,
      school_unit_id,
      class_group_id: gridData.class_group_id,
      name: gridData.name,
      shift: gridData.shift,
      start_time: gridData.start_time,
      days_of_week: gridData.days_of_week,
      active: true,
    })
    .select('id')
    .single()

  if (gridError || !grid) {
    return { success: false, error: gridError?.message ?? 'Erro ao criar grade.' }
  }

  const rows = flattenSlots(slotsByDay, grid.id)
  if (rows.length > 0) {
    const { error: slotsError } = await supabase.from('time_slots').insert(rows)
    if (slotsError) return { success: false, error: slotsError.message }
  }

  revalidatePath('/dashboard/grids')
  return { success: true }
}

export async function updateTimeGrid(
  id: string,
  gridData: GridData,
  slotsByDay: SlotsByDay
): Promise<ActionResult> {
  const supabase = await createClient()

  if (!gridData.class_group_id) return { success: false, error: 'Turma é obrigatória.' }

  const { school_unit_id, error: resolveError } = await resolveSchoolUnitId(
    supabase,
    gridData.class_group_id
  )
  if (resolveError || !school_unit_id) return { success: false, error: resolveError ?? 'Turma inválida.' }

  const { error: gridError } = await supabase
    .from('time_grids')
    .update({
      school_unit_id,
      class_group_id: gridData.class_group_id,
      name: gridData.name,
      shift: gridData.shift,
      start_time: gridData.start_time,
      days_of_week: gridData.days_of_week,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (gridError) return { success: false, error: gridError.message }

  const syncError = await syncTimeSlots(supabase, id, flattenSlots(slotsByDay, id))
  if (syncError) return { success: false, error: syncError }

  revalidatePath('/dashboard/grids')
  return { success: true }
}

export async function duplicateTimeGrid(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: original, error: fetchError } = await supabase
    .from('time_grids')
    .select(
      'school_unit_id, name, shift, start_time, days_of_week, active, time_slots(day_of_week, slot_order, duration_minutes, start_time, end_time, type, label)'
    )
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !original) return { success: false, error: 'Grade original não encontrada.' }

  const { data: newGrid, error: insertError } = await supabase
    .from('time_grids')
    .insert({
      tenant_id: TENANT_ID,
      school_unit_id: original.school_unit_id,
      class_group_id: null,
      name: `${original.name} (cópia)`,
      shift: original.shift,
      start_time: original.start_time,
      days_of_week: original.days_of_week,
      active: original.active,
    })
    .select('id')
    .single()

  if (insertError || !newGrid) {
    return { success: false, error: insertError?.message ?? 'Erro ao duplicar grade.' }
  }

  const originalSlots = (original.time_slots ?? []) as Array<{
    day_of_week: number
    slot_order: number
    duration_minutes: number
    start_time: string
    end_time: string
    type: SlotKind
    label: string | null
  }>

  if (originalSlots.length > 0) {
    const { error: slotsError } = await supabase.from('time_slots').insert(
      originalSlots.map((s) => ({
        time_grid_id: newGrid.id,
        day_of_week: s.day_of_week,
        slot_order: s.slot_order,
        duration_minutes: s.duration_minutes,
        start_time: s.start_time,
        end_time: s.end_time,
        type: s.type,
        label: s.label,
      }))
    )
    if (slotsError) return { success: false, error: slotsError.message }
  }

  revalidatePath('/dashboard/grids')
  return { success: true }
}

export async function toggleGridStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: grid, error: fetchError } = await supabase
    .from('time_grids')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !grid) return { success: false, error: 'Grade não encontrada.' }

  const { error } = await supabase
    .from('time_grids')
    .update({ active: !grid.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/grids')
  return { success: true }
}
