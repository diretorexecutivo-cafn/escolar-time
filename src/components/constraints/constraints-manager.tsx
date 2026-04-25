'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlarmCheck,
  AlarmClock,
  AlignJustify,
  ArrowLeftRight,
  Ban,
  Building2,
  CalendarCheck,
  CalendarX,
  Clock,
  GripVertical,
  Hash,
  Layers,
  Plus,
  Power,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  deleteConstraint,
  toggleConstraintStatus,
} from '@/app/(dashboard)/dashboard/constraints/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Teacher = { id: string; name: string; active: boolean }

type Constraint = {
  id: string
  teacher_id: string
  type: string
  priority: string
  days_of_week: number[] | null
  time_from: string | null
  time_to: string | null
  slot_order: number | null
  min_gap_slots: number | null
  value: Record<string, unknown> | null
  description: string | null
  active: boolean
  school_unit_id: string | null
  subject_id: string | null
  teachers: { id: string; name: string } | { id: string; name: string }[] | null
  school_units: { id: string; name: string } | { id: string; name: string }[] | null
  subjects: { id: string; name: string } | { id: string; name: string }[] | null
}

interface ConstraintsManagerProps {
  teachers: Teacher[]
  constraints: Constraint[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

type ConstraintMeta = {
  label: string
  icon: React.ElementType
  color: string
}

const CONSTRAINT_META: Record<string, ConstraintMeta> = {
  UNAVAILABLE_SLOT:       { label: 'Indisponível em Slot',         icon: Ban,            color: 'text-red-500' },
  UNAVAILABLE_PERIOD:     { label: 'Indisponível no Período',      icon: Clock,          color: 'text-red-400' },
  MUST_START_AFTER:       { label: 'Começa a Partir de',           icon: AlarmClock,     color: 'text-amber-500' },
  MUST_END_BEFORE:        { label: 'Termina Até',                  icon: AlarmCheck,     color: 'text-amber-500' },
  MAX_CONSECUTIVE:        { label: 'Máx. Aulas Consecutivas',      icon: Layers,         color: 'text-navy' },
  MIN_GAP_BETWEEN_UNITS:  { label: 'Gap entre Unidades',           icon: ArrowLeftRight, color: 'text-navy' },
  PREFER_SINGLE_UNIT_DAY: { label: 'Uma Unidade por Dia',          icon: Building2,      color: 'text-teal' },
  MAX_LESSONS_PER_DAY:    { label: 'Máx. Aulas por Dia',           icon: Hash,           color: 'text-navy' },
  NO_IDLE_GAPS:           { label: 'Sem Janelas Livres',           icon: AlignJustify,   color: 'text-slate' },
  PREFER_CONSECUTIVE:     { label: 'Preferir Consecutivas',        icon: GripVertical,   color: 'text-teal' },
  FIXED_DAY:              { label: 'Dia Fixo',                     icon: CalendarCheck,  color: 'text-emerald-600' },
  AVOID_DAY:              { label: 'Evitar Dia',                   icon: CalendarX,      color: 'text-red-400' },
  CUSTOM:                 { label: 'Regra Customizada',            icon: Settings,       color: 'text-slate' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstOf<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function formatDays(days: number[] | null): string {
  if (!days || days.length === 0) return 'todos os dias'
  const sorted = [...days].sort()
  if (sorted.length === 6) return 'todos os dias'
  return sorted.map((d) => DAY_LABELS[d] ?? d).join(', ')
}

function generateSummary(c: Constraint): string {
  const teacher = firstOf(c.teachers)
  const name = teacher?.name ?? 'Professor'
  const days = c.days_of_week?.length ? ` às ${formatDays(c.days_of_week)}` : ''
  const unit = firstOf(c.school_units)
  const subject = firstOf(c.subjects)
  const unitNote = unit ? ` na ${unit.name}` : ''
  const subjNote = subject ? ` em ${subject.name}` : ''

  switch (c.type) {
    case 'UNAVAILABLE_SLOT':
      return `${name} não pode dar aula no ${c.slot_order ?? '?'}º horário${days}${unitNote}${subjNote}`
    case 'UNAVAILABLE_PERIOD':
      return `${name} não pode dar aula entre ${c.time_from ?? '?'} e ${c.time_to ?? '?'}${days}`
    case 'MUST_START_AFTER':
      return `${name} só pode começar a partir das ${c.time_from ?? '?'}${days}`
    case 'MUST_END_BEFORE':
      return `${name} deve terminar até ${c.time_to ?? '?'}${days}`
    case 'MAX_CONSECUTIVE': {
      const count = (c.value as { count?: number } | null)?.count ?? '?'
      return `${name} pode dar no máximo ${count} aulas consecutivas${days}`
    }
    case 'MIN_GAP_BETWEEN_UNITS':
      return `${name} precisa de ao menos ${c.min_gap_slots ?? '?'} slot(s) entre unidades diferentes${days}`
    case 'PREFER_SINGLE_UNIT_DAY':
      return `${name} prefere trabalhar em apenas uma unidade por dia${days}`
    case 'MAX_LESSONS_PER_DAY': {
      const count = (c.value as { count?: number } | null)?.count ?? '?'
      return `${name} pode dar no máximo ${count} aulas por dia${days}`
    }
    case 'NO_IDLE_GAPS':
      return `${name} não deve ter janelas livres entre aulas${days}`
    case 'PREFER_CONSECUTIVE':
      return `${name} prefere aulas agrupadas consecutivamente${days}`
    case 'FIXED_DAY':
      return `${name} deve dar aula obrigatoriamente${days}`
    case 'AVOID_DAY':
      return `${name} prefere não dar aula${days}`
    case 'CUSTOM':
      return c.description ?? 'Regra customizada'
    default:
      return 'Restrição configurada'
  }
}

// ─── Constraint card ──────────────────────────────────────────────────────────

interface ConstraintCardProps {
  constraint: Constraint
  onToggle: () => void
  onDelete: () => void
  isActionPending: boolean
}

function ConstraintCard({
  constraint,
  onToggle,
  onDelete,
  isActionPending,
}: ConstraintCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = CONSTRAINT_META[constraint.type] ?? CONSTRAINT_META.CUSTOM
  const Icon = meta.icon
  const isMandatory = constraint.priority === 'MANDATORY'
  const days = constraint.days_of_week ?? []

  return (
    <Card
      className={cn(
        'border border-border shadow-sm transition-opacity',
        !constraint.active && 'opacity-60'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('shrink-0 p-1.5 rounded-md bg-gray-100')}>
              <Icon className={cn('h-4 w-4', meta.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy truncate">{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              className={
                isMandatory
                  ? 'bg-red-100 text-red-700 border-red-200 text-xs'
                  : 'bg-amber-100 text-amber-700 border-amber-200 text-xs'
              }
            >
              {isMandatory ? 'Obrigatória' : 'Preferencial'}
            </Badge>
            <Badge
              className={
                constraint.active
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'
                  : 'bg-gray-100 text-gray-500 border-gray-200 text-xs'
              }
            >
              {constraint.active ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
        </div>

        {/* Summary */}
        <p className="text-xs text-slate leading-relaxed">{generateSummary(constraint)}</p>

        {/* Days */}
        {days.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6].map((day) => (
              <span
                key={day}
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  days.includes(day)
                    ? 'bg-navy text-white'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                {DAY_LABELS[day]}
              </span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={isActionPending}
            className="gap-1.5 cursor-pointer"
            title={constraint.active ? 'Desativar' : 'Ativar'}
          >
            <Power className={cn('h-3.5 w-3.5', constraint.active ? 'text-emerald-600' : 'text-gray-400')} />
            {constraint.active ? 'Desativar' : 'Ativar'}
          </Button>

          {confirmDelete ? (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-red-600 font-medium">Confirmar exclusão?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={isActionPending}
                className="h-7 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50 cursor-pointer"
              >
                Sim
              </Button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={isActionPending}
              className="ml-auto cursor-pointer text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main manager ─────────────────────────────────────────────────────────────

export function ConstraintsManager({ teachers, constraints }: ConstraintsManagerProps) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = selectedTeacherId
    ? constraints.filter((c) => c.teacher_id === selectedTeacherId)
    : []

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId)

  function handleToggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleConstraintStatus(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao alterar status.')
      else toast.success('Status atualizado.')
      setPendingId(null)
    })
  }

  function handleDelete(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await deleteConstraint(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao excluir.')
      else toast.success('Restrição excluída.')
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Restrições</h1>
          <p className="text-slate text-sm mt-1">
            Configure disponibilidades e preferências dos professores.
          </p>
        </div>
        <Link href="/dashboard/constraints/new">
          <Button className="bg-navy hover:bg-navy/90 text-white cursor-pointer gap-2">
            <Plus className="h-4 w-4" />
            Nova Restrição
          </Button>
        </Link>
      </div>

      {/* Teacher filter */}
      <div className="max-w-sm space-y-1.5">
        <label htmlFor="teacher-select" className="text-sm font-medium text-navy">
          Professor
        </label>
        <select
          id="teacher-select"
          value={selectedTeacherId}
          onChange={(e) => setSelectedTeacherId(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring"
        >
          <option value="">Selecione um professor…</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {!selectedTeacherId ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert className="h-12 w-12 text-slate/30 mb-4" />
          <p className="text-slate font-medium">Selecione um professor</p>
          <p className="text-slate/60 text-sm mt-1">
            Escolha um professor acima para ver e gerenciar suas restrições.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <ShieldAlert className="h-10 w-10 text-slate/30 mb-3" />
          <p className="text-slate font-medium">
            {selectedTeacher?.name} não tem restrições cadastradas.
          </p>
          <Link
            href={`/dashboard/constraints/new?teacherId=${selectedTeacherId}`}
            className="mt-3 text-sm text-navy hover:underline font-medium"
          >
            + Adicionar primeira restrição
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate">
            {filtered.length} restrição{filtered.length !== 1 ? 'ões' : ''} de{' '}
            <span className="font-medium text-navy">{selectedTeacher?.name}</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c) => (
              <ConstraintCard
                key={c.id}
                constraint={c}
                isActionPending={isPending && pendingId === c.id}
                onToggle={() => handleToggle(c.id)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
