'use client'

import { useState, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Lock, ArrowLeft, AlertTriangle, ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── Types from Supabase join ──────────────────────────────────────────────

type EntryRow = {
  id: string
  day_of_week: number
  locked: boolean
  time_slot_id: string
  teaching_assignments: {
    id: string
    teachers: { id: string; name: string } | null
    class_subjects: {
      id: string
      subjects: { id: string; name: string; color: string | null } | null
      class_groups: {
        id: string
        name: string
        school_units: { id: string; name: string } | null
      } | null
    } | null
  } | null
}

export type GridSlot = {
  id: string
  day_of_week: number | null
  slot_order: number
  start_time: string
  end_time: string
  type: string | null
  label: string | null
}

export type ClassGrid = {
  classGroupId: string
  slots: GridSlot[]
}

type ScheduleInfo = {
  id: string
  name: string
  status: string
  score: number | null
  created_at: string
  violations?: unknown
  config_snapshot?: unknown
}

type Violation = {
  type: string
  description: string
  priority?: string
  severity?: number
}

type Snapshot = {
  partial?: boolean
  warnings?: string[]
  baselineSimilarity?: number
  stats?: {
    totalLessons?: number
    allocatedLessons?: number
    durationMs?: number
    backtracks?: number
  }
}

function parseViolations(raw: unknown): Violation[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (v): v is Violation =>
      typeof v === 'object' && v !== null && typeof (v as Violation).description === 'string'
  )
}

function parseSnapshot(raw: unknown): Snapshot {
  return typeof raw === 'object' && raw !== null ? (raw as Snapshot) : {}
}

type Props = {
  schedule: ScheduleInfo
  entries: EntryRow[]
  grids: ClassGrid[]
}

/** Períodos (slot_order) presentes na grade, em ordem. */
function periodsOf(slots: GridSlot[]): number[] {
  return Array.from(new Set(slots.map((s) => s.slot_order))).sort((a, b) => a - b)
}

/** Dias presentes na grade, em ordem. */
function daysOf(slots: GridSlot[]): number[] {
  return Array.from(new Set(slots.map((s) => s.day_of_week as number))).sort((a, b) => a - b)
}

/**
 * Rótulo do período. Cada dia pode ter horários diferentes para o mesmo número
 * de aula (ex.: 9ª aula começa 13:50 na terça e 14:00 na quarta), então só
 * mostramos o horário quando ele é igual em todos os dias.
 */
function periodLabel(slots: GridSlot[], order: number): { title: string; time: string | null } {
  const ofOrder = slots.filter((s) => s.slot_order === order)
  const times = new Set(ofOrder.map((s) => `${s.start_time}–${s.end_time}`))
  return {
    title: `${order}ª`,
    time: times.size === 1 ? [...times][0]! : null,
  }
}

function slotAt(slots: GridSlot[], day: number, order: number): GridSlot | null {
  return slots.find((s) => s.day_of_week === day && s.slot_order === order) ?? null
}

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

function hexWithOpacity(hex: string | null | undefined, opacity: number): string {
  if (!hex) return `rgba(33, 47, 92, ${opacity})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const pct = Math.round(score)
  const cls =
    pct >= 80
      ? 'bg-emerald-100 text-emerald-700'
      : pct >= 60
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700'
  return <Badge className={cn(cls, 'hover:opacity-100')}>Score: {pct}</Badge>
}

// ─── Cell components ──────────────────────────────────────────────────────────

function BreakCell() {
  return (
    <div
      className="h-full min-h-[56px] flex items-center justify-center text-xs text-slate font-medium"
      style={{
        background:
          'repeating-linear-gradient(45deg, #F5F7FA, #F5F7FA 4px, #E8EBF0 4px, #E8EBF0 8px)',
      }}
    >
      Intervalo
    </div>
  )
}

function EmptyCell() {
  return <div className="h-full min-h-[56px]" style={{ background: '#F5F7FA' }} />
}

function LessonCell({
  subjectName,
  subjectColor,
  teacherName,
  classGroupName,
  unitName,
  showUnit,
  locked,
  mode,
}: {
  subjectName: string
  subjectColor: string | null
  teacherName: string
  classGroupName?: string
  unitName?: string
  showUnit: boolean
  locked: boolean
  mode: 'class' | 'teacher'
}) {
  return (
    <div
      className="h-full min-h-[56px] p-1.5 rounded-sm border-l-2 relative"
      style={{
        background: hexWithOpacity(subjectColor, 0.15),
        borderLeftColor: subjectColor ?? '#212F5C',
      }}
    >
      <p className="text-xs font-semibold text-navy leading-tight truncate">{subjectName}</p>
      {mode === 'class' ? (
        <p className="text-[11px] text-slate leading-tight truncate mt-0.5">{teacherName}</p>
      ) : (
        <>
          <p className="text-[11px] text-slate leading-tight truncate mt-0.5">{classGroupName}</p>
          {showUnit && unitName && (
            <span className="inline-block mt-0.5 text-[10px] bg-navy/10 text-navy rounded px-1">
              {unitName}
            </span>
          )}
        </>
      )}
      {locked && (
        <Lock
          className="absolute top-1 right-1 h-3 w-3"
          style={{ color: '#D6A441' }}
        />
      )}
    </div>
  )
}

function QualityPanel({ schedule }: { schedule: ScheduleInfo }) {
  const [open, setOpen] = useState(false)

  const violations = parseViolations(schedule.violations)
  const snapshot = parseSnapshot(schedule.config_snapshot)
  const stats = snapshot.stats ?? {}
  const warnings = snapshot.warnings ?? []

  const grouped = useMemo(() => {
    const m = new Map<string, Violation[]>()
    for (const v of violations) {
      const arr = m.get(v.type) ?? []
      arr.push(v)
      m.set(v.type, arr)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [violations])

  const allocated = stats.allocatedLessons
  const total = stats.totalLessons

  return (
    <div className="space-y-3">
      {snapshot.partial && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Horário parcial — {allocated ?? 0} de {total ?? 0} aulas foram alocadas. As demais não
            couberam nas restrições dentro do tempo limite.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate">
        {total != null && (
          <span>
            <strong className="text-navy">{allocated ?? 0}</strong>/{total} aulas alocadas
          </span>
        )}
        {stats.durationMs != null && (
          <span>
            gerado em <strong className="text-navy">{(stats.durationMs / 1000).toFixed(1)}s</strong>
          </span>
        )}
        {snapshot.baselineSimilarity != null && (
          <span>
            <strong className="text-navy">{Math.round(snapshot.baselineSimilarity * 100)}%</strong>{' '}
            igual ao horário base
          </span>
        )}
        <span>
          <strong className="text-navy">{violations.length}</strong> preferência(s) não atendida(s)
        </span>
      </div>

      {warnings.length > 0 && (
        <ul className="list-disc list-inside space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-700">
              {w}
            </li>
          ))}
        </ul>
      )}

      {violations.length > 0 && (
        <div className="rounded-lg border border-border bg-white">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-navy cursor-pointer"
          >
            <span>Preferências não atendidas ({violations.length})</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            />
          </button>
          {open && (
            <div className="border-t border-border px-4 py-3 space-y-3">
              {grouped.map(([type, list]) => (
                <div key={type}>
                  <p className="text-xs font-semibold text-navy mb-1">
                    {type} <span className="text-slate font-normal">({list.length})</span>
                  </p>
                  <ul className="space-y-0.5">
                    {list.slice(0, 10).map((v, i) => (
                      <li key={i} className="text-xs text-slate">
                        • {v.description}
                      </li>
                    ))}
                    {list.length > 10 && (
                      <li className="text-xs text-slate italic">
                        e mais {list.length - 10}…
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Shared table shell ───────────────────────────────────────────────────────

function GridTable({
  slots,
  renderCell,
}: {
  slots: GridSlot[]
  renderCell: (day: number, slot: GridSlot) => ReactNode
}) {
  const periods = useMemo(() => periodsOf(slots), [slots])
  const dayValues = useMemo(() => daysOf(slots), [slots])
  const days = DAYS.filter((d) => dayValues.includes(d.value))

  if (periods.length === 0) {
    return <p className="text-slate text-sm">Grade horária não encontrada para esta seleção.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-navy">
            <th className="text-left px-3 py-2 text-white font-medium text-xs w-28">Horário</th>
            {days.map((d) => (
              <th key={d.value} className="text-center px-2 py-2 text-white font-medium text-xs">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((order) => {
            const { title, time } = periodLabel(slots, order)
            return (
              <tr key={order} className="border-t border-border">
                <td className="px-3 py-1 text-xs text-slate bg-gray-50 whitespace-nowrap">
                  <span className="font-medium text-navy">{title}</span>
                  {time && <span className="block text-[11px]">{time}</span>}
                </td>
                {days.map((d) => {
                  const slot = slotAt(slots, d.value, order)
                  // Este dia não tem essa aula (dias têm quantidades diferentes).
                  if (!slot) {
                    return (
                      <td key={d.value} className="p-0.5">
                        <div className="h-full min-h-[56px] bg-gray-100" />
                      </td>
                    )
                  }
                  if (slot.type === 'BREAK') {
                    return (
                      <td key={d.value} className="p-0.5">
                        <BreakCell />
                      </td>
                    )
                  }
                  return (
                    <td key={d.value} className="p-0.5">
                      {renderCell(d.value, slot)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Class view ───────────────────────────────────────────────────────────────

function ClassView({ entries, grids }: { entries: EntryRow[]; grids: ClassGrid[] }) {
  const classGroups = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) {
      const cg = e.teaching_assignments?.class_subjects?.class_groups
      if (cg) map.set(cg.id, cg.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const [selectedClass, setSelectedClass] = useState(classGroups[0]?.[0] ?? '')

  const slots = useMemo(
    () => grids.find((g) => g.classGroupId === selectedClass)?.slots ?? [],
    [grids, selectedClass]
  )

  // chave: "slotId:dia"
  const lookup = useMemo(() => {
    const m = new Map<string, EntryRow>()
    for (const e of entries) {
      const cgId = e.teaching_assignments?.class_subjects?.class_groups?.id
      if (cgId === selectedClass) m.set(`${e.time_slot_id}:${e.day_of_week}`, e)
    }
    return m
  }, [entries, selectedClass])

  if (classGroups.length === 0) {
    return <p className="text-slate text-sm">Nenhuma entrada no horário.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-navy">Turma:</label>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {classGroups.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <GridTable
        slots={slots}
        renderCell={(day, slot) => {
          const entry = lookup.get(`${slot.id}:${day}`)
          if (!entry) return <EmptyCell />
          const subject = entry.teaching_assignments?.class_subjects?.subjects
          const teacher = entry.teaching_assignments?.teachers
          return (
            <LessonCell
              subjectName={subject?.name ?? '—'}
              subjectColor={subject?.color ?? null}
              teacherName={teacher?.name ?? '—'}
              locked={entry.locked}
              mode="class"
              showUnit={false}
            />
          )
        }}
      />
    </div>
  )
}

// ─── Teacher view ─────────────────────────────────────────────────────────────

function TeacherView({ entries, grids }: { entries: EntryRow[]; grids: ClassGrid[] }) {
  const teachers = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) {
      const t = e.teaching_assignments?.teachers
      if (t) map.set(t.id, t.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0]?.[0] ?? '')

  // Um professor pode atender várias turmas: a visão dele é a união das grades.
  // Quando o mesmo horário é intervalo numa turma e aula em outra, vale a aula —
  // senão a aula real ficaria escondida atrás de um "Intervalo".
  const slots = useMemo(() => {
    const byPeriod = new Map<string, GridSlot>()
    for (const g of grids) {
      for (const sl of g.slots) {
        const k = `${sl.day_of_week}:${sl.slot_order}`
        const atual = byPeriod.get(k)
        if (!atual || (atual.type === 'BREAK' && sl.type !== 'BREAK')) byPeriod.set(k, sl)
      }
    }
    return Array.from(byPeriod.values())
  }, [grids])

  // Cada turma tem os próprios time_slots, então a chave aqui é (dia, número da
  // aula) — e não o id do slot, que difere entre as grades de cada turma.
  const orderBySlotId = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of grids) for (const sl of g.slots) m.set(sl.id, sl.slot_order)
    return m
  }, [grids])

  const lookup = useMemo(() => {
    const m = new Map<string, EntryRow>()
    for (const e of entries) {
      if (e.teaching_assignments?.teachers?.id !== selectedTeacher) continue
      const order = orderBySlotId.get(e.time_slot_id)
      if (order === undefined) continue
      m.set(`${e.day_of_week}:${order}`, e)
    }
    return m
  }, [entries, selectedTeacher, orderBySlotId])

  // Quando o professor passa por mais de uma unidade no dia, destacamos a unidade.
  const unitsByDay = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (const e of entries) {
      const unit = e.teaching_assignments?.class_subjects?.class_groups?.school_units
      if (e.teaching_assignments?.teachers?.id === selectedTeacher && unit) {
        const set = map.get(e.day_of_week) ?? new Set<string>()
        set.add(unit.id)
        map.set(e.day_of_week, set)
      }
    }
    return map
  }, [entries, selectedTeacher])

  if (teachers.length === 0) {
    return <p className="text-slate text-sm">Nenhuma entrada no horário.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-navy">Professor:</label>
        <select
          value={selectedTeacher}
          onChange={(e) => setSelectedTeacher(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {teachers.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <GridTable
        slots={slots}
        renderCell={(day, slot) => {
          const entry = lookup.get(`${day}:${slot.slot_order}`)
          if (!entry) return <EmptyCell />
          const subject = entry.teaching_assignments?.class_subjects?.subjects
          const cg = entry.teaching_assignments?.class_subjects?.class_groups
          return (
            <LessonCell
              subjectName={subject?.name ?? '—'}
              subjectColor={subject?.color ?? null}
              teacherName=""
              classGroupName={cg?.name ?? '—'}
              unitName={cg?.school_units?.name}
              showUnit={(unitsByDay.get(day)?.size ?? 0) >= 2}
              locked={entry.locked}
              mode="teacher"
            />
          )
        }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScheduleGrid({ schedule, entries, grids }: Props) {
  const [tab, setTab] = useState<'class' | 'teacher'>('class')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/schedules"
              className="text-slate hover:text-navy transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-navy">{schedule.name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate">
              {format(new Date(schedule.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <ScoreBadge score={schedule.score} />
          </div>
        </div>
      </div>

      <QualityPanel schedule={schedule} />

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['class', 'teacher'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer',
              tab === t
                ? 'border-navy text-navy'
                : 'border-transparent text-slate hover:text-navy'
            )}
          >
            {t === 'class' ? 'Por Turma' : 'Por Professor'}
          </button>
        ))}
      </div>

      {/* Grid */}
      {tab === 'class' ? (
        <ClassView entries={entries} grids={grids} />
      ) : (
        <TeacherView entries={entries} grids={grids} />
      )}
    </div>
  )
}
