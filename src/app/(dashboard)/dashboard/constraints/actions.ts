'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type ConstraintType =
  | 'UNAVAILABLE_SLOT'
  | 'UNAVAILABLE_PERIOD'
  | 'MUST_START_AFTER'
  | 'MUST_END_BEFORE'
  | 'MAX_CONSECUTIVE'
  | 'MIN_GAP_BETWEEN_UNITS'
  | 'PREFER_SINGLE_UNIT_DAY'
  | 'MAX_LESSONS_PER_DAY'
  | 'NO_IDLE_GAPS'
  | 'PREFER_CONSECUTIVE'
  | 'FIXED_DAY'
  | 'AVOID_DAY'
  | 'CUSTOM'

type CreateConstraintData = {
  teacher_id: string
  type: ConstraintType
  priority: 'MANDATORY' | 'PREFERRED'
  days_of_week: number[]
  school_unit_id?: string | null
  subject_id?: string | null
  time_from?: string | null
  time_to?: string | null
  slot_order?: number | null
  min_gap_slots?: number | null
  value?: Record<string, unknown> | null
  description?: string | null
}

type ActionResult = { success: boolean; error?: string }

export async function createConstraint(data: CreateConstraintData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('teacher_constraints').insert({
    tenant_id: TENANT_ID,
    teacher_id: data.teacher_id,
    type: data.type,
    priority: data.priority,
    days_of_week: data.days_of_week,
    school_unit_id: data.school_unit_id ?? null,
    subject_id: data.subject_id ?? null,
    time_from: data.time_from ?? null,
    time_to: data.time_to ?? null,
    slot_order: data.slot_order ?? null,
    min_gap_slots: data.min_gap_slots ?? null,
    value: data.value ?? null,
    description: data.description ?? null,
    active: true,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints')
  return { success: true }
}

export async function toggleConstraintStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: constraint, error: fetchError } = await supabase
    .from('teacher_constraints')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !constraint) return { success: false, error: 'Restrição não encontrada.' }

  const { error } = await supabase
    .from('teacher_constraints')
    .update({ active: !constraint.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints')
  return { success: true }
}

export async function deleteConstraint(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('teacher_constraints')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints')
  return { success: true }
}
