'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type FormData = {
  name: string
  email?: string
  phone?: string
  max_daily_lessons?: number | null
  max_weekly_lessons?: number | null
}

type ActionResult = { success: boolean; error?: string }

export async function createTeacher(data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('teachers').insert({
    tenant_id: TENANT_ID,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    max_daily_lessons: data.max_daily_lessons ?? null,
    max_weekly_lessons: data.max_weekly_lessons ?? null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/teachers')
  return { success: true }
}

export async function updateTeacher(id: string, data: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('teachers')
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      max_daily_lessons: data.max_daily_lessons ?? null,
      max_weekly_lessons: data.max_weekly_lessons ?? null,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/teachers')
  return { success: true }
}

export async function toggleTeacherStatus(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: teacher, error: fetchError } = await supabase
    .from('teachers')
    .select('active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !teacher) return { success: false, error: 'Professor não encontrado.' }

  const { error } = await supabase
    .from('teachers')
    .update({ active: !teacher.active })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/teachers')
  return { success: true }
}
