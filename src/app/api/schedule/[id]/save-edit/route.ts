import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminSupabase } from '@/lib/supabase/admin'
import { validateEditedSchedule } from '@/engine/index'
import {
  TENANT_ID,
  badRequest,
  lessonsSchema,
  loadEditableSchedule,
  parseJson,
} from '@/lib/schedule-edit'

const bodySchema = z.object({
  /** replace = o original vai para o histórico de apagados; copy = o original permanece. */
  mode: z.enum(['replace', 'copy']),
  name: z.string().trim().max(200).optional(),
  entries: lessonsSchema,
})

/**
 * Salva uma edição manual como um NOVO horário. A validação roda de novo aqui:
 * o cliente não é confiável e os cadastros podem ter mudado desde a última validação.
 * Violações obrigatórias bloqueiam o salvamento (422).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const loaded = await loadEditableSchedule(id)
  if (!loaded.ok) return loaded.response
  const { userId, schedule: original } = loaded

  const parsed = bodySchema.safeParse(await parseJson(request))
  if (!parsed.success) return badRequest(parsed.error)
  const { mode, entries } = parsed.data

  const baselineScheduleId = original.config_snapshot?.baselineScheduleId ?? null

  let result
  try {
    result = await validateEditedSchedule(
      TENANT_ID,
      entries,
      baselineScheduleId ?? undefined,
      original.baseline_weight
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'
    return NextResponse.json({ error: `Erro ao validar: ${message}` }, { status: 500 })
  }

  if (!result.valid) {
    return NextResponse.json(
      { error: 'O horário tem violações obrigatórias e não pode ser salvo.', validation: result },
      { status: 422 }
    )
  }

  const name =
    parsed.data.name ||
    (mode === 'replace' ? original.name : `${original.name} (editado)`)

  // 1. Novo horário
  const { data: created, error: insertError } = await adminSupabase
    .from('generated_schedules')
    .insert({
      tenant_id: TENANT_ID,
      name,
      status: 'COMPLETED',
      score: result.score,
      violations: result.softViolations,
      baseline_weight: original.baseline_weight,
      created_by: userId,
      config_snapshot: {
        manualEdit: true,
        editedFrom: original.id,
        editMode: mode,
        baselineScheduleId,
        warnings: [],
      },
    })
    .select('id')
    .single()

  if (insertError || !created) {
    return NextResponse.json(
      { error: `Erro ao criar o horário editado: ${insertError?.message ?? ''}` },
      { status: 500 }
    )
  }

  // 2. Aulas
  const { error: entriesError } = await adminSupabase.from('schedule_entries').insert(
    entries.map((e) => ({
      generated_schedule_id: created.id,
      teaching_assignment_id: e.assignmentId,
      day_of_week: e.day,
      time_slot_id: e.slotId,
      locked: false,
    }))
  )

  if (entriesError) {
    // Registro novo sem aulas não serve para nada — remove (não é um horário do usuário ainda).
    await adminSupabase.from('generated_schedules').delete().eq('id', created.id)
    return NextResponse.json(
      { error: `Erro ao gravar as aulas: ${entriesError.message}` },
      { status: 500 }
    )
  }

  // 3. Substituição: o novo herda o baseline e o original vai para o histórico de apagados.
  if (mode === 'replace') {
    if (original.is_baseline) {
      await adminSupabase
        .from('generated_schedules')
        .update({ is_baseline: false })
        .eq('tenant_id', TENANT_ID)
        .eq('is_baseline', true)
      await adminSupabase
        .from('generated_schedules')
        .update({ is_baseline: true })
        .eq('id', created.id)
    }

    const { error: deleteError } = await adminSupabase
      .from('generated_schedules')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deleted_reason: 'replaced_by_edit',
        replaced_by: created.id,
        is_baseline: false,
      })
      .eq('id', original.id)
      .eq('tenant_id', TENANT_ID)

    if (deleteError) {
      // O novo já está salvo; o original só não saiu da lista. Avisamos sem desfazer.
      return NextResponse.json({
        scheduleId: created.id,
        warning: `Horário salvo, mas o original não pôde ser apagado: ${deleteError.message}`,
      })
    }
  }

  return NextResponse.json({ scheduleId: created.id, score: result.score })
}
