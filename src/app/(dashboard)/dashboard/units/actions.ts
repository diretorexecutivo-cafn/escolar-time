'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type FormData = {
  name: string
  code: string
  address?: string
}

type ActionResult = { success: boolean; error?: string }

export async function createUnit(data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('school_units').insert({
    tenant_id: TENANT_ID,
    name: data.name,
    code: data.code.toUpperCase(),
    address: data.address ?? null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/units')
  return { success: true }
}

export async function updateUnit(id: string, data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('school_units')
    .update({
      name: data.name,
      code: data.code.toUpperCase(),
      address: data.address ?? null,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/units')
  return { success: true }
}

export async function toggleUnitStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: unit, error: fetchError } = await supabase
    .from('school_units')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !unit) return { success: false, error: 'Unidade não encontrada.' }

  const { error } = await supabase
    .from('school_units')
    .update({ active: !unit.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/units')
  return { success: true }
}
