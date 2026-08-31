import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { data: schedule, error: fetchError } = await adminSupabase
    .from('generated_schedules')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (fetchError || !schedule) {
    return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 })
  }
  if (schedule.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: 'Apenas horários concluídos podem ser usados como baseline.' },
      { status: 400 }
    )
  }

  // Baseline é exclusivo por tenant: desmarca o anterior antes de marcar o novo.
  const { error: clearError } = await adminSupabase
    .from('generated_schedules')
    .update({ is_baseline: false })
    .eq('tenant_id', TENANT_ID)
    .eq('is_baseline', true)

  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 })
  }

  const { error: setError } = await adminSupabase
    .from('generated_schedules')
    .update({ is_baseline: true })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (setError) {
    return NextResponse.json({ error: setError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
