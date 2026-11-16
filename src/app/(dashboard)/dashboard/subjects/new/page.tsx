import { redirect } from 'next/navigation'
import { getEditorProfile } from '@/lib/auth/session'
import { SubjectForm } from '@/components/subjects/subject-form'

export default async function NewSubjectPage() {
  if (!(await getEditorProfile())) redirect('/dashboard/subjects')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Disciplina</h1>
        <p className="text-slate text-sm mt-1">Preencha os dados da nova disciplina.</p>
      </div>
      <SubjectForm />
    </div>
  )
}
