'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Copy,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  createTimeGrid,
  updateTimeGrid,
} from '@/app/(dashboard)/dashboard/grids/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotType = 'LESSON' | 'BREAK'

type Slot = {
  key: string
  type: SlotType
  duration_minutes: number
  label: string
}

type SlotsByDay = Record<number, Slot[]>

type SchoolUnit = { id: string; name: string }
type ClassGroup = {
  id: string
  name: string
  school_units: SchoolUnit | SchoolUnit[] | null
}

interface GridFormProps {
  classGroups: ClassGroup[]
  initialData?: {
    id: string
    class_group_id: string | null
    name: string
    shift: string
    start_time: string
    days_of_week: number[]
    active: boolean
    slotsByDay: Record<
      number,
      {
        id: string
        day_of_week: number
        slot_order: number
        duration_minutes: number
        type: string
        label: string | null
      }[]
    >
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Matutino' },
  { value: 'AFTERNOON', label: 'Vespertino' },
  { value: 'EVENING', label: 'Noturno' },
] as const

const DAYS = [
  { value: 1, label: 'Seg', full: 'Segunda' },
  { value: 2, label: 'Ter', full: 'Terça' },
  { value: 3, label: 'Qua', full: 'Quarta' },
  { value: 4, label: 'Qui', full: 'Quinta' },
  { value: 5, label: 'Sex', full: 'Sexta' },
  { value: 6, label: 'Sáb', full: 'Sábado' },
] as const

const DAY_LABELS: Record<number, string> = Object.fromEntries(
  DAYS.map((d) => [d.value, d.full])
)

type TemplateName =
  | '5 aulas (50min) com intervalo'
  | '6 aulas (50min) com intervalo'
  | '4 aulas (45min) com intervalo'

const TEMPLATES: Record<TemplateName, Omit<Slot, 'key'>[]> = {
  '5 aulas (50min) com intervalo': [
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'BREAK', duration_minutes: 20, label: 'Intervalo' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
  ],
  '6 aulas (50min) com intervalo': [
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'BREAK', duration_minutes: 20, label: 'Intervalo' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
    { type: 'LESSON', duration_minutes: 50, label: '' },
  ],
  '4 aulas (45min) com intervalo': [
    { type: 'LESSON', duration_minutes: 45, label: '' },
    { type: 'LESSON', duration_minutes: 45, label: '' },
    { type: 'BREAK', duration_minutes: 15, label: 'Intervalo' },
    { type: 'LESSON', duration_minutes: 45, label: '' },
    { type: 'LESSON', duration_minutes: 45, label: '' },
  ],
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const gridSchema = z.object({
  class_group_id: z.string().uuid('Selecione uma turma'),
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo'),
  shift: z.enum(['MORNING', 'AFTERNOON', 'EVENING'], {
    message: 'Selecione um turno',
  }),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido'),
  days_of_week: z.array(z.number()).min(1, 'Selecione ao menos 1 dia da semana'),
})

type GridFormValues = z.infer<typeof gridSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function computeSlotTimes(
  slots: Slot[],
  startTime: string
): { start: string; end: string }[] {
  let cursor = startTime
  return slots.map((s) => {
    const start = cursor
    const end = addMinutes(cursor, s.duration_minutes)
    cursor = end
    return { start, end }
  })
}

let _keyCounter = 0
const nextKey = () => `slot-${++_keyCounter}`

function makeSlot(overrides: Partial<Omit<Slot, 'key'>> = {}): Slot {
  return {
    key: nextKey(),
    type: 'LESSON',
    duration_minutes: 50,
    label: '',
    ...overrides,
  }
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const selectClass = cn(
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm',
  'transition-colors outline-none focus-visible:border-ring',
  'disabled:pointer-events-none disabled:opacity-50'
)

// ─── Sortable slot row ────────────────────────────────────────────────────────

interface SortableSlotRowProps {
  slot: Slot
  lessonNum: number | null
  timeBadge: string
  onToggleType: () => void
  onChangeDuration: (value: number) => void
  onChangeLabel: (value: string) => void
  onRemove: () => void
}

function SortableSlotRow({
  slot,
  lessonNum,
  timeBadge,
  onToggleType,
  onChangeDuration,
  onChangeLabel,
  onRemove,
}: SortableSlotRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isLesson = slot.type === 'LESSON'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-wrap items-center gap-2.5 p-2.5 rounded-lg border',
        isLesson ? 'bg-navy/5 border-navy/15' : 'bg-ocre/5 border-ocre/20'
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        aria-label="Reordenar slot"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Label numeric / badge */}
      <div className="w-16 shrink-0 text-center">
        {isLesson ? (
          <span className="text-xs font-bold text-navy">Aula {lessonNum}</span>
        ) : (
          <span className="text-xs font-bold text-ocre">Intervalo</span>
        )}
      </div>

      {/* Time badge (computed) */}
      <span className="text-xs font-mono px-2 py-0.5 rounded bg-white border border-border text-slate shrink-0">
        {timeBadge}
      </span>

      {/* Type toggle */}
      <button
        type="button"
        onClick={onToggleType}
        className={cn(
          'text-xs px-2.5 py-1 rounded border font-medium cursor-pointer transition-colors shrink-0',
          isLesson
            ? 'border-navy text-navy hover:bg-navy hover:text-white'
            : 'border-ocre text-ocre hover:bg-ocre hover:text-white'
        )}
      >
        {isLesson ? 'Aula' : 'Intervalo'}
      </button>

      {/* Duration */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate shrink-0">Duração</span>
        <input
          type="number"
          min={5}
          step={5}
          value={slot.duration_minutes}
          onChange={(e) => onChangeDuration(Number(e.target.value))}
          className="h-8 w-20 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring"
        />
        <span className="text-xs text-slate shrink-0">min</span>
      </div>

      {/* Label (só BREAK) */}
      {!isLesson && (
        <Input
          placeholder="Rótulo"
          value={slot.label}
          onChange={(e) => onChangeLabel(e.target.value)}
          className="h-8 text-sm w-36"
        />
      )}

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
        title="Remover slot"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Copy-to-other-days modal ─────────────────────────────────────────────────

interface CopyDialogProps {
  sourceDay: number
  availableDays: number[]
  onConfirm: (targetDays: number[]) => void
  onClose: () => void
}

function CopyDialog({ sourceDay, availableDays, onConfirm, onClose }: CopyDialogProps) {
  const [selected, setSelected] = useState<number[]>([])

  function toggle(day: number) {
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-navy">
            Copiar slots para outros dias
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate">
            Os slots de <span className="font-semibold text-navy">{DAY_LABELS[sourceDay]}</span>{' '}
            serão copiados para os dias selecionados abaixo. Slots existentes nesses dias serão
            substituídos.
          </p>
          <div className="flex flex-wrap gap-2">
            {availableDays.map((day) => {
              const isSelected = selected.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggle(day)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer border',
                    isSelected
                      ? 'bg-navy text-white border-navy'
                      : 'bg-transparent text-gray-500 border-gray-300 hover:border-navy/50 hover:text-navy'
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              )
            })}
            {availableDays.length === 0 && (
              <p className="text-xs text-slate/60">Nenhum outro dia disponível.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onConfirm(selected)}
            disabled={selected.length === 0}
            className="bg-navy hover:bg-navy/90 text-white cursor-pointer"
          >
            Copiar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Day panel (tab content) ──────────────────────────────────────────────────

interface DayPanelProps {
  day: number
  slots: Slot[]
  startTime: string
  otherDays: number[]
  onChange: (slots: Slot[]) => void
  onCopy: (targetDays: number[]) => void
}

function DayPanel({ day, slots, startTime, otherDays, onChange, onCopy }: DayPanelProps) {
  const [copyOpen, setCopyOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const computed = useMemo(() => computeSlotTimes(slots, startTime), [slots, startTime])

  let lessonCounter = 0
  const lessonNumbers = slots.map((s) =>
    s.type === 'LESSON' ? ++lessonCounter : null
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = slots.findIndex((s) => s.key === active.id)
    const newIndex = slots.findIndex((s) => s.key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(slots, oldIndex, newIndex))
  }

  function addSlot(type: SlotType) {
    const defaults: Partial<Omit<Slot, 'key'>> =
      type === 'BREAK'
        ? { type, duration_minutes: 20, label: 'Intervalo' }
        : { type, duration_minutes: 50, label: '' }
    onChange([...slots, makeSlot(defaults)])
  }

  function removeSlot(key: string) {
    onChange(slots.filter((s) => s.key !== key))
  }

  function updateSlot(key: string, patch: Partial<Omit<Slot, 'key'>>) {
    onChange(slots.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function toggleType(key: string) {
    const target = slots.find((s) => s.key === key)
    if (!target) return
    const nextType: SlotType = target.type === 'LESSON' ? 'BREAK' : 'LESSON'
    updateSlot(key, {
      type: nextType,
      label: nextType === 'BREAK' ? target.label || 'Intervalo' : '',
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy">Slots de {DAY_LABELS[day]}</p>
        {slots.length > 0 && otherDays.length > 0 && (
          <button
            type="button"
            onClick={() => setCopyOpen(true)}
            className="text-xs text-slate hover:text-navy flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar para outros dias
          </button>
        )}
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-slate/60 text-center py-6 border border-dashed border-border rounded-lg">
          Nenhum slot em {DAY_LABELS[day]}. Adicione abaixo ou use um template.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={slots.map((s) => s.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {slots.map((slot, idx) => {
                const { start, end } = computed[idx]
                return (
                  <SortableSlotRow
                    key={slot.key}
                    slot={slot}
                    lessonNum={lessonNumbers[idx]}
                    timeBadge={`${start} – ${end}`}
                    onToggleType={() => toggleType(slot.key)}
                    onChangeDuration={(v) =>
                      updateSlot(slot.key, { duration_minutes: isNaN(v) ? 0 : v })
                    }
                    onChangeLabel={(v) => updateSlot(slot.key, { label: v })}
                    onRemove={() => removeSlot(slot.key)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addSlot('LESSON')}
          className="gap-1.5 cursor-pointer border-navy/30 text-navy hover:bg-navy/5"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Aula
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addSlot('BREAK')}
          className="gap-1.5 cursor-pointer border-ocre/40 text-ocre hover:bg-ocre/5"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Intervalo
        </Button>
      </div>

      {copyOpen && (
        <CopyDialog
          sourceDay={day}
          availableDays={otherDays}
          onConfirm={(targets) => {
            onCopy(targets)
            setCopyOpen(false)
          }}
          onClose={() => setCopyOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function GridForm({ classGroups, initialData }: GridFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GridFormValues>({
    resolver: zodResolver(gridSchema),
    defaultValues: {
      class_group_id: initialData?.class_group_id ?? '',
      name: initialData?.name ?? '',
      shift: (initialData?.shift as GridFormValues['shift']) ?? undefined,
      start_time: initialData?.start_time ?? '07:00',
      days_of_week: initialData?.days_of_week ?? [],
    },
  })

  const watchedDays = watch('days_of_week') ?? []
  const watchedStartTime = watch('start_time') || '07:00'

  const [slotsByDay, setSlotsByDay] = useState<SlotsByDay>(() => {
    const initial: SlotsByDay = {}
    if (initialData?.slotsByDay) {
      for (const [dayStr, dbSlots] of Object.entries(initialData.slotsByDay)) {
        const day = Number(dayStr)
        initial[day] = dbSlots.map((s) =>
          makeSlot({
            type: s.type as SlotType,
            duration_minutes: s.duration_minutes,
            label: s.label ?? '',
          })
        )
      }
    }
    return initial
  })

  const [activeTab, setActiveTab] = useState<number | null>(
    initialData?.days_of_week?.[0] ?? null
  )

  const [slotsError, setSlotsError] = useState<string | null>(null)

  // Ensure activeTab stays valid as days_of_week changes
  if (
    watchedDays.length > 0 &&
    (activeTab === null || !watchedDays.includes(activeTab))
  ) {
    // side-effect in render is ok here because setState is batched
    setActiveTab(watchedDays[0])
  }

  // ── Day toggle ──
  function toggleDay(day: number) {
    const next = watchedDays.includes(day)
      ? watchedDays.filter((d) => d !== day)
      : [...watchedDays, day].sort()
    setValue('days_of_week', next, { shouldValidate: true })

    setSlotsByDay((prev) => {
      if (next.includes(day) && !prev[day]) return { ...prev, [day]: [] }
      return prev
    })
  }

  // ── Slot mutations per day ──
  function setSlotsForDay(day: number, slots: Slot[]) {
    setSlotsByDay((prev) => ({ ...prev, [day]: slots }))
  }

  // ── Template aplicado a todos os dias selecionados ──
  function applyTemplate(name: TemplateName) {
    if (watchedDays.length === 0) {
      toast.error('Selecione ao menos 1 dia antes de aplicar um template.')
      return
    }
    const template = TEMPLATES[name]
    const next: SlotsByDay = { ...slotsByDay }
    for (const day of watchedDays) {
      next[day] = template.map((t) => makeSlot(t))
    }
    setSlotsByDay(next)
    setSlotsError(null)
    toast.success(`Template aplicado a ${watchedDays.length} dia(s).`)
  }

  // ── Copy slots from one day to others ──
  function copySlotsToDays(sourceDay: number, targetDays: number[]) {
    const source = slotsByDay[sourceDay] ?? []
    const next: SlotsByDay = { ...slotsByDay }
    for (const day of targetDays) {
      next[day] = source.map((s) => makeSlot({ ...s }))
    }
    setSlotsByDay(next)
    toast.success(`Slots copiados para ${targetDays.length} dia(s).`)
  }

  // ── Validation ──
  function validateSlots(): string | null {
    if (watchedDays.length === 0) return 'Selecione ao menos 1 dia da semana.'
    for (const day of watchedDays) {
      const slots = slotsByDay[day] ?? []
      if (!slots.some((s) => s.type === 'LESSON'))
        return `${DAY_LABELS[day]}: adicione pelo menos 1 aula.`
      for (let i = 0; i < slots.length; i++) {
        if (!Number.isFinite(slots[i].duration_minutes) || slots[i].duration_minutes < 5)
          return `${DAY_LABELS[day]} (slot ${i + 1}): duração mínima é 5 minutos.`
      }
    }
    return null
  }

  // ── Submit ──
  async function onSubmit(values: GridFormValues) {
    const err = validateSlots()
    if (err) {
      setSlotsError(err)
      if (watchedDays.length > 0) setActiveTab(watchedDays[0])
      return
    }
    setSlotsError(null)

    const payloadSlots: Record<
      number,
      Array<{
        slot_order: number
        duration_minutes: number
        start_time: string
        end_time: string
        type: SlotType
        label?: string
      }>
    > = {}

    for (const day of values.days_of_week) {
      const daySlots = slotsByDay[day] ?? []
      const computed = computeSlotTimes(daySlots, values.start_time)
      payloadSlots[day] = daySlots.map((s, idx) => ({
        slot_order: idx + 1,
        duration_minutes: s.duration_minutes,
        start_time: computed[idx].start,
        end_time: computed[idx].end,
        type: s.type,
        label: s.type === 'BREAK' ? s.label : undefined,
      }))
    }

    const gridPayload = {
      class_group_id: values.class_group_id,
      name: values.name,
      shift: values.shift,
      start_time: values.start_time,
      days_of_week: values.days_of_week,
    }

    const result = isEditing
      ? await updateTimeGrid(initialData.id, gridPayload, payloadSlots)
      : await createTimeGrid(gridPayload, payloadSlots)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar grade.')
      return
    }

    toast.success(isEditing ? 'Grade atualizada!' : 'Grade criada!')
    router.push('/dashboard/grids')
  }

  // ── Class group options ──
  const classGroupOptions = classGroups.map((cg) => {
    const unit = firstOf(cg.school_units)
    return {
      id: cg.id,
      label: unit ? `${cg.name} (${unit.name})` : cg.name,
    }
  })

  // ── Other days for copy dialog ──
  const otherDays = (day: number) => watchedDays.filter((d) => d !== day)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── Seção 1: Dados da grade ── */}
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6 space-y-5">
          <h2 className="text-base font-semibold text-navy">Dados da Grade</h2>

          {/* Turma */}
          <div className="space-y-1.5">
            <Label htmlFor="class_group_id">Turma *</Label>
            <select
              id="class_group_id"
              className={selectClass}
              {...register('class_group_id')}
            >
              <option value="">Selecione uma turma…</option>
              {classGroupOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.class_group_id && (
              <p className="text-xs text-red-500">{errors.class_group_id.message}</p>
            )}
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" placeholder="Ex: Matutino 2026" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Turno */}
            <div className="space-y-1.5">
              <Label htmlFor="shift">Turno *</Label>
              <select id="shift" className={selectClass} {...register('shift')}>
                <option value="">Selecione um turno…</option>
                {SHIFT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.shift && <p className="text-xs text-red-500">{errors.shift.message}</p>}
            </div>

            {/* Horário de início */}
            <div className="space-y-1.5">
              <Label htmlFor="start_time">Horário de início *</Label>
              <input
                id="start_time"
                type="time"
                className={selectClass}
                {...register('start_time')}
              />
              {errors.start_time && (
                <p className="text-xs text-red-500">{errors.start_time.message}</p>
              )}
            </div>
          </div>

          {/* Dias da semana */}
          <div className="space-y-1.5">
            <Label>Dias da semana *</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(({ value, label }) => {
                const isActive = watchedDays.includes(value)
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
            {errors.days_of_week && (
              <p className="text-xs text-red-500">{errors.days_of_week.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Seção 2: Slots por dia ── */}
      <Card className="border border-border shadow-sm">
        <CardContent className="pt-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-navy">Horários por Dia</h2>
            <p className="text-xs text-slate">
              Início: <span className="font-mono font-medium">{watchedStartTime}</span>
            </p>
          </div>

          {/* Templates */}
          <div className="space-y-2">
            <p className="text-xs text-slate font-medium">
              Templates rápidos (aplicados a todos os dias selecionados):
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TEMPLATES) as TemplateName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyTemplate(name)}
                  className="text-xs px-3 py-1.5 rounded-md border border-ocre text-ocre hover:bg-ocre/10 transition-colors cursor-pointer font-medium"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {watchedDays.length === 0 ? (
            <p className="text-sm text-slate/60 text-center py-8 border border-dashed border-border rounded-lg">
              Selecione ao menos 1 dia da semana para configurar os slots.
            </p>
          ) : (
            <>
              {/* Tabs por dia */}
              <div className="flex flex-wrap gap-1 border-b border-border">
                {watchedDays.map((day) => {
                  const count = (slotsByDay[day] ?? []).filter((s) => s.type === 'LESSON')
                    .length
                  const isActive = activeTab === day
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setActiveTab(day)}
                      className={cn(
                        'px-3 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px',
                        isActive
                          ? 'text-navy border-navy'
                          : 'text-slate border-transparent hover:text-navy hover:border-navy/30'
                      )}
                    >
                      {DAY_LABELS[day]}
                      <span
                        className={cn(
                          'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                          isActive ? 'bg-navy/10 text-navy' : 'bg-gray-100 text-gray-500'
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Conteúdo da tab ativa */}
              {activeTab !== null && watchedDays.includes(activeTab) && (
                <DayPanel
                  key={activeTab}
                  day={activeTab}
                  slots={slotsByDay[activeTab] ?? []}
                  startTime={watchedStartTime}
                  otherDays={otherDays(activeTab)}
                  onChange={(slots) => setSlotsForDay(activeTab, slots)}
                  onCopy={(targets) => copySlotsToDays(activeTab, targets)}
                />
              )}
            </>
          )}

          {slotsError && <p className="text-sm text-red-500">{slotsError}</p>}
        </CardContent>
      </Card>

      {/* ── Botões ── */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard/grids')}
          className="cursor-pointer"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-navy hover:bg-navy/90 text-white cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            'Salvar'
          )}
        </Button>
      </div>
    </form>
  )
}
