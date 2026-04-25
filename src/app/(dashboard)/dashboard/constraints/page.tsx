import { createClient } from '@/lib/supabase/server'
import { ConstraintsManager } from '@/components/constraints/constraints-manager'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function ConstraintsPage() {
  const supabase = await createClient()

  const [{ data: teachers }, { data: constraints }] = await Promise.all([
    supabase
      .from('teachers')
      .select('id, name, active')
      .eq('tenant_id', TENANT_ID)
      .eq('active', true)
      .order('name'),
    supabase
      .from('teacher_constraints')
      .select(
        'id, teacher_id, type, priority, days_of_week, time_from, time_to, slot_order, min_gap_slots, value, description, active, school_unit_id, subject_id, teachers(id, name), school_units(id, name), subjects(id, name)'
      )
      .eq('tenant_id', TENANT_ID)
      .order('created_at', { ascending: false }),
  ])

  return (
    <ConstraintsManager teachers={teachers ?? []} constraints={constraints ?? []} />
  )
}
