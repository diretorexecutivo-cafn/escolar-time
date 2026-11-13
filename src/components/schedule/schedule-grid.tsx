'use client'

import { useState, useMemo, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Lock,
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Undo2,
  X,
  ShieldCheck,
  Save,
  Archive,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SolutionValidationResult } from '@/engine/solution-validator'
import {
  findTeacherClashes,
  overlaps,
  toMinutes,
  type Interval,
  type TimedItem,
} from '@/engine/time'
import { buildSegments, groupBands, layoutColumn, type Segment } from './time-rows'
import {
  cellKey,
  changedCells,
  swapCells,
  toPlacedLessons,
  type CellRef,
} from './edit-swap'

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
      group_key: string | null
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

/** Slot com o horário em minutos — usado no layout por tempo real da visão "Por Horário". */
type TimedSlot = GridSlot & Interval

export type ClassGrid = {
  classGroupId: string
  slots: GridSlot[]
  /** Professora regente: conduz as rotinas (slots ROUTINE) desta turma. */
  homeroomTeacher?: { id: string; name: string } | null
}

type ScheduleInfo = {
  id: string
  name: string
  status: string
  score: number | null
  created_at: string
  violations?: unknown
  config_snapshot?: unknown
  deleted_at?: string | null
  deleted_reason?: string | null
  deleter?: { name: string } | null
  replacement?: { id: string; name: string } | null
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

/** "07:10–08:00" (descarta segundos, caso venham do banco como HH:MM:SS). */
function slotTime(slot: Pick<GridSlot, 'start_time' | 'end_time'>): string {
  return `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`
}

/**
 * Rótulo do período. Cada dia (e cada turma) pode ter horários diferentes para o
 * mesmo número de aula (ex.: 9ª aula começa 13:10 numa turma e 14:00 em outra),
 * então só mostramos o horário na linha quando ele é igual em todas as colunas;
 * caso contrário, `time` é null e cada célula mostra o próprio horário.
 */
function periodLabel(slots: GridSlot[], order: number): { title: string; time: string | null } {
  const ofOrder = slots.filter((s) => s.slot_order === order)
  const times = new Set(ofOrder.map(slotTime))
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

/** Intensidade do fundo das células com a cor da disciplina (a borda usa a cor cheia). */
const SUBJECT_TINT = 0.22

function hexWithOpacity(hex: string | null | undefined, opacity: number): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(33, 47, 92, ${opacity})`
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

const BREAK_BG = 'repeating-linear-gradient(45deg, #F5F7FA, #F5F7FA 4px, #E8EBF0 4px, #E8EBF0 8px)'

/** Horário dentro da célula — usado quando a linha não tem um horário único. */
function CellTime({ time }: { time?: string | null }) {
  if (!time) return null
  return <p className="text-[10px] text-slate/80 leading-tight tabular-nums mt-0.5">{time}</p>
}

function PeriodHeader({ title, time }: { title: string; time: string | null }) {
  return (
    <>
      <span className="font-medium text-navy">{title}</span>
      {time ? (
        <span className="block text-[11px]">{time}</span>
      ) : (
        <span className="block text-[10px] italic" title="O horário desta aula varia entre as colunas">
          varia
        </span>
      )}
    </>
  )
}

/** Atividade fixa do dia (não é aula nem intervalo): mostra o rótulo cadastrado na grade. */
function RoutineCell({
  label,
  who,
  time,
  compact = false,
}: {
  label?: string | null
  /** Quem conduz (visão da turma: a regente) ou de qual turma é (visão da professora). */
  who?: string | null
  time?: string | null
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'h-full flex flex-col items-center justify-center text-center text-teal-800 bg-teal-50 rounded-sm border-l-2 border-teal-400 px-1',
        compact ? 'text-[10px]' : 'min-h-[56px] text-xs font-medium'
      )}
      title={who ? `${label || 'Rotina'} — ${who}` : undefined}
    >
      {label || 'Rotina'}
      {who && (
        <span className={cn('font-normal text-teal-700/80 truncate max-w-full', compact ? 'text-[9px]' : 'text-[11px]')}>
          {who}
        </span>
      )}
      <CellTime time={time} />
    </div>
  )
}

function BreakCell({ time, compact = false }: { time?: string | null; compact?: boolean }) {
  return (
    <div
      className={cn(
        'h-full flex flex-col items-center justify-center text-slate',
        compact ? 'text-[10px]' : 'min-h-[56px] text-xs font-medium'
      )}
      style={{ background: BREAK_BG }}
    >
      Intervalo
      <CellTime time={time} />
    </div>
  )
}

function EmptyCell({ time, compact = false }: { time?: string | null; compact?: boolean }) {
  return (
    <div
      className={cn('h-full flex items-end p-1', !compact && 'min-h-[56px]')}
      style={{ background: '#F5F7FA' }}
    >
      <CellTime time={time} />
    </div>
  )
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
  time,
}: {
  subjectName: string
  subjectColor: string | null
  teacherName: string
  classGroupName?: string
  unitName?: string
  showUnit: boolean
  locked: boolean
  mode: 'class' | 'teacher'
  time?: string | null
}) {
  return (
    <div
      className="h-full min-h-[56px] p-1.5 rounded-sm border-l-2 relative"
      style={{
        background: hexWithOpacity(subjectColor, SUBJECT_TINT),
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
      <CellTime time={time} />
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
  labelSlots = slots,
  breakTimes = true,
  routineWho,
  renderCell,
  renderRoutine,
}: {
  slots: GridSlot[]
  /** Slots usados para decidir se a linha tem horário único (padrão: `slots`). */
  labelSlots?: GridSlot[]
  /** Mostrar o horário dentro dos intervalos quando a linha não tem horário único. */
  breakTimes?: boolean
  /** Quem conduz as rotinas (a regente da turma), mostrado nas células de rotina. */
  routineWho?: string | null
  /** `showTime`: a linha não tem horário único, então a célula deve mostrar o seu. */
  renderCell: (day: number, slot: GridSlot, showTime: boolean) => ReactNode
  /** Substitui a célula padrão de rotina (visão por professora). */
  renderRoutine?: (day: number, slot: GridSlot, showTime: boolean) => ReactNode
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
            const { title, time } = periodLabel(labelSlots, order)
            const showTime = time === null
            return (
              <tr key={order} className="border-t border-border">
                <td className="px-3 py-1 text-xs text-slate bg-gray-50 whitespace-nowrap">
                  <PeriodHeader title={title} time={time} />
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
                        <BreakCell time={showTime && breakTimes ? slotTime(slot) : null} />
                      </td>
                    )
                  }
                  if (slot.type === 'ROUTINE') {
                    return (
                      <td key={d.value} className="p-0.5">
                        {renderRoutine ? (
                          renderRoutine(d.value, slot, showTime)
                        ) : (
                          <RoutineCell
                            label={slot.label}
                            who={routineWho}
                            time={showTime && breakTimes ? slotTime(slot) : null}
                          />
                        )}
                      </td>
                    )
                  }
                  return (
                    <td key={d.value} className="p-0.5">
                      {renderCell(d.value, slot, showTime)}
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

type EditHandlers = {
  selected: CellRef | null
  /** Células alteradas em relação ao original. */
  changed: Set<string>
  /** Células apontadas pela última validação. */
  flagged: Set<string>
  onCellClick: (cell: CellRef) => void
}

/** Envolve a célula para torná-la clicável no modo edição. */
function EditableCell({
  cell,
  edit,
  children,
}: {
  cell: CellRef
  edit: EditHandlers
  children: ReactNode
}) {
  const k = cellKey(cell)
  const isSelected = edit.selected != null && cellKey(edit.selected) === k
  const isFlagged = edit.flagged.has(k)
  const isChanged = edit.changed.has(k)
  return (
    <button
      type="button"
      onClick={() => edit.onCellClick(cell)}
      className={cn(
        'relative block w-full h-full text-left rounded-sm cursor-pointer transition-shadow',
        'hover:ring-2 hover:ring-navy/30',
        isFlagged && 'ring-2 ring-red-500',
        isSelected && 'ring-2 ring-navy ring-offset-1'
      )}
    >
      {children}
      {isChanged && (
        <span
          className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-ocre"
          title="Alterado nesta edição"
        />
      )}
    </button>
  )
}

function ClassView({
  entries,
  grids,
  edit,
}: {
  entries: EntryRow[]
  grids: ClassGrid[]
  edit?: EditHandlers
}) {
  const classGroups = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) {
      const cg = e.teaching_assignments?.class_subjects?.class_groups
      if (cg) map.set(cg.id, cg.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const [selectedClass, setSelectedClass] = useState(classGroups[0]?.[0] ?? '')

  const selectedGrid = useMemo(
    () => grids.find((g) => g.classGroupId === selectedClass),
    [grids, selectedClass]
  )
  const slots = useMemo(() => selectedGrid?.slots ?? [], [selectedGrid])

  // chave: "slotId:dia" — pode haver mais de uma aula na célula durante a edição (choque)
  const lookup = useMemo(() => {
    const m = new Map<string, EntryRow[]>()
    for (const e of entries) {
      const cgId = e.teaching_assignments?.class_subjects?.class_groups?.id
      if (cgId !== selectedClass) continue
      const k = `${e.time_slot_id}:${e.day_of_week}`
      const arr = m.get(k)
      if (arr) arr.push(e)
      else m.set(k, [e])
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
        routineWho={selectedGrid?.homeroomTeacher?.name}
        renderCell={(day, slot, showTime) => {
          const time = showTime ? slotTime(slot) : null
          const cellEntries = lookup.get(`${slot.id}:${day}`) ?? []
          const entry = cellEntries[0]
          let content: ReactNode
          if (!entry) {
            content = <EmptyCell time={time} />
          } else {
            const subject = entry.teaching_assignments?.class_subjects?.subjects
            const teacher = entry.teaching_assignments?.teachers
            content = (
              <div className="relative h-full">
                <LessonCell
                  subjectName={subject?.name ?? '—'}
                  subjectColor={subject?.color ?? null}
                  teacherName={teacher?.name ?? '—'}
                  locked={entry.locked}
                  mode="class"
                  showUnit={false}
                  time={time}
                />
                {cellEntries.length > 1 && (
                  <span
                    className="absolute top-1 right-1 text-[10px] font-semibold text-white bg-red-500 rounded px-1"
                    title={cellEntries
                      .map((e) => e.teaching_assignments?.class_subjects?.subjects?.name)
                      .join(' + ')}
                  >
                    +{cellEntries.length - 1}
                  </span>
                )}
              </div>
            )
          }
          if (!edit) return content
          return (
            <EditableCell
              cell={{ classGroupId: selectedClass, day, order: slot.slot_order }}
              edit={edit}
            >
              {content}
            </EditableCell>
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
    // A regente aparece mesmo sem aulas: a agenda dela tem as rotinas da turma.
    for (const g of grids) if (g.homeroomTeacher) map.set(g.homeroomTeacher.id, g.homeroomTeacher.name)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries, grids])

  const classNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of entries) {
      const cg = e.teaching_assignments?.class_subjects?.class_groups
      if (cg) m.set(cg.id, cg.name)
    }
    return m
  }, [entries])

  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0]?.[0] ?? '')

  // Um professor pode atender várias turmas: a visão dele é a união das grades.
  // Quando o mesmo horário é intervalo/rotina numa turma e aula em outra, vale a aula —
  // senão a aula real ficaria escondida atrás de um "Intervalo".
  const slots = useMemo(() => {
    const byPeriod = new Map<string, GridSlot>()
    for (const g of grids) {
      for (const sl of g.slots) {
        const k = `${sl.day_of_week}:${sl.slot_order}`
        const atual = byPeriod.get(k)
        if (!atual || (atual.type !== 'LESSON' && sl.type === 'LESSON')) byPeriod.set(k, sl)
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

  // O horário real de cada aula vem do slot da turma dela — o slot da "união"
  // acima pode ser de outra turma, com outro horário.
  const slotById = useMemo(() => {
    const m = new Map<string, GridSlot>()
    for (const g of grids) for (const sl of g.slots) m.set(sl.id, sl)
    return m
  }, [grids])

  // Linha só tem horário único se ele for igual em todas as turmas e dias.
  const allSlots = useMemo(() => grids.flatMap((g) => g.slots), [grids])

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

  // Rotinas das turmas de que a professora é regente — ela as conduz. Chave (dia, nº da aula).
  const routineAt = useMemo(() => {
    const m = new Map<string, { slot: GridSlot; className: string }>()
    for (const g of grids) {
      if (g.homeroomTeacher?.id !== selectedTeacher) continue
      const className = classNameById.get(g.classGroupId) ?? 'Turma'
      for (const sl of g.slots) {
        if (sl.type === 'ROUTINE') m.set(`${sl.day_of_week}:${sl.slot_order}`, { slot: sl, className })
      }
    }
    return m
  }, [grids, selectedTeacher, classNameById])

  const routineCell = (day: number, order: number, showTime: boolean) => {
    const r = routineAt.get(`${day}:${order}`)
    if (!r) return null
    return (
      <RoutineCell label={r.slot.label} who={r.className} time={showTime ? slotTime(r.slot) : null} />
    )
  }

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
        labelSlots={allSlots}
        breakTimes={false}
        renderRoutine={(day, slot, showTime) =>
          routineCell(day, slot.slot_order, showTime) ?? <EmptyCell />
        }
        renderCell={(day, slot, showTime) => {
          const entry = lookup.get(`${day}:${slot.slot_order}`)
          if (!entry) return routineCell(day, slot.slot_order, showTime) ?? <EmptyCell />
          const subject = entry.teaching_assignments?.class_subjects?.subjects
          const cg = entry.teaching_assignments?.class_subjects?.class_groups
          const ownSlot = slotById.get(entry.time_slot_id)
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
              time={showTime && ownSlot ? slotTime(ownSlot) : null}
            />
          )
        }}
      />
    </div>
  )
}

// ─── Slot view (todas as turmas lado a lado) ──────────────────────────────────

const DAY_NAMES: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
}

type Clash = {
  day: number
  /** Início do choque (minutos) — para ordenar a lista. */
  start: number
  teacherName: string
  /** "6º A 3ª (11:00–11:50)" */
  parts: string[]
  /** Horários envolvidos — para o filtro "só horários com choque". */
  spans: Interval[]
}

function SlotView({ entries, grids }: { entries: EntryRow[]; grids: ClassGrid[] }) {
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all')
  const [onlyClashes, setOnlyClashes] = useState(false)

  const classGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unitName: string }>()
    for (const e of entries) {
      const cg = e.teaching_assignments?.class_subjects?.class_groups
      if (cg) map.set(cg.id, { id: cg.id, name: cg.name, unitName: cg.school_units?.name ?? '' })
    }
    return Array.from(map.values()).sort(
      (a, b) => a.unitName.localeCompare(b.unitName) || a.name.localeCompare(b.name)
    )
  }, [entries])

  const orderBySlotId = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of grids) for (const sl of g.slots) m.set(sl.id, sl.slot_order)
    return m
  }, [grids])

  const slotById = useMemo(() => {
    const m = new Map<string, GridSlot>()
    for (const g of grids) for (const sl of g.slots) m.set(sl.id, sl)
    return m
  }, [grids])

  const entryByClass = useMemo(() => {
    const m = new Map<string, EntryRow>()
    for (const e of entries) {
      const cgId = e.teaching_assignments?.class_subjects?.class_groups?.id
      const order = orderBySlotId.get(e.time_slot_id)
      if (cgId && order !== undefined) m.set(`${cgId}:${e.day_of_week}:${order}`, e)
    }
    return m
  }, [entries, orderBySlotId])

  // Mesmo critério do motor (src/engine/time.ts): choque é o professor em aulas cujos
  // HORÁRIOS se sobrepõem — cada turma tem a própria grade, então números de aula diferentes
  // podem chocar e números iguais podem não chocar. Aulas do mesmo group_key no mesmo dia/aula
  // são uma aula só (agrupada).
  //
  // As rotinas da turma ocupam a regente (mesma regra do motor): aula dela em outra turma
  // no horário de uma rotina também é choque.
  const { clashes, clashEntryIds, clashRoutineKeys } = useMemo(() => {
    type ClashItem =
      | { kind: 'lesson'; entry: EntryRow }
      | { kind: 'routine'; slot: GridSlot; className: string; teacherName: string }
    const items: TimedItem<ClashItem>[] = []
    for (const e of entries) {
      const teacherId = e.teaching_assignments?.teachers?.id
      const slot = slotById.get(e.time_slot_id)
      if (!teacherId || !slot) continue
      const interval: Interval = { start: toMinutes(slot.start_time), end: toMinutes(slot.end_time) }
      const groupKey = e.teaching_assignments?.class_subjects?.group_key
      const owner = groupKey ? `g:${groupKey}:${e.day_of_week}:${slot.slot_order}` : `e:${e.id}`
      items.push({ teacherId, day: e.day_of_week, interval, owner, item: { kind: 'lesson', entry: e } })
    }
    for (const g of grids) {
      const regente = g.homeroomTeacher
      if (!regente) continue
      const className = classGroups.find((c) => c.id === g.classGroupId)?.name ?? 'Turma'
      for (const sl of g.slots) {
        if (sl.type !== 'ROUTINE' || sl.day_of_week == null) continue
        items.push({
          teacherId: regente.id,
          day: sl.day_of_week,
          interval: { start: toMinutes(sl.start_time), end: toMinutes(sl.end_time) },
          owner: `r:${sl.id}`,
          item: { kind: 'routine', slot: sl, className, teacherName: regente.name },
        })
      }
    }
    const list: Clash[] = []
    const ids = new Set<string>()
    const routineKeys = new Set<string>()
    for (const cluster of findTeacherClashes(items)) {
      const parts: string[] = []
      let teacherName = '—'
      for (const { item, day } of cluster) {
        if (item.kind === 'routine') {
          routineKeys.add(`${item.slot.id}:${day}`)
          teacherName = item.teacherName
          parts.push(`${item.className} — ${item.slot.label || 'Rotina'} (rotina, ${slotTime(item.slot)})`)
          continue
        }
        ids.add(item.entry.id)
        teacherName = item.entry.teaching_assignments?.teachers?.name ?? teacherName
        const slot = slotById.get(item.entry.time_slot_id)!
        parts.push(
          `${item.entry.teaching_assignments?.class_subjects?.class_groups?.name ?? '—'} ${slot.slot_order}ª (${slotTime(slot)})`
        )
      }
      list.push({
        day: cluster[0]!.day,
        start: cluster[0]!.interval.start,
        teacherName,
        parts,
        spans: cluster.map((c) => c.interval),
      })
    }
    list.sort((a, b) => a.day - b.day || a.start - b.start || a.teacherName.localeCompare(b.teacherName))
    return { clashes: list, clashEntryIds: ids, clashRoutineKeys: routineKeys }
  }, [entries, slotById, grids, classGroups])

  const regenteByClass = useMemo(
    () => new Map(grids.map((g) => [g.classGroupId, g.homeroomTeacher?.name ?? null])),
    [grids]
  )

  const clashSpansByDay = useMemo(() => {
    const m = new Map<number, Interval[]>()
    for (const c of clashes) m.set(c.day, [...(m.get(c.day) ?? []), ...c.spans])
    return m
  }, [clashes])

  // chave: "turma:dia" → slots daquele dia com o horário em minutos (para o layout por tempo).
  const timedSlotsByClassDay = useMemo(() => {
    const m = new Map<string, TimedSlot[]>()
    for (const g of grids) {
      for (const sl of g.slots) {
        const k = `${g.classGroupId}:${sl.day_of_week}`
        const timed = { ...sl, start: toMinutes(sl.start_time), end: toMinutes(sl.end_time) }
        const arr = m.get(k)
        if (arr) arr.push(timed)
        else m.set(k, [timed])
      }
    }
    return m
  }, [grids])

  const allSlots = useMemo(() => grids.flatMap((g) => g.slots), [grids])
  const dayValues = useMemo(() => daysOf(allSlots), [allSlots])
  const visibleDays = dayFilter === 'all' ? dayValues : dayValues.filter((d) => d === dayFilter)

  // Blocos de turmas que dividem uma coluna de horário (ver groupBands em time-rows.ts):
  // ex.: Unidade I (50 min a partir de 07:10), Fund I da Unidade II (a partir de 07:30) e o
  // Infantil, cuja coluna de horário se divide para caber as três turmas.
  const columns = useMemo((): SlotColumn[] => {
    const bands = groupBands(
      classGroups.map((cg) => {
        const slotsByDay = new Map<number, Interval[]>()
        for (const d of dayValues) {
          const s = timedSlotsByClassDay.get(`${cg.id}:${d}`)
          if (s) slotsByDay.set(d, s)
        }
        return { unit: cg.unitName, slotsByDay }
      })
    )
    return bands.flatMap((idx, band): SlotColumn[] => {
      const cgs = idx.map((i) => classGroups[i]!)
      return [
        { kind: 'time', band, unitName: cgs[0]!.unitName, classIds: cgs.map((c) => c.id) },
        ...cgs.map((cg) => ({ kind: 'class' as const, band, cg })),
      ]
    })
  }, [classGroups, dayValues, timedSlotsByClassDay])

  // Cabeçalho de unidades: a 1ª coluna (horário fixo à esquerda) fica de fora.
  const unitSpans = useMemo(() => {
    const spans: { name: string; count: number }[] = []
    for (const col of columns.slice(1)) {
      const name = col.kind === 'time' ? col.unitName : col.cg.unitName
      const last = spans[spans.length - 1]
      if (last && last.name === name) last.count++
      else spans.push({ name, count: 1 })
    }
    return spans
  }, [columns])

  if (classGroups.length === 0) {
    return <p className="text-slate text-sm">Nenhuma entrada no horário.</p>
  }

  const showUnits = new Set(classGroups.map((cg) => cg.unitName)).size > 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(['all', ...dayValues] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDayFilter(d)}
              className={cn(
                'px-3 py-1.5 font-medium cursor-pointer transition-colors border-l border-border first:border-l-0',
                dayFilter === d ? 'bg-navy text-white' : 'bg-white text-slate hover:text-navy'
              )}
            >
              {d === 'all' ? 'Semana toda' : DAYS.find((x) => x.value === d)?.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate cursor-pointer">
          <input
            type="checkbox"
            checked={onlyClashes}
            onChange={(e) => setOnlyClashes(e.target.checked)}
          />
          Só horários com choque
        </label>
      </div>

      {clashes.length === 0 ? (
        <p className="text-xs text-emerald-700">Nenhum choque de professor encontrado.</p>
      ) : (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {clashes.length} choque(s) de professor
          </p>
          <ul className="space-y-0.5">
            {clashes.map((c, i) => (
              <li key={i} className="text-xs text-red-700">
                {DAYS.find((d) => d.value === c.day)?.label} — {c.teacherName}:{' '}
                {c.parts.join(' × ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-auto max-h-[75vh] rounded-lg border border-border">
        <table className="text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            {showUnits && (
              <tr className="bg-navy/90">
                <th className="sticky left-0 z-30 bg-navy" />
                {unitSpans.map((u, i) => (
                  <th
                    key={i}
                    colSpan={u.count}
                    className="px-2 py-1 text-white font-medium text-[11px] border-l border-white/20"
                  >
                    {u.name || '—'}
                  </th>
                ))}
              </tr>
            )}
            <tr className="bg-navy">
              {columns.map((col, i) =>
                col.kind === 'time' ? (
                  <th
                    key={`t${col.band}`}
                    className={cn(
                      'text-left px-2 py-2 text-white font-medium text-xs bg-navy',
                      i === 0 ? 'sticky left-0 z-30 min-w-24' : 'border-l-2 border-white/30 min-w-20'
                    )}
                  >
                    Horário
                  </th>
                ) : (
                  <th
                    key={col.cg.id}
                    className="px-2 py-2 text-white font-medium text-xs min-w-28 whitespace-nowrap"
                  >
                    {col.cg.name}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day, i) => {
              const slotsFor = (cgId: string) => timedSlotsByClassDay.get(`${cgId}:${day}`) ?? []
              const clashSpans = clashSpansByDay.get(day) ?? []
              const segments = buildSegments(classGroups.flatMap((cg) => slotsFor(cg.id))).filter(
                (seg) => !onlyClashes || clashSpans.some((c) => overlaps(c, seg))
              )
              if (segments.length === 0) return null
              return (
                <DayRows
                  key={day}
                  day={day}
                  first={i === 0}
                  segments={segments}
                  columns={columns}
                  slotsFor={slotsFor}
                  entryByClass={entryByClass}
                  clashEntryIds={clashEntryIds}
                  clashRoutineKeys={clashRoutineKeys}
                  regenteByClass={regenteByClass}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SlotColumn =
  | { kind: 'time'; band: number; unitName: string; classIds: string[] }
  | { kind: 'class'; band: number; cg: { id: string; name: string; unitName: string } }

const fmtMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Altura da linha proporcional à duração da faixa; o conteúdo das células pode aumentá-la. */
const PX_PER_MINUTE = 1

function DayRows({
  day,
  first,
  segments,
  columns,
  slotsFor,
  entryByClass,
  clashEntryIds,
  clashRoutineKeys,
  regenteByClass,
}: {
  day: number
  first: boolean
  /**
   * Linhas da tabela: faixas entre TODAS as fronteiras do dia (ver time-rows.ts). Ninguém
   * vê essas faixas finas: cada bloco mostra na sua coluna de horário as próprias faixas, e
   * cada célula ocupa (rowSpan) as linhas que cobre.
   */
  segments: Segment[]
  columns: SlotColumn[]
  slotsFor: (classGroupId: string) => TimedSlot[]
  entryByClass: Map<string, EntryRow>
  clashEntryIds: Set<string>
  /** "slotId:dia" das rotinas cuja regente está em aula noutra turma no mesmo horário. */
  clashRoutineKeys: Set<string>
  regenteByClass: Map<string, string | null>
}) {
  const bandSegments = new Map<number, Segment[]>()
  for (const col of columns) {
    if (col.kind === 'time') bandSegments.set(col.band, buildSegments(col.classIds.flatMap(slotsFor)))
  }
  // Indexados pela posição da coluna; só uma das duas listas tem valor em cada posição.
  const timeLayouts = columns.map((col) =>
    col.kind === 'time' ? layoutColumn(segments, bandSegments.get(col.band)!) : []
  )
  const classLayouts = columns.map((col) =>
    col.kind === 'class' ? layoutColumn(segments, slotsFor(col.cg.id)) : []
  )

  return (
    <>
      <tr>
        <td colSpan={columns.length} className={cn('p-0 bg-white', !first && 'pt-4')}>
          <div className="bg-navy border-l-4 border-ocre px-3 py-2">
            <span className="sticky left-3 text-sm font-semibold uppercase tracking-wide text-white">
              {DAY_NAMES[day]}
            </span>
          </div>
        </td>
      </tr>
      {segments.map((seg, row) => {
        // Faixa escondida pelo filtro ou vão sem aulas logo acima: separa visualmente.
        const jump = row > 0 && segments[row - 1]!.end !== seg.start
        return (
          <tr
            key={seg.start}
            className={cn('border-t', jump ? 'border-t-2 border-dashed border-slate/40' : 'border-border')}
            style={{ height: (seg.end - seg.start) * PX_PER_MINUTE }}
          >
            {columns.map((col, c) => {
              if (col.kind === 'time') {
                const cell = timeLayouts[c]![row]
                if (!cell) return null // coberta pela célula de cima (rowSpan)
                return (
                  <td
                    key={`t${col.band}`}
                    rowSpan={cell.rowSpan}
                    className={cn(
                      'px-2 py-0.5 text-[11px] leading-tight bg-gray-50 whitespace-nowrap align-top tabular-nums',
                      c === 0 ? 'sticky left-0 z-10' : 'border-l-2 border-navy/20'
                    )}
                  >
                    {cell.kind === 'slot' && (
                      <>
                        <span className="font-medium text-navy">{fmtMinutes(cell.slot.start)}</span>
                        <span className="text-slate">–{fmtMinutes(cell.slot.end)}</span>
                      </>
                    )}
                  </td>
                )
              }

              const cell = classLayouts[c]![row]
              if (!cell) return null // coberta pela célula de cima (rowSpan)
              const key = col.cg.id
              if (cell.kind === 'gap') {
                return (
                  <td key={key} rowSpan={cell.rowSpan} className="p-0.5 h-px">
                    <div className="h-full bg-gray-100 rounded-sm" />
                  </td>
                )
              }
              const slot = cell.slot
              // A coluna de horário do bloco já diz o horário; a célula só repete quando a
              // aula não coincide com uma faixa dela (turmas com horários próprios, Infantil).
              const cellTime = bandSegments
                .get(col.band)!
                .some((s) => s.start === slot.start && s.end === slot.end)
                ? null
                : slotTime(slot)
              if (slot.type === 'BREAK') {
                return (
                  <td key={key} rowSpan={cell.rowSpan} className="p-0.5 h-px">
                    <BreakCell compact time={cellTime} />
                  </td>
                )
              }
              if (slot.type === 'ROUTINE') {
                return (
                  <td key={key} rowSpan={cell.rowSpan} className="p-0.5 h-px">
                    <div
                      className={cn(
                        'h-full rounded-sm',
                        clashRoutineKeys.has(`${slot.id}:${day}`) && 'ring-2 ring-red-500'
                      )}
                    >
                      <RoutineCell
                        compact
                        label={slot.label}
                        who={regenteByClass.get(col.cg.id)}
                        time={cellTime}
                      />
                    </div>
                  </td>
                )
              }
              const entry = entryByClass.get(`${col.cg.id}:${day}:${slot.slot_order}`)
              if (!entry) {
                return (
                  <td key={key} rowSpan={cell.rowSpan} className="p-0.5 h-px">
                    <EmptyCell compact time={cellTime} />
                  </td>
                )
              }
              const subject = entry.teaching_assignments?.class_subjects?.subjects
              const teacher = entry.teaching_assignments?.teachers
              const clash = clashEntryIds.has(entry.id)
              return (
                <td key={key} rowSpan={cell.rowSpan} className="p-0.5 h-px">
                  <div
                    className={cn(
                      'h-full p-1 rounded-sm border-l-2 relative',
                      clash && 'ring-2 ring-red-500'
                    )}
                    style={{
                      background: clash ? '#FEE2E2' : hexWithOpacity(subject?.color, SUBJECT_TINT),
                      borderLeftColor: clash ? '#EF4444' : (subject?.color ?? '#212F5C'),
                    }}
                    title={`${subject?.name ?? '—'} — ${teacher?.name ?? '—'} (${slot.slot_order}ª, ${slotTime(slot)})${clash ? ' (choque)' : ''}`}
                  >
                    <p className="text-[11px] font-semibold text-navy leading-tight truncate">
                      {subject?.name ?? '—'}
                    </p>
                    <p
                      className={cn(
                        'text-[10px] leading-tight truncate mt-0.5',
                        clash ? 'text-red-700 font-semibold' : 'text-slate'
                      )}
                    >
                      {teacher?.name ?? '—'}
                    </p>
                    <CellTime time={cellTime} />
                    {entry.locked && (
                      <Lock className="absolute top-1 right-1 h-2.5 w-2.5" style={{ color: '#D6A441' }} />
                    )}
                  </div>
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TAB_LABELS = {
  class: 'Por Turma',
  teacher: 'Por Professor',
  slot: 'Por Horário',
} as const

// ─── Edição manual ────────────────────────────────────────────────────────────

type EditMode = 'replace' | 'copy'

const EDIT_MODE_LABEL: Record<EditMode, string> = {
  replace: 'Editar e excluir o original',
  copy: 'Editar e manter o original',
}

function EditModeDialog({
  onChoose,
  onClose,
}: {
  onChoose: (mode: EditMode) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white shadow-xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-navy">Editar horário</h2>
          <p className="text-sm text-slate mt-1">
            Clique em duas aulas da mesma turma para trocá-las de lugar. Ao terminar, valide as
            edições — só é possível salvar um horário sem violações obrigatórias.
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onChoose('replace')}
            className="w-full text-left rounded-md border border-border p-3 hover:border-navy hover:bg-navy/5 cursor-pointer"
          >
            <p className="text-sm font-medium text-navy">{EDIT_MODE_LABEL.replace}</p>
            <p className="text-xs text-slate mt-0.5">
              O horário editado substitui este. O original sai da lista e fica no histórico de
              apagados.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onChoose('copy')}
            className="w-full text-left rounded-md border border-border p-3 hover:border-navy hover:bg-navy/5 cursor-pointer"
          >
            <p className="text-sm font-medium text-navy">{EDIT_MODE_LABEL.copy}</p>
            <p className="text-xs text-slate mt-0.5">
              O horário editado é salvo como um novo horário. Este continua como está.
            </p>
          </button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

function EditToolbar({
  mode,
  changedCount,
  canUndo,
  validating,
  saving,
  canSave,
  copyName,
  onCopyNameChange,
  onUndo,
  onDiscard,
  onValidate,
  onSave,
}: {
  mode: EditMode
  changedCount: number
  canUndo: boolean
  validating: boolean
  saving: boolean
  canSave: boolean
  copyName: string
  onCopyNameChange: (v: string) => void
  onUndo: () => void
  onDiscard: () => void
  onValidate: () => void
  onSave: () => void
}) {
  return (
    <div className="sticky top-0 z-30 rounded-lg border border-navy/20 bg-white shadow-sm p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 mr-auto">
        <Pencil className="h-4 w-4 text-navy" />
        <div>
          <p className="text-sm font-semibold text-navy">Modo edição — {EDIT_MODE_LABEL[mode]}</p>
          <p className="text-xs text-slate">
            {changedCount === 0
              ? 'Clique numa aula e depois em outra (ou num horário vago) da mesma turma.'
              : `${changedCount} célula(s) alterada(s).`}
          </p>
        </div>
      </div>
      {mode === 'copy' && (
        <input
          value={copyName}
          onChange={(e) => onCopyNameChange(e.target.value)}
          placeholder="Nome do novo horário"
          className="rounded-md border border-input bg-background px-2.5 py-1 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="cursor-pointer">
        <Undo2 /> Desfazer
      </Button>
      <Button variant="ghost" size="sm" onClick={onDiscard} className="cursor-pointer">
        <X /> Descartar
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onValidate}
        disabled={validating || saving}
        className="cursor-pointer"
      >
        <ShieldCheck /> {validating ? 'Validando…' : 'Validar edições'}
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={!canSave || saving}
        title={canSave ? undefined : 'Valide as edições sem violações obrigatórias para salvar.'}
        className="bg-navy hover:bg-navy-light text-white cursor-pointer"
      >
        <Save /> {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  )
}

function ValidationPanel({ result }: { result: SolutionValidationResult }) {
  const [showSoft, setShowSoft] = useState(false)
  const hard = result.hardViolations
  return (
    <div
      className={cn(
        'rounded-md border p-4 space-y-2',
        result.valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {result.valid ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        )}
        <p className={cn('text-sm font-semibold', result.valid ? 'text-emerald-800' : 'text-red-700')}>
          {result.valid
            ? 'Horário válido — nenhuma regra obrigatória violada.'
            : `${hard.length} violação(ões) obrigatória(s) — corrija antes de salvar.`}
        </p>
        <ScoreBadge score={result.score} />
      </div>
      {hard.length > 0 && (
        <ul className="space-y-0.5 max-h-60 overflow-y-auto">
          {hard.map((v, i) => (
            <li key={i} className="text-xs text-red-700">
              • {v.description}
            </li>
          ))}
        </ul>
      )}
      {result.softViolations.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowSoft((s) => !s)}
            className="text-xs text-amber-800 underline cursor-pointer"
          >
            {result.softViolations.length} preferência(s) não atendida(s) — não bloqueiam o salvamento
          </button>
          {showSoft && (
            <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
              {result.softViolations.map((v, i) => (
                <li key={i} className="text-xs text-amber-800">
                  • {v.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DeletedBanner({ schedule }: { schedule: ScheduleInfo }) {
  if (!schedule.deleted_at) return null
  const when = format(new Date(schedule.deleted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  return (
    <div className="rounded-md border border-slate/30 bg-gray-50 p-3 flex items-start gap-2">
      <Archive className="h-4 w-4 text-slate shrink-0 mt-0.5" />
      <p className="text-sm text-slate">
        Este horário foi apagado em {when}
        {schedule.deleter?.name ? ` por ${schedule.deleter.name}` : ''}
        {schedule.deleted_reason === 'replaced_by_edit' && schedule.replacement ? (
          <>
            {' '}
            e substituído por{' '}
            <Link
              href={`/dashboard/schedules/${schedule.replacement.id}`}
              className="text-navy underline hover:text-ocre"
            >
              {schedule.replacement.name}
            </Link>
          </>
        ) : null}
        . Está disponível apenas para consulta.
      </p>
    </div>
  )
}

export function ScheduleGrid({ schedule, entries, grids }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<keyof typeof TAB_LABELS>('class')

  const isDeleted = !!schedule.deleted_at
  const [showModeDialog, setShowModeDialog] = useState(false)
  const [editMode, setEditMode] = useState<EditMode | null>(null)
  const [draft, setDraft] = useState<EntryRow[]>(entries)
  const [history, setHistory] = useState<EntryRow[][]>([])
  const [selected, setSelected] = useState<CellRef | null>(null)
  const [validation, setValidation] = useState<SolutionValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyName, setCopyName] = useState(`${schedule.name} (editado)`)

  const editing = editMode !== null
  const shown = editing ? draft : entries

  const changed = useMemo(
    () => (editing ? changedCells(entries, draft, grids) : new Set<string>()),
    [editing, entries, draft, grids]
  )
  const flagged = useMemo(() => {
    const s = new Set<string>()
    for (const v of validation?.hardViolations ?? []) {
      for (const c of v.cells) s.add(cellKey({ classGroupId: c.classGroupId, day: c.day, order: c.slotOrder }))
    }
    return s
  }, [validation])

  // Avisa antes de sair da página com edições não salvas.
  const dirty = editing && changed.size > 0
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function startEditing(mode: EditMode) {
    setShowModeDialog(false)
    setEditMode(mode)
    setDraft(entries)
    setHistory([])
    setSelected(null)
    setValidation(null)
    setTab('class')
  }

  function stopEditing() {
    setEditMode(null)
    setDraft(entries)
    setHistory([])
    setSelected(null)
    setValidation(null)
  }

  function handleDiscard() {
    if (dirty && !confirm('Descartar todas as alterações desta edição?')) return
    stopEditing()
  }

  function handleUndo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setDraft(prev)
    setHistory((h) => h.slice(0, -1))
    setSelected(null)
    setValidation(null)
  }

  function handleCellClick(cell: CellRef) {
    if (!selected || selected.classGroupId !== cell.classGroupId) {
      setSelected(cell)
      return
    }
    if (cellKey(selected) === cellKey(cell)) {
      setSelected(null)
      return
    }
    const r = swapCells(draft, grids, selected, cell)
    setSelected(null)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    if (r.entries === draft) return
    setHistory((h) => [...h, draft])
    setDraft(r.entries)
    setValidation(null) // qualquer mudança exige validar de novo
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const res = await fetch(`/api/schedule/${schedule.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: toPlacedLessons(draft) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao validar.')
        return
      }
      const result = data as SolutionValidationResult
      setValidation(result)
      if (result.valid) toast.success('Horário válido. Já pode salvar.')
      else toast.error(`${result.hardViolations.length} violação(ões) obrigatória(s).`)
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setValidating(false)
    }
  }

  async function handleSave() {
    if (!editMode || !validation?.valid) return
    if (
      editMode === 'replace' &&
      !confirm('Salvar a edição e mover o horário original para o histórico de apagados?')
    ) {
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/schedule/${schedule.id}/save-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: editMode,
          name: editMode === 'copy' ? copyName.trim() || undefined : undefined,
          entries: toPlacedLessons(draft),
        }),
      })
      const data = await res.json()
      if (res.status === 422 && data.validation) {
        setValidation(data.validation)
        toast.error(data.error)
        return
      }
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao salvar.')
        return
      }
      if (data.warning) toast.warning(data.warning)
      toast.success('Horário editado salvo.')
      setEditMode(null) // libera o aviso de saída antes de navegar
      router.push(`/dashboard/schedules/${data.scheduleId}`)
      router.refresh()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

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
        {!isDeleted && !editing && (
          <Button
            variant="outline"
            onClick={() => setShowModeDialog(true)}
            className="cursor-pointer"
          >
            <Pencil /> Editar horário
          </Button>
        )}
      </div>

      <DeletedBanner schedule={schedule} />

      {showModeDialog && (
        <EditModeDialog onChoose={startEditing} onClose={() => setShowModeDialog(false)} />
      )}

      {editing ? (
        <>
          <EditToolbar
            mode={editMode}
            changedCount={changed.size}
            canUndo={history.length > 0}
            validating={validating}
            saving={saving}
            canSave={!!validation?.valid}
            copyName={copyName}
            onCopyNameChange={setCopyName}
            onUndo={handleUndo}
            onDiscard={handleDiscard}
            onValidate={handleValidate}
            onSave={handleSave}
          />
          {validation && <ValidationPanel result={validation} />}
        </>
      ) : (
        <QualityPanel schedule={schedule} />
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((t) => (
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
            {TAB_LABELS[t]}
            {editing && t !== 'class' && (
              <span className="ml-1 text-[10px] text-slate font-normal">(visualização)</span>
            )}
          </button>
        ))}
      </div>

      {/* Grid — no modo edição todas as abas mostram o rascunho; a troca é feita em "Por Turma" */}
      {tab === 'class' && (
        <ClassView
          entries={shown}
          grids={grids}
          edit={
            editing
              ? { selected, changed, flagged, onCellClick: handleCellClick }
              : undefined
          }
        />
      )}
      {tab === 'teacher' && <TeacherView entries={shown} grids={grids} />}
      {tab === 'slot' && <SlotView entries={shown} grids={grids} />}
    </div>
  )
}
