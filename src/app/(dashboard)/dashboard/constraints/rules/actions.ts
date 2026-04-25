'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type GlobalRuleType =
  | 'SINGLE_UNIT_PER_DAY'
  | 'MIN_GAP_CROSS_UNIT'
  | 'BALANCE_DAILY_LOAD'
  | 'SPREAD_SUBJECT'
  | 'AVOID_LAST_SLOT'
  | 'DOUBLE_LESSONS_PREFERRED_SLOTS'
  | 'RESPECT_BASELINE'
  | 'CUSTOM'

type CreateGlobalRuleData = {
  type: GlobalRuleType
  priority: 'MANDATORY' | 'PREFERRED'
  weight: number
  params?: Record<string, unknown> | null
  description?: string | null
}

type ActionResult = { success: boolean; error?: string }

export async function createGlobalRule(data: CreateGlobalRuleData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('global_rules').insert({
    tenant_id: TENANT_ID,
    type: data.type,
    priority: data.priority,
    weight: data.weight,
    params: data.params ?? null,
    description: data.description ?? null,
    active: true,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints/rules')
  return { success: true }
}

export async function updateGlobalRuleWeight(
  id: string,
  weight: number
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('global_rules')
    .update({ weight })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints/rules')
  return { success: true }
}

export async function updateGlobalRuleParams(
  id: string,
  params: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('global_rules')
    .update({ params })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints/rules')
  return { success: true }
}

export async function toggleGlobalRule(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: rule, error: fetchError } = await supabase
    .from('global_rules')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !rule) return { success: false, error: 'Regra não encontrada.' }

  const { error } = await supabase
    .from('global_rules')
    .update({ active: !rule.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints/rules')
  return { success: true }
}

export async function deleteGlobalRule(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('global_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/constraints/rules')
  return { success: true }
}
