'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type FormData = {
  name: string
  code: string
  color: string
  active?: boolean
}

type ActionResult = { success: boolean; error?: string }

export async function createSubject(data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('subjects').insert({
    tenant_id: TENANT_ID,
    name: data.name,
    code: data.code.toUpperCase(),
    color: data.color,
    active: data.active ?? true,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/subjects')
  return { success: true }
}

export async function updateSubject(id: string, data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('subjects')
    .update({
      name: data.name,
      code: data.code.toUpperCase(),
      color: data.color,
      active: data.active ?? true,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/subjects')
  return { success: true }
}

export async function toggleSubjectStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: subject, error: fetchError } = await supabase
    .from('subjects')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !subject) return { success: false, error: 'Disciplina não encontrada.' }

  const { error } = await supabase
    .from('subjects')
    .update({ active: !subject.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/subjects')
  return { success: true }
}
