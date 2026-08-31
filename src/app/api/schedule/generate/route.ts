import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { generateSchedule } from '@/engine/index'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// O solver tem timeout interno de 25s; damos folga para carga + otimização.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: { name?: string; baselineScheduleId?: string; baselineWeight?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const { name, baselineScheduleId, baselineWeight } = body

  if (!name || name.trim() === '') {
    return NextResponse.json({ error: 'O nome do horário é obrigatório.' }, { status: 400 })
  }

  const { data: scheduleRecord, error: insertError } = await adminSupabase
    .from('generated_schedules')
    .insert({
      tenant_id: TENANT_ID,
      name: name.trim(),
      status: 'GENERATING',
      created_by: user.id,
      baseline_weight: baselineWeight ?? 0.7,
    })
    .select('id')
    .single()

  if (insertError || !scheduleRecord) {
    return NextResponse.json({ error: 'Erro ao criar registro de horário.' }, { status: 500 })
  }

  const scheduleId = scheduleRecord.id

  try {
    const result = await generateSchedule(TENANT_ID, {
      name: name.trim(),
      baselineScheduleId,
      baselineWeight: baselineWeight ?? 0.7,
    })

    if (result.status === 'INFEASIBLE') {
      await adminSupabase
        .from('generated_schedules')
        .update({
          status: 'FAILED',
          violations: result.validationErrors ?? [],
          config_snapshot: { warnings: result.warnings ?? [], stats: result.stats },
        })
        .eq('id', scheduleId)

      return NextResponse.json({
        scheduleId,
        status: 'FAILED',
        errors: result.validationErrors ?? [],
        warnings: result.warnings ?? [],
      })
    }

    // SUCCESS ou PARTIAL — grava as aulas alocadas
    const entries = (result.solution?.entries ?? []).map((entry) => ({
      generated_schedule_id: scheduleId,
      teaching_assignment_id: entry.assignmentId,
      day_of_week: entry.day,
      time_slot_id: entry.slotId,
      locked: false,
    }))

    if (entries.length > 0) {
      const { error: entriesError } = await adminSupabase
        .from('schedule_entries')
        .insert(entries)

      if (entriesError) {
        await adminSupabase
          .from('generated_schedules')
          .update({
            status: 'FAILED',
            violations: [`Erro ao gravar as aulas do horário: ${entriesError.message}`],
          })
          .eq('id', scheduleId)

        return NextResponse.json({
          scheduleId,
          status: 'FAILED',
          errors: [`Erro ao gravar as aulas do horário: ${entriesError.message}`],
        })
      }
    }

    const partial = result.status === 'PARTIAL'

    await adminSupabase
      .from('generated_schedules')
      .update({
        status: 'COMPLETED',
        score: result.score,
        violations: result.violations,
        config_snapshot: {
          partial,
          stats: result.stats,
          warnings: result.warnings ?? [],
          baselineSimilarity: result.baselineSimilarity,
          baselineScheduleId: baselineScheduleId ?? null,
        },
      })
      .eq('id', scheduleId)

    return NextResponse.json({
      scheduleId,
      status: 'COMPLETED',
      partial,
      score: result.score,
      warnings: result.warnings ?? [],
      stats: result.stats,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.'

    await adminSupabase
      .from('generated_schedules')
      .update({ status: 'FAILED', violations: [message] })
      .eq('id', scheduleId)

    console.error('generateSchedule error:', err)
    return NextResponse.json(
      { scheduleId, status: 'FAILED', errors: [`Erro interno ao gerar horário: ${message}`] },
      { status: 500 }
    )
  }
}
