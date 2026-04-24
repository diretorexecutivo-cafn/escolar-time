import { TeacherForm } from '@/components/teachers/teacher-form'

export default function NewTeacherPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Novo Professor</h1>
        <p className="text-slate text-sm mt-1">Preencha os dados do novo professor.</p>
      </div>
      <TeacherForm />
    </div>
  )
}
