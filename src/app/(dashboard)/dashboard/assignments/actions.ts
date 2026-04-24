'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type ActionResult = { success: boolean; error?: string }

export async function assignTeacher(
  classSubjectId: string,
  teacherId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('teaching_assignments')
    .upsert(
      { class_subject_id: classSubjectId, teacher_id: teacherId },
      { onConflict: 'class_subject_id' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/assignments')
  return { success: true }
}

export async function removeAssignment(classSubjectId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('teaching_assignments')
    .delete()
    .eq('class_subject_id', classSubjectId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/assignments')
  return { success: true }
}

export async function addSubjectToClass(
  classGroupId: string,
  subjectId: string,
  weeklyLessons: number,
  allowDoubleLesson: boolean
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('class_subjects').insert({
    class_group_id: classGroupId,
    subject_id: subjectId,
    weekly_lessons: weeklyLessons,
    allow_double_lesson: allowDoubleLesson,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/assignments')
  return { success: true }
}

export async function removeSubjectFromClass(classSubjectId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('class_subjects')
    .delete()
    .eq('id', classSubjectId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/assignments')
  return { success: true }
}
