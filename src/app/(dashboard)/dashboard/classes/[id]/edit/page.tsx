import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClassForm } from '@/components/classes/class-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: classGroup }, { data: units }] = await Promise.all([
    supabase
      .from('class_groups')
      .select('id, name, shift, year, active, school_unit_id')
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)
      .single(),
    supabase
      .from('school_units')
      .select('id, name')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
  ])

  if (!classGroup) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Turma</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da turma.</p>
      </div>
      <ClassForm initialData={classGroup} units={units ?? []} />
    </div>
  )
}
