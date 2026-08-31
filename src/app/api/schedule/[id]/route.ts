import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

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

  // schedule_entries tem ON DELETE CASCADE — remover o horário já limpa as aulas.
  const { data, error } = await adminSupabase
    .from('generated_schedules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
