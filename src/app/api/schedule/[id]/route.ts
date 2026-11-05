import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Exclusão lógica: o horário some da listagem, mas fica no histórico de apagados
 * (com as aulas preservadas) registrando quem apagou e quando.
 */
export async function DELETE(
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

  const { data, error } = await adminSupabase
    .from('generated_schedules')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      deleted_reason: 'manual',
      is_baseline: false,
    })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
