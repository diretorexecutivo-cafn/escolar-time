import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdminProfile } from '@/lib/auth/session'
import { AREA_LABELS, type AuditEntry } from '@/lib/audit-labels'
import { HistoryView } from '@/components/history/history-view'

const PAGE_SIZE = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; area?: string; page?: string }>
}) {
  const admin = await getAdminProfile()
  if (!admin) redirect('/dashboard')

  const params = await searchParams
  const user = params.user === 'system' || UUID_RE.test(params.user ?? '') ? params.user! : ''
  const area = params.area && params.area in AREA_LABELS ? params.area : ''
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const supabase = await createClient()

  let query = supabase
    .from('audit_log')
    .select(
      'id, occurred_at, actor_id, actor_name, actor_email, action, table_name, record_id, record_label, changed_fields, old_data, new_data'
    )
    .eq('tenant_id', admin.tenant_id)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    // Um a mais para saber se há página seguinte.
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (user === 'system') query = query.is('actor_id', null)
  else if (user) query = query.eq('actor_id', user)
  if (area) query = query.eq('table_name', area)

  const [{ data: rows, error }, { data: profiles }] = await Promise.all([
    query,
    supabase.from('profiles').select('id, name').eq('tenant_id', admin.tenant_id).order('name'),
  ])

  const entries = (rows ?? []) as AuditEntry[]
  const hasMore = entries.length > PAGE_SIZE

  return (
    <HistoryView
      entries={entries.slice(0, PAGE_SIZE)}
      users={profiles ?? []}
      filters={{ user, area }}
      page={page}
      hasMore={hasMore}
      error={error?.message ?? null}
    />
  )
}
