'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlarmCheck,
  AlarmClock,
  AlignJustify,
  ArrowLeftRight,
  Ban,
  Building2,
  CalendarCheck,
  CalendarX,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  GripVertical,
  Hash,
  Layers,
  Loader2,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createConstraint } from '@/app/(dashboard)/dashboard/constraints/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConstraintType =
  | 'UNAVAILABLE_SLOT'
  | 'UNAVAILABLE_PERIOD'
  | 'MUST_START_AFTER'
  | 'MUST_END_BEFORE'
  | 'MAX_CONSECUTIVE'
  | 'MIN_GAP_BETWEEN_UNITS'
  | 'PREFER_SINGLE_UNIT_DAY'
  | 'MAX_LESSONS_PER_DAY'
  | 'NO_IDLE_GAPS'
  | 'PREFER_CONSECUTIVE'
  | 'FIXED_DAY'
  | 'AVOID_DAY'
  | 'CUSTOM'

type Priority = 'MANDATORY' | 'PREFERRED'

type WizardData = {
  teacher_id: string
  type: ConstraintType | null
  priority: Priority | null
  days_of_week: number[]
  slot_order: number
  time_from: string
  time_to: string
  max_count: number
  min_gap_slots: number
  school_unit_id: string
  subject_id: string
  description: string
}

type Teacher = { id: string; name: string }
type Unit = { id: string; name: string }
type Subject = { id: string; name: string }

interface ConstraintWizardProps {
  teachers: Teacher[]
  units: Unit[]
  subjects: Subject[]
  initialTeacherId?: string
}

// ─── Constraint type definitions ──────────────────────────────────────────────

type TypeMeta = {
  label: string
  description: string
  icon: React.ElementType
  iconColor: string
}

const CONSTRAINT_TYPES: { type: ConstraintType; meta: TypeMeta }[] = [
  {
    type: 'UNAVAILABLE_SLOT',
    meta: { label: 'Indisponível em Slot',        description: 'Proibido em um horário específico',            icon: Ban,            iconColor: 'text-red-500' },
  },
  {
    type: 'UNAVAILABLE_PERIOD',
    meta: { label: 'Indisponível no Período',     description: 'Fora de um intervalo de tempo',                icon: Clock,          iconColor: 'text-red-400' },
  },
  {
    type: 'MUST_START_AFTER',
    meta: { label: 'Começa a Partir de',          description: 'Aulas só iniciam a partir de um horário',      icon: AlarmClock,     iconColor: 'text-amber-500' },
  },
  {
    type: 'MUST_END_BEFORE',
    meta: { label: 'Termina Até',                 description: 'Aulas devem terminar antes de um horário',     icon: AlarmCheck,     iconColor: 'text-amber-500' },
  },
  {
    type: 'MAX_CONSECUTIVE',
    meta: { label: 'Máx. Consecutivas',           description: 'Limite de aulas seguidas sem intervalo',       icon: Layers,         iconColor: 'text-navy' },
  },
  {
    type: 'MIN_GAP_BETWEEN_UNITS',
    meta: { label: 'Gap entre Unidades',          description: 'Intervalo mínimo entre aulas de unidades',     icon: ArrowLeftRight, iconColor: 'text-navy' },
  },
  {
    type: 'PREFER_SINGLE_UNIT_DAY',
    meta: { label: 'Uma Unidade por Dia',         description: 'Preferir não alternar unidades no mesmo dia',  icon: Building2,      iconColor: 'text-teal' },
  },
  {
    type: 'MAX_LESSONS_PER_DAY',
    meta: { label: 'Máx. Aulas por Dia',          description: 'Limitar quantidade de aulas diárias',          icon: Hash,           iconColor: 'text-navy' },
  },
  {
    type: 'NO_IDLE_GAPS',
    meta: { label: 'Sem Janelas Livres',          description: 'Evitar intervalos sem aula entre horários',    icon: AlignJustify,   iconColor: 'text-slate' },
  },
  {
    type: 'PREFER_CONSECUTIVE',
    meta: { label: 'Preferir Consecutivas',       description: 'Agrupar aulas em sequência sempre que possível', icon: GripVertical, iconColor: 'text-teal' },
  },
  {
    type: 'FIXED_DAY',
    meta: { label: 'Dia Fixo',                    description: 'Professor deve lecionar neste dia',             icon: CalendarCheck,  iconColor: 'text-emerald-600' },
  },
  {
    type: 'AVOID_DAY',
    meta: { label: 'Evitar Dia',                  description: 'Professor prefere não trabalhar neste dia',     icon: CalendarX,      iconColor: 'text-red-400' },
  },
  {
    type: 'CUSTOM',
    meta: { label: 'Regra Customizada',           description: 'Defina uma restrição em texto livre',          icon: Settings,       iconColor: 'text-slate' },
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
] as const

const DAY_LABELS: Record<number, string> = {
  1: 'segundas', 2: 'terças', 3: 'quartas', 4: 'quintas', 5: 'sextas', 6: 'sábados',
}

const DAY_LABELS_SHORT: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
}

function formatDaysSummary(days: number[]): string {
  if (days.length === 0) return 'todos os dias'
  if (days.length === 6) return 'todos os dias'
  const sorted = [...days].sort()
  if (sorted.length === 1) return `às ${DAY_LABELS[sorted[0]]}`
  const last = sorted.pop()!
  return `às ${sorted.map((d) => DAY_LABELS[d]).join(', ')} e ${DAY_LABELS[last]}`
}

function buildSummary(data: WizardData, teachers: Teacher[]): string {
  const teacher = teachers.find((t) => t.id === data.teacher_id)
  const name = teacher?.name ?? 'Professor'
  const days = formatDaysSummary(data.days_of_week)

  switch (data.type) {
    case 'UNAVAILABLE_SLOT':
      return `${name} não pode dar aula no ${data.slot_order}º horário ${days}.`
    case 'UNAVAILABLE_PERIOD':
      return `${name} não pode dar aula entre ${data.time_from} e ${data.time_to} ${days}.`
    case 'MUST_START_AFTER':
      return `${name} só pode começar a partir das ${data.time_from} ${days}.`
    case 'MUST_END_BEFORE':
      return `${name} deve terminar suas aulas até ${data.time_to} ${days}.`
    case 'MAX_CONSECUTIVE':
      return `${name} pode dar no máximo ${data.max_count} aulas consecutivas ${days}.`
    case 'MIN_GAP_BETWEEN_UNITS':
      return `${name} precisa de ao menos ${data.min_gap_slots} slot(s) de intervalo entre aulas de unidades diferentes ${days}.`
    case 'PREFER_SINGLE_UNIT_DAY':
      return `${name} prefere trabalhar em apenas uma unidade por dia ${days}.`
    case 'MAX_LESSONS_PER_DAY':
      return `${name} pode dar no máximo ${data.max_count} aulas por dia ${days}.`
    case 'NO_IDLE_GAPS':
      return `${name} não deve ter janelas livres entre aulas ${days}.`
    case 'PREFER_CONSECUTIVE':
      return `${name} prefere aulas agrupadas consecutivamente ${days}.`
    case 'FIXED_DAY':
      return `${name} deve dar aula obrigatoriamente ${days}.`
    case 'AVOID_DAY':
      return `${name} prefere não dar aula ${days}.`
    case 'CUSTOM':
      return data.description || 'Regra customizada.'
    default:
      return 'Restrição configurada.'
  }
}

const selectClass = cn(
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm',
  'transition-colors outline-none focus-visible:border-ring',
  'disabled:pointer-events-none disabled:opacity-50'
)

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Professor', 'Tipo', 'Configuração', 'Revisão']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEP_LABELS.map((label, idx) => {
        const step = idx + 1
        const done = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                  done && 'bg-navy border-navy text-white',
                  active && 'bg-white border-navy text-navy',
                  !done && !active && 'bg-gray-100 border-gray-300 text-gray-400'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step}
              </div>
              <span className={cn(
                'text-xs font-medium hidden sm:block',
                active ? 'text-navy' : 'text-gray-400'
              )}>
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-12 sm:w-20 mx-1 mb-4 transition-colors',
                  step < current ? 'bg-navy' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1 — Professor ───────────────────────────────────────────────────────

function Step1Teacher({
  teachers,
  selectedId,
  onSelect,
}: {
  teachers: Teacher[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-navy">Selecione o professor</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
        {teachers.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all cursor-pointer',
              selectedId === t.id
                ? 'border-navy bg-navy/5 ring-1 ring-navy'
                : 'border-border hover:border-navy/40 hover:bg-gray-50'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
              selectedId === t.id ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'
            )}>
              {t.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-navy truncate">{t.name}</span>
            {selectedId === t.id && (
              <Check className="ml-auto h-4 w-4 text-navy shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2 — Tipo de restrição ───────────────────────────────────────────────

function Step2Type({
  selectedType,
  onSelect,
}: {
  selectedType: ConstraintType | null
  onSelect: (type: ConstraintType) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-navy">Qual o tipo de restrição?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CONSTRAINT_TYPES.map(({ type, meta }) => {
          const Icon = meta.icon
          const isSelected = selectedType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer',
                isSelected
                  ? 'border-navy bg-navy/5 ring-1 ring-navy'
                  : 'border-border hover:border-navy/30 hover:bg-gray-50'
              )}
            >
              <div className={cn(
                'shrink-0 p-2 rounded-md mt-0.5',
                isSelected ? 'bg-navy/10' : 'bg-gray-100'
              )}>
                <Icon className={cn('h-4 w-4', meta.iconColor)} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{meta.label}</p>
                <p className="text-xs text-slate mt-0.5">{meta.description}</p>
              </div>
              {isSelected && (
                <Check className="ml-auto h-4 w-4 text-navy shrink-0 mt-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 3 — Configuração ────────────────────────────────────────────────────

function Step3Config({
  data,
  units,
  subjects,
  onChange,
}: {
  data: WizardData
  units: Unit[]
  subjects: Subject[]
  onChange: (patch: Partial<WizardData>) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(
    !!(data.school_unit_id || data.subject_id)
  )

  function toggleDay(day: number) {
    const current = data.days_of_week
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort()
    onChange({ days_of_week: next })
  }

  const type = data.type

  const needsTimeFrom = type === 'UNAVAILABLE_PERIOD' || type === 'MUST_START_AFTER'
  const needsTimeTo = type === 'UNAVAILABLE_PERIOD' || type === 'MUST_END_BEFORE'
  const needsSlotOrder = type === 'UNAVAILABLE_SLOT'
  const needsMaxCount = type === 'MAX_CONSECUTIVE' || type === 'MAX_LESSONS_PER_DAY'
  const needsMinGap = type === 'MIN_GAP_BETWEEN_UNITS'
  const needsDescription = type === 'CUSTOM'

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-navy">Configure a restrição</h2>

      {/* Days of week */}
      <div className="space-y-1.5">
        <Label>Dias aplicáveis</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(({ value, label }) => {
            const isActive = data.days_of_week.includes(value)
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer border',
                  isActive
                    ? 'bg-navy text-white border-navy'
                    : 'bg-transparent text-gray-500 border-gray-300 hover:border-navy/50 hover:text-navy'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate/70">Deixe vazio para aplicar a todos os dias.</p>
      </div>

      {/* Slot order */}
      {needsSlotOrder && (
        <div className="space-y-1.5">
          <Label htmlFor="slot_order">Número do slot (1 = primeira aula)</Label>
          <Input
            id="slot_order"
            type="number"
            min={1}
            value={data.slot_order || ''}
            onChange={(e) => onChange({ slot_order: Number(e.target.value) })}
            placeholder="Ex: 1"
            className="max-w-32"
          />
        </div>
      )}

      {/* Time from */}
      {needsTimeFrom && (
        <div className="space-y-1.5">
          <Label htmlFor="time_from">
            {type === 'MUST_START_AFTER' ? 'A partir das' : 'Horário de início'}
          </Label>
          <input
            id="time_from"
            type="time"
            value={data.time_from}
            onChange={(e) => onChange({ time_from: e.target.value })}
            className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring"
          />
        </div>
      )}

      {/* Time to */}
      {needsTimeTo && (
        <div className="space-y-1.5">
          <Label htmlFor="time_to">
            {type === 'MUST_END_BEFORE' ? 'Até as' : 'Horário de fim'}
          </Label>
          <input
            id="time_to"
            type="time"
            value={data.time_to}
            onChange={(e) => onChange({ time_to: e.target.value })}
            className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring"
          />
        </div>
      )}

      {/* Max count */}
      {needsMaxCount && (
        <div className="space-y-1.5">
          <Label htmlFor="max_count">
            {type === 'MAX_CONSECUTIVE' ? 'Máximo de aulas consecutivas' : 'Máximo de aulas por dia'}
          </Label>
          <Input
            id="max_count"
            type="number"
            min={1}
            value={data.max_count || ''}
            onChange={(e) => onChange({ max_count: Number(e.target.value) })}
            placeholder="Ex: 3"
            className="max-w-32"
          />
        </div>
      )}

      {/* Min gap slots */}
      {needsMinGap && (
        <div className="space-y-1.5">
          <Label htmlFor="min_gap_slots">Quantidade mínima de slots de intervalo</Label>
          <Input
            id="min_gap_slots"
            type="number"
            min={1}
            value={data.min_gap_slots || ''}
            onChange={(e) => onChange({ min_gap_slots: Number(e.target.value) })}
            placeholder="Ex: 2"
            className="max-w-32"
          />
        </div>
      )}

      {/* Description for CUSTOM */}
      {needsDescription && (
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição da regra</Label>
          <textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Ex: Professor só pode dar aula nos andares térreos nos dias de chuva…"
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none resize-none focus-visible:border-ring"
          />
        </div>
      )}

      {/* Advanced section */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <span>Filtros avançados (opcional)</span>
          {showAdvanced ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border bg-gray-50/50">
            <div className="space-y-1.5">
              <Label htmlFor="school_unit_id">Restringir a unidade (opcional)</Label>
              <select
                id="school_unit_id"
                value={data.school_unit_id}
                onChange={(e) => onChange({ school_unit_id: e.target.value })}
                className={selectClass}
              >
                <option value="">Todas as unidades</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject_id">Restringir a disciplina (opcional)</Label>
              <select
                id="subject_id"
                value={data.subject_id}
                onChange={(e) => onChange({ subject_id: e.target.value })}
                className={selectClass}
              >
                <option value="">Todas as disciplinas</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Step 4 — Revisão e prioridade ───────────────────────────────────────────

function Step4Review({
  data,
  teachers,
  units,
  subjects,
  onChangePriority,
  onSubmit,
  isSubmitting,
}: {
  data: WizardData
  teachers: Teacher[]
  units: Unit[]
  subjects: Subject[]
  onChangePriority: (p: Priority) => void
  onSubmit: () => void
  isSubmitting: boolean
}) {
  const summary = buildSummary(data, teachers)
  const typeMeta = CONSTRAINT_TYPES.find((t) => t.type === data.type)?.meta
  const teacher = teachers.find((t) => t.id === data.teacher_id)
  const unit = units.find((u) => u.id === data.school_unit_id)
  const subject = subjects.find((s) => s.id === data.subject_id)

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-navy">Revisão e prioridade</h2>

      {/* Summary card */}
      <div className="p-4 bg-navy/5 border border-navy/15 rounded-lg space-y-3">
        <p className="text-xs font-semibold text-navy/60 uppercase tracking-wide">Resumo</p>
        <p className="text-sm text-navy font-medium leading-relaxed">{summary}</p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {teacher && (
            <div>
              <p className="text-xs text-slate">Professor</p>
              <p className="text-xs font-medium text-navy">{teacher.name}</p>
            </div>
          )}
          {typeMeta && (
            <div>
              <p className="text-xs text-slate">Tipo</p>
              <p className="text-xs font-medium text-navy">{typeMeta.label}</p>
            </div>
          )}
          {data.days_of_week.length > 0 && (
            <div>
              <p className="text-xs text-slate">Dias</p>
              <p className="text-xs font-medium text-navy">
                {data.days_of_week.map((d) => DAY_LABELS_SHORT[d]).join(', ')}
              </p>
            </div>
          )}
          {unit && (
            <div>
              <p className="text-xs text-slate">Unidade</p>
              <p className="text-xs font-medium text-navy">{unit.name}</p>
            </div>
          )}
          {subject && (
            <div>
              <p className="text-xs text-slate">Disciplina</p>
              <p className="text-xs font-medium text-navy">{subject.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Priority selection */}
      <div className="space-y-2">
        <Label>Prioridade</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangePriority('MANDATORY')}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
              data.priority === 'MANDATORY'
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 hover:border-red-300 hover:bg-red-50/30'
            )}
          >
            <span className="text-2xl">🚫</span>
            <div className="text-center">
              <p className="text-sm font-bold text-red-700">OBRIGATÓRIA</p>
              <p className="text-xs text-red-500/80 mt-0.5">Deve ser respeitada</p>
            </div>
            {data.priority === 'MANDATORY' && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangePriority('PREFERRED')}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
              data.priority === 'PREFERRED'
                ? 'border-amber-400 bg-amber-50'
                : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/30'
            )}
          >
            <span className="text-2xl">⭐</span>
            <div className="text-center">
              <p className="text-sm font-bold text-amber-700">PREFERENCIAL</p>
              <p className="text-xs text-amber-600/80 mt-0.5">Tenta-se respeitar</p>
            </div>
            {data.priority === 'PREFERRED' && (
              <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Save button */}
      <Button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || !data.priority}
        className="w-full bg-navy hover:bg-navy/90 text-white cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando…
          </>
        ) : (
          'Salvar Restrição'
        )}
      </Button>
    </div>
  )
}

// ─── Validation per step ──────────────────────────────────────────────────────

function validateStep(step: number, data: WizardData): string | null {
  if (step === 1 && !data.teacher_id) return 'Selecione um professor.'
  if (step === 2 && !data.type) return 'Selecione um tipo de restrição.'
  if (step === 3) {
    if (data.type === 'UNAVAILABLE_SLOT' && !data.slot_order) return 'Informe o número do slot.'
    if ((data.type === 'UNAVAILABLE_PERIOD' || data.type === 'MUST_START_AFTER') && !data.time_from)
      return 'Informe o horário de início.'
    if ((data.type === 'UNAVAILABLE_PERIOD' || data.type === 'MUST_END_BEFORE') && !data.time_to)
      return 'Informe o horário de fim.'
    if ((data.type === 'MAX_CONSECUTIVE' || data.type === 'MAX_LESSONS_PER_DAY') && !data.max_count)
      return 'Informe o valor máximo.'
    if (data.type === 'MIN_GAP_BETWEEN_UNITS' && !data.min_gap_slots)
      return 'Informe a quantidade de slots.'
    if (data.type === 'CUSTOM' && !data.description.trim())
      return 'Descreva a regra customizada.'
  }
  return null
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const INITIAL_DATA: WizardData = {
  teacher_id: '',
  type: null,
  priority: null,
  days_of_week: [],
  slot_order: 0,
  time_from: '',
  time_to: '',
  max_count: 0,
  min_gap_slots: 0,
  school_unit_id: '',
  subject_id: '',
  description: '',
}

export function ConstraintWizard({
  teachers,
  units,
  subjects,
  initialTeacherId,
}: ConstraintWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(initialTeacherId ? 2 : 1)
  const [data, setData] = useState<WizardData>({
    ...INITIAL_DATA,
    teacher_id: initialTeacherId ?? '',
  })
  const [stepError, setStepError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function patchData(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }))
  }

  function goNext() {
    const err = validateStep(step, data)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    setStep((s) => s + 1)
  }

  function goBack() {
    setStepError(null)
    setStep((s) => s - 1)
  }

  async function handleSubmit() {
    if (!data.priority) {
      setStepError('Selecione a prioridade.')
      return
    }
    setStepError(null)
    setIsSubmitting(true)

    const summary = buildSummary(data, teachers)

    const payload = {
      teacher_id: data.teacher_id,
      type: data.type!,
      priority: data.priority,
      days_of_week: data.days_of_week,
      school_unit_id: data.school_unit_id || null,
      subject_id: data.subject_id || null,
      time_from: data.time_from || null,
      time_to: data.time_to || null,
      slot_order: data.slot_order || null,
      min_gap_slots: data.min_gap_slots || null,
      value:
        data.type === 'MAX_CONSECUTIVE' || data.type === 'MAX_LESSONS_PER_DAY'
          ? { count: data.max_count }
          : null,
      description: data.type === 'CUSTOM' ? data.description : summary,
    }

    const result = await createConstraint(payload)
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar restrição.')
      return
    }

    toast.success('Restrição criada com sucesso!')
    router.push('/dashboard/constraints')
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex justify-center">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6">
          {step === 1 && (
            <Step1Teacher
              teachers={teachers}
              selectedId={data.teacher_id}
              onSelect={(id) => patchData({ teacher_id: id })}
            />
          )}
          {step === 2 && (
            <Step2Type
              selectedType={data.type}
              onSelect={(type) => patchData({ type })}
            />
          )}
          {step === 3 && (
            <Step3Config
              data={data}
              units={units}
              subjects={subjects}
              onChange={patchData}
            />
          )}
          {step === 4 && (
            <Step4Review
              data={data}
              teachers={teachers}
              units={units}
              subjects={subjects}
              onChangePriority={(p) => patchData({ priority: p })}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          )}

          {/* Error */}
          {stepError && (
            <p className="mt-3 text-sm text-red-500">{stepError}</p>
          )}

          {/* Navigation */}
          {step < 4 && (
            <div className="flex justify-between mt-6 pt-4 border-t border-border">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  className="cursor-pointer"
                >
                  Voltar
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard/constraints')}
                  className="cursor-pointer"
                >
                  Cancelar
                </Button>
              )}
              <Button
                type="button"
                onClick={goNext}
                className="bg-navy hover:bg-navy/90 text-white cursor-pointer gap-1.5"
              >
                Continuar
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="flex justify-start mt-4 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="cursor-pointer"
              >
                Voltar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
