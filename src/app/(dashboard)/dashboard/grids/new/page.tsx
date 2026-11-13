import { createClient } from '@/lib/supabase/server'
import { GridForm } from '@/components/grids/grid-form'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

async function loadVigencias(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from('time_grids').select('vigencia').eq('tenant_id', TENANT_ID)
  return [...new Set((data ?? []).map((g) => g.vigencia).filter((v): v is string => !!v))].sort(
    (a, b) => b.localeCompare(a, 'pt-BR', { numeric: true })
  )
}

interface NewGridPageProps {
  searchParams: Promise<{ vigencia?: string }>
}

export default async function NewGridPage({ searchParams }: NewGridPageProps) {
  const { vigencia } = await searchParams
  const supabase = await createClient()

  const [{ data: classGroups }, vigencias] = await Promise.all([
    supabase
      .from('class_groups')
      .select('id, name, school_units(id, name)')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
    loadVigencias(supabase),
  ])

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Nova Grade Horária</h1>
        <p className="text-slate text-sm mt-1">
          Configure os horários de aulas e intervalos para cada dia da semana.
        </p>
      </div>
      <GridForm
        classGroups={classGroups ?? []}
        vigencias={vigencias}
        defaultVigencia={vigencia ?? vigencias[0] ?? ''}
      />
    </div>
  )
}
