import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UnitForm } from '@/components/units/unit-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: unit } = await supabase
    .from('school_units')
    .select('id, name, code, address, active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (!unit) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Unidade Escolar</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da unidade.</p>
      </div>
      <UnitForm initialData={unit} />
    </div>
  )
}
