import { createClient } from '@/lib/supabase/server'
import { ClassForm } from '@/components/classes/class-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function NewClassPage() {
  const supabase = await createClient()

  const { data: units } = await supabase
    .from('school_units')
    .select('id, name')
    .eq('tenant_id', TENANT_ID)
    .eq('active', true)
    .order('name')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Turma</h1>
        <p className="text-slate text-sm mt-1">Cadastre uma nova turma.</p>
      </div>
      <ClassForm units={units ?? []} />
    </div>
  )
}
