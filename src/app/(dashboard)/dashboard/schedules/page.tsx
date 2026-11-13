import { createClient } from '@/lib/supabase/server'
import { SchedulesHistory } from '@/components/schedule/schedules-history'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// O embed de quem criou nomeia a FK de created_by. deleted_by não tem FK (ver migration
// 004 — uma 2ª FK para profiles tornava `profiles(...)` ambíguo e quebrava o app
// publicado), então o nome de quem apagou é buscado à parte.

export default async function SchedulesPage() {
  const supabase = await createClient()

  const [{ data: schedules }, { data: deleted }] = await Promise.all([
    supabase
      .from('generated_schedules')
      .select(
        `id, name, created_at, status, score, is_baseline, violations, created_by,
         profiles:profiles!generated_schedules_created_by_fkey(id, name)`
      )
      .eq('tenant_id', TENANT_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('generated_schedules')
      .select(
        `id, name, created_at, status, score, deleted_at, deleted_reason, replaced_by,
         deleted_by, replacement:generated_schedules!replaced_by(id, name)`
      )
      .eq('tenant_id', TENANT_ID)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  const deleterIds = [
    ...new Set((deleted ?? []).map((d) => d.deleted_by).filter((v): v is string => !!v)),
  ]
  const { data: deleters } = deleterIds.length
    ? await supabase.from('profiles').select('id, name').in('id', deleterIds)
    : { data: [] as { id: string; name: string }[] }
  const deleterById = new Map((deleters ?? []).map((p) => [p.id, p]))
  const deletedWithNames = (deleted ?? []).map((d) => ({
    ...d,
    deleter: d.deleted_by ? (deleterById.get(d.deleted_by) ?? null) : null,
  }))

  return (
    <SchedulesHistory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schedules={(schedules ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deletedSchedules={deletedWithNames as any}
    />
  )
}
