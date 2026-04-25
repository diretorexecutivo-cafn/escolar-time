import { createClient } from '@/lib/supabase/server'
import { ConstraintWizard } from '@/components/constraints/constraint-wizard'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

interface NewConstraintPageProps {
  searchParams: Promise<{ teacherId?: string }>
}

export default async function NewConstraintPage({ searchParams }: NewConstraintPageProps) {
  const { teacherId } = await searchParams
  const supabase = await createClient()

  const [{ data: teachers }, { data: units }, { data: subjects }] = await Promise.all([
    supabase
      .from('teachers')
      .select('id, name')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
    supabase
      .from('school_units')
      .select('id, name')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
  ])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Restrição</h1>
        <p className="text-slate text-sm mt-1">
          Configure as preferências e limitações de horário de um professor.
        </p>
      </div>
      <ConstraintWizard
        teachers={teachers ?? []}
        units={units ?? []}
        subjects={subjects ?? []}
        initialTeacherId={teacherId}
      />
    </div>
  )
}
