'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type FormData = {
  school_unit_id: string
  name: string
  shift: 'MORNING' | 'AFTERNOON' | 'EVENING'
  year: number
}

type ActionResult = { success: boolean; error?: string }

export async function createClass(data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('class_groups').insert({
    tenant_id: TENANT_ID,
    school_unit_id: data.school_unit_id,
    name: data.name,
    shift: data.shift,
    year: data.year,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/classes')
  return { success: true }
}

export async function updateClass(id: string, data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('class_groups')
    .update({
      school_unit_id: data.school_unit_id,
      name: data.name,
      shift: data.shift,
      year: data.year,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/classes')
  return { success: true }
}

export async function toggleClassStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: classGroup, error: fetchError } = await supabase
    .from('class_groups')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !classGroup) return { success: false, error: 'Turma não encontrada.' }

  const { error } = await supabase
    .from('class_groups')
    .update({ active: !classGroup.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/classes')
  return { success: true }
}
