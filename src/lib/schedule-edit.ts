import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

export const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export const lessonsSchema = z
  .array(
    z.object({
      assignmentId: z.string().min(1),
      day: z.number().int().min(0).max(6),
      slotId: z.string().min(1),
    })
  )
  .min(1, 'O horário não tem aulas.')
  .max(10000)

export type EditableSchedule = {
  id: string
  name: string
  is_baseline: boolean
  baseline_weight: number
  config_snapshot: { baselineScheduleId?: string | null; [k: string]: unknown } | null
}

type Ok<T> = { ok: true } & T
type Fail = { ok: false; response: NextResponse }

/** Usuário logado + horário editável (concluído e não apagado) do tenant. */
export async function loadEditableSchedule(
  id: string
): Promise<Ok<{ userId: string; schedule: EditableSchedule }> | Fail> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  }

  const { data: schedule } = await adminSupabase
    .from('generated_schedules')
    .select('id, name, status, is_baseline, baseline_weight, config_snapshot, deleted_at')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (!schedule || schedule.deleted_at) {
    return { ok: false, response: NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 }) }
  }
  if (schedule.status !== 'COMPLETED') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Só horários concluídos podem ser editados.' }, { status: 400 }),
    }
  }

  return { ok: true, userId: user.id, schedule: schedule as EditableSchedule }
}

export async function parseJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

export function badRequest(error: z.ZodError | string) {
  const message = typeof error === 'string' ? error : (error.issues[0]?.message ?? 'Body inválido.')
  return NextResponse.json({ error: message }, { status: 400 })
}
