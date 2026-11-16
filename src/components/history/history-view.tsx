'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Minus, Pencil, Plus } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AREA_LABELS,
  actionVerb,
  actorName,
  areaLabel,
  detailLines,
  type AuditEntry,
} from '@/lib/audit-labels'
import { formatLongDay, formatTime, schoolDayKey } from '@/lib/format-date'

/** Alterações seguidas da mesma pessoa, na mesma área e ação, com até 2 min entre elas. */
const GROUP_GAP_MS = 2 * 60 * 1000

type Group = { key: string; entries: AuditEntry[] }

function groupEntries(entries: AuditEntry[]): Group[] {
  const groups: Group[] = []
  for (const e of entries) {
    const last = groups.at(-1)
    const prev = last?.entries.at(-1)
    if (
      last &&
      prev &&
      prev.actor_id === e.actor_id &&
      prev.table_name === e.table_name &&
      prev.action === e.action &&
      schoolDayKey(prev.occurred_at) === schoolDayKey(e.occurred_at) &&
      new Date(prev.occurred_at).getTime() - new Date(e.occurred_at).getTime() <= GROUP_GAP_MS
    ) {
      last.entries.push(e)
    } else {
      groups.push({ key: String(e.id), entries: [e] })
    }
  }
  return groups
}

const ACTION_STYLE = {
  INSERT: { icon: Plus, className: 'bg-emerald-100 text-emerald-700' },
  UPDATE: { icon: Pencil, className: 'bg-blue-100 text-blue-700' },
  DELETE: { icon: Minus, className: 'bg-red-100 text-red-700' },
} as const

const PLURAL_VERB = { INSERT: 'criou', UPDATE: 'alterou', DELETE: 'excluiu' } as const

function EntryDetails({ entry }: { entry: AuditEntry }) {
  const lines = detailLines(entry)
  if (lines.length === 0) {
    return <p className="text-xs text-slate">Sem detalhes adicionais.</p>
  }
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-xs">
      {lines.map((l) => (
        <div key={l.field} className="contents">
          <dt className="text-slate">{l.label}</dt>
          <dd className="text-navy break-words">
            {entry.action === 'UPDATE' ? (
              <>
                <span className="text-red-600 line-through decoration-red-300">{l.before}</span>
                <span className="mx-1.5 text-slate">→</span>
                <span className="text-emerald-700">{l.after}</span>
              </>
            ) : (
              l.after
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ActionIcon({ action }: { action: AuditEntry['action'] }) {
  const { icon: Icon, className } = ACTION_STYLE[action]
  return (
    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', className)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

function EntrySentence({ entry }: { entry: AuditEntry }) {
  return (
    <>
      <span className="font-semibold text-navy">{actorName(entry)}</span>{' '}
      <span className="text-slate">{actionVerb(entry)}</span>{' '}
      <span className="text-navy">{areaLabel(entry.table_name).toLowerCase()}</span>
      {entry.record_label && (
        <span className="font-medium text-navy"> “{entry.record_label}”</span>
      )}
    </>
  )
}

function GroupRow({ group }: { group: Group }) {
  const [open, setOpen] = useState(false)
  const first = group.entries[0]
  const many = group.entries.length > 1
  const lastTime = formatTime(group.entries.at(-1)!.occurred_at)
  const firstTime = formatTime(first.occurred_at)

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left cursor-pointer"
      >
        <span className="w-12 shrink-0 pt-1 text-xs tabular-nums text-slate">{firstTime}</span>
        <ActionIcon action={first.action} />
        <span className="flex-1 text-sm leading-6">
          {many ? (
            <>
              <span className="font-semibold text-navy">{actorName(first)}</span>{' '}
              <span className="text-slate">{PLURAL_VERB[first.action]}</span>{' '}
              <span className="text-navy">
                {group.entries.length} registros de {areaLabel(first.table_name).toLowerCase()}
              </span>
              {lastTime !== firstTime && (
                <span className="text-xs text-slate"> (entre {lastTime} e {firstTime})</span>
              )}
            </>
          ) : (
            <EntrySentence entry={first} />
          )}
        </span>
        {open ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate" />
        ) : (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate" />
        )}
      </button>

      {open && (
        <div className="mt-3 ml-[4.75rem] space-y-3">
          {many ? (
            group.entries.map((e) => (
              <div key={e.id} className="rounded-md border border-border bg-gray-50/60 p-3">
                <p className="mb-2 text-sm">
                  <span className="mr-2 text-xs tabular-nums text-slate">{formatTime(e.occurred_at)}</span>
                  <EntrySentence entry={e} />
                </p>
                <EntryDetails entry={e} />
              </div>
            ))
          ) : (
            <div className="rounded-md border border-border bg-gray-50/60 p-3">
              <EntryDetails entry={first} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

interface HistoryViewProps {
  entries: AuditEntry[]
  users: { id: string; name: string }[]
  filters: { user: string; area: string }
  page: number
  hasMore: boolean
  error: string | null
}

export function HistoryView({ entries, users, filters, page, hasMore, error }: HistoryViewProps) {
  const router = useRouter()
  const pathname = usePathname()

  function hrefWith(next: Partial<{ user: string; area: string; page: number }>) {
    const params = new URLSearchParams()
    const user = next.user ?? filters.user
    const area = next.area ?? filters.area
    const p = next.page ?? 1
    if (user) params.set('user', user)
    if (area) params.set('area', area)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // Agrupa por dia, depois em blocos de alterações seguidas.
  const byDay: { key: string; label: string; entries: AuditEntry[] }[] = []
  for (const e of entries) {
    const key = schoolDayKey(e.occurred_at)
    const last = byDay.at(-1)
    if (last?.key === key) last.entries.push(e)
    else byDay.push({ key, label: formatLongDay(e.occurred_at), entries: [e] })
  }
  const days = byDay.map((d) => ({ ...d, groups: groupEntries(d.entries) }))

  const selectClass =
    'h-9 rounded-md border border-input bg-white px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Histórico</h1>
        <p className="text-slate text-sm mt-1">
          Tudo o que foi criado, alterado ou excluído no sistema, e por quem.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="filter-user" className="text-xs font-medium text-slate">
            Usuário
          </label>
          <select
            id="filter-user"
            className={cn(selectClass, 'block min-w-52')}
            value={filters.user}
            onChange={(e) => router.push(hrefWith({ user: e.target.value }))}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value="system">Sistema (direto no banco)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="filter-area" className="text-xs font-medium text-slate">
            Área
          </label>
          <select
            id="filter-area"
            className={cn(selectClass, 'block min-w-52')}
            value={filters.area}
            onChange={(e) => router.push(hrefWith({ area: e.target.value }))}
          >
            <option value="">Todas</option>
            {Object.entries(AREA_LABELS).map(([table, label]) => (
              <option key={table} value={table}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(filters.user || filters.area) && (
          <Link
            href={pathname}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-slate cursor-pointer')}
          >
            Limpar filtros
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar o histórico: {error}
        </p>
      )}

      {!error && days.length === 0 && (
        <div className="rounded-lg border border-border bg-white py-12 text-center text-sm text-slate shadow-sm">
          {filters.user || filters.area
            ? 'Nenhuma alteração encontrada com estes filtros.'
            : 'Nenhuma alteração registrada ainda.'}
        </div>
      )}

      {days.map((day) => (
        <section key={day.key} className="space-y-2">
          <h2 className="text-sm font-semibold capitalize text-navy">{day.label}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            {day.groups.map((g) => (
              <GroupRow key={g.key} group={g} />
            ))}
          </ul>
        </section>
      ))}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={hrefWith({ page: page - 1 })}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
            >
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link
              href={hrefWith({ page: page + 1 })}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
            >
              Mais antigos →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
