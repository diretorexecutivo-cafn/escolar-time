import { createClient } from '@/lib/supabase/server'
import { GridForm } from '@/components/grids/grid-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function NewGridPage() {
  const supabase = await createClient()

  const { data: classGroups } = await supabase
    .from('class_groups')
    .select('id, name, school_units(id, name)')
    .eq('tenant_id', TENANT_ID)
    .eq('active', true)
    .order('name')

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Grade Horária</h1>
        <p className="text-slate text-sm mt-1">
          Configure os horários de aulas e intervalos para cada dia da semana.
        </p>
      </div>
      <GridForm classGroups={classGroups ?? []} />
    </div>
  )
}
