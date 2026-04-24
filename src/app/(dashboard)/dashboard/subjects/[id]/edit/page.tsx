import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SubjectForm } from '@/components/subjects/subject-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function EditSubjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: subject } = await supabase
    .from('subjects')
    .select('id, name, code, color, active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (!subject) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Disciplina</h1>
        <p className="text-slate text-sm mt-1">Altere os dados da disciplina.</p>
      </div>
      <SubjectForm initialData={subject} />
    </div>
  )
}
