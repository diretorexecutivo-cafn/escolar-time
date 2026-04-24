import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TeacherForm } from '@/components/teachers/teacher-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, name, active')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single()

  if (!teacher) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Editar Professor</h1>
        <p className="text-slate text-sm mt-1">Altere os dados do professor.</p>
      </div>
      <TeacherForm initialData={teacher} />
    </div>
  )
}
