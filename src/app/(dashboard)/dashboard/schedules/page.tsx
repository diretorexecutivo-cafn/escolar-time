import { createClient } from '@/lib/supabase/server'
import { SchedulesHistory } from '@/components/schedule/schedules-history'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// generated_schedules tem duas FKs para profiles (created_by e deleted_by), então o
// embed precisa nomear a constraint — `profiles(...)` sozinho fica ambíguo no PostgREST.

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
         deleter:profiles!generated_schedules_deleted_by_fkey(id, name),
         replacement:generated_schedules!replaced_by(id, name)`
      )
      .eq('tenant_id', TENANT_ID)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  return (
    <SchedulesHistory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schedules={(schedules ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deletedSchedules={(deleted ?? []) as any}
    />
  )
}
