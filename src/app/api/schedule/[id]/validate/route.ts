import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateEditedSchedule } from '@/engine/index'
import {
  TENANT_ID,
  badRequest,
  lessonsSchema,
  loadEditableSchedule,
  parseJson,
} from '@/lib/schedule-edit'

const bodySchema = z.object({ entries: lessonsSchema })

/** Valida um rascunho de edição manual. Não grava nada. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const loaded = await loadEditableSchedule(id)
  if (!loaded.ok) return loaded.response

  const parsed = bodySchema.safeParse(await parseJson(request))
  if (!parsed.success) return badRequest(parsed.error)

  try {
    const result = await validateEditedSchedule(
      TENANT_ID,
      parsed.data.entries,
      loaded.schedule.config_snapshot?.baselineScheduleId ?? undefined,
      loaded.schedule.baseline_weight
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'
    return NextResponse.json({ error: `Erro ao validar: ${message}` }, { status: 500 })
  }
}
