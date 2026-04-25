'use client'

import { useState, useTransition } from 'react'
import {
  Building2,
  ArrowLeftRight,
  Scale,
  CalendarRange,
  CornerDownLeft,
  Layers,
  History,
  Settings,
  Settings2,
  Info,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  createGlobalRule,
  deleteGlobalRule,
  toggleGlobalRule,
  updateGlobalRuleParams,
  updateGlobalRuleWeight,
} from '@/app/(dashboard)/dashboard/constraints/rules/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleType =
  | 'SINGLE_UNIT_PER_DAY'
  | 'MIN_GAP_CROSS_UNIT'
  | 'BALANCE_DAILY_LOAD'
  | 'SPREAD_SUBJECT'
  | 'AVOID_LAST_SLOT'
  | 'DOUBLE_LESSONS_PREFERRED_SLOTS'
  | 'RESPECT_BASELINE'
  | 'CUSTOM'

type Priority = 'MANDATORY' | 'PREFERRED'

type GlobalRule = {
  id: string
  type: string
  priority: string
  weight: number
  params: Record<string, unknown> | null
  description: string | null
  active: boolean
}

interface GlobalRulesConfigProps {
  rules: GlobalRule[]
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

type RuleMeta = {
  label: string
  description: string
  icon: React.ElementType
  color: string
}

const RULE_META: Record<string, RuleMeta> = {
  SINGLE_UNIT_PER_DAY: {
    label: 'Uma Unidade por Dia',
    description: 'Tentar concentrar professor em uma unidade por dia.',
    icon: Building2,
    color: 'text-teal',
  },
  MIN_GAP_CROSS_UNIT: {
    label: 'Gap entre Unidades',
    description: 'Gap mínimo entre aulas de unidades diferentes no mesmo dia.',
    icon: ArrowLeftRight,
    color: 'text-navy',
  },
  BALANCE_DAILY_LOAD: {
    label: 'Equilibrar Carga Diária',
    description: 'Distribuir carga do professor uniformemente na semana.',
    icon: Scale,
    color: 'text-navy',
  },
  SPREAD_SUBJECT: {
    label: 'Espalhar Disciplinas',
    description: 'Espalhar disciplinas ao longo da semana (não concentrar).',
    icon: CalendarRange,
    color: 'text-teal',
  },
  AVOID_LAST_SLOT: {
    label: 'Evitar Último Horário',
    description: 'Disciplinas específicas evitam o último horário do dia.',
    icon: CornerDownLeft,
    color: 'text-amber-500',
  },
  DOUBLE_LESSONS_PREFERRED_SLOTS: {
    label: 'Aulas Duplas em Horários Cedo',
    description: 'Aulas duplas preferencialmente nos primeiros horários.',
    icon: Layers,
    color: 'text-navy',
  },
  RESPECT_BASELINE: {
    label: 'Respeitar Horário Anterior',
    description: 'Priorizar proximidade com horário anterior ao gerar novo.',
    icon: History,
    color: 'text-emerald-600',
  },
  CUSTOM: {
    label: 'Regra Customizada',
    description: 'Regra customizada definida manualmente.',
    icon: Settings,
    color: 'text-slate',
  },
}

const RULE_TYPES: RuleType[] = [
  'SINGLE_UNIT_PER_DAY',
  'MIN_GAP_CROSS_UNIT',
  'BALANCE_DAILY_LOAD',
  'SPREAD_SUBJECT',
  'AVOID_LAST_SLOT',
  'DOUBLE_LESSONS_PREFERRED_SLOTS',
  'RESPECT_BASELINE',
  'CUSTOM',
]

// ─── Slider helper ────────────────────────────────────────────────────────────

interface WeightSliderProps {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  label?: string
}

function WeightSlider({
  value,
  onChange,
  disabled,
  min = 0,
  max = 2,
  step = 0.1,
  format,
  label = 'Peso',
}: WeightSliderProps) {
  const display = format ? format(value) : value.toFixed(1)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate">{label}</label>
        <span className="text-xs font-semibold text-navy">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 rounded-lg appearance-none bg-gray-200 accent-navy cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}

// ─── Rule card ────────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: GlobalRule
  isPending: boolean
  onToggle: () => void
  onDelete: () => void
  onWeightChange: (weight: number) => void
  onParamsChange: (params: Record<string, unknown>) => void
}

function RuleCard({
  rule,
  isPending,
  onToggle,
  onDelete,
  onWeightChange,
  onParamsChange,
}: RuleCardProps) {
  const meta = RULE_META[rule.type] ?? RULE_META.CUSTOM
  const Icon = meta.icon
  const isMandatory = rule.priority === 'MANDATORY'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [localWeight, setLocalWeight] = useState(rule.weight)

  const params = rule.params ?? {}
  const minGapSlots = (params.min_gap_slots as number | undefined) ?? 1
  const baselineWeight = (params.baseline_weight as number | undefined) ?? 0.5

  return (
    <Card
      className={cn(
        'border border-border shadow-sm transition-opacity',
        !rule.active && 'opacity-60'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 p-1.5 rounded-md bg-gray-100">
              <Icon className={cn('h-4 w-4', meta.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">{meta.label}</p>
              <p className="text-xs text-slate leading-snug mt-0.5">
                {rule.type === 'CUSTOM' && rule.description
                  ? rule.description
                  : meta.description}
              </p>
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
                rule.active
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'
                  : 'bg-gray-100 text-gray-500 border-gray-200 text-xs'
              }
            >
              {rule.active ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
        </div>

        {/* Weight slider */}
        <WeightSlider
          value={localWeight}
          onChange={(v) => {
            setLocalWeight(v)
            onWeightChange(v)
          }}
          disabled={isPending || !rule.active}
        />

        {/* Type-specific extras */}
        {rule.type === 'MIN_GAP_CROSS_UNIT' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate">Mínimo de slots</label>
            <input
              type="number"
              min={1}
              max={20}
              value={minGapSlots}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  min_gap_slots: parseInt(e.target.value, 10) || 1,
                })
              }
              disabled={isPending || !rule.active}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring disabled:opacity-50"
            />
          </div>
        )}

        {rule.type === 'RESPECT_BASELINE' && (
          <WeightSlider
            label="Peso da proximidade"
            min={0}
            max={1}
            step={0.05}
            value={baselineWeight}
            onChange={(v) =>
              onParamsChange({ ...params, baseline_weight: v })
            }
            disabled={isPending || !rule.active}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={isPending}
            className="gap-1.5 cursor-pointer"
            title={rule.active ? 'Desativar' : 'Ativar'}
          >
            <Power
              className={cn(
                'h-3.5 w-3.5',
                rule.active ? 'text-emerald-600' : 'text-gray-400'
              )}
            />
            {rule.active ? 'Desativar' : 'Ativar'}
          </Button>

          {confirmDelete ? (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-red-600 font-medium">
                Confirmar exclusão?
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={isPending}
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
              disabled={isPending}
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

// ─── Add rule dialog ──────────────────────────────────────────────────────────

interface AddRuleDialogProps {
  onClose: () => void
  onCreate: (data: {
    type: RuleType
    priority: Priority
    weight: number
    params: Record<string, unknown> | null
    description: string | null
  }) => void
  isPending: boolean
}

function AddRuleDialog({ onClose, onCreate, isPending }: AddRuleDialogProps) {
  const [type, setType] = useState<RuleType>('SINGLE_UNIT_PER_DAY')
  const [priority, setPriority] = useState<Priority>('PREFERRED')
  const [weight, setWeight] = useState(1.0)
  const [minGapSlots, setMinGapSlots] = useState(1)
  const [baselineWeight, setBaselineWeight] = useState(0.5)
  const [description, setDescription] = useState('')

  function handleSubmit() {
    let params: Record<string, unknown> | null = null
    if (type === 'MIN_GAP_CROSS_UNIT') params = { min_gap_slots: minGapSlots }
    else if (type === 'RESPECT_BASELINE') params = { baseline_weight: baselineWeight }

    if (type === 'CUSTOM' && !description.trim()) return

    onCreate({
      type,
      priority,
      weight,
      params,
      description: type === 'CUSTOM' ? description.trim() : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-base font-semibold text-navy">Adicionar Regra Global</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-navy">Tipo de regra</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RuleType)}
              disabled={isPending}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring"
            >
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RULE_META[t].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate leading-snug">
              {RULE_META[type].description}
            </p>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-navy">Prioridade</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPriority('MANDATORY')}
                disabled={isPending}
                className={cn(
                  'h-9 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                  priority === 'MANDATORY'
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-white border-input text-slate hover:bg-gray-50'
                )}
              >
                Obrigatória
              </button>
              <button
                type="button"
                onClick={() => setPriority('PREFERRED')}
                disabled={isPending}
                className={cn(
                  'h-9 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                  priority === 'PREFERRED'
                    ? 'bg-amber-100 border-amber-300 text-amber-700'
                    : 'bg-white border-input text-slate hover:bg-gray-50'
                )}
              >
                Preferencial
              </button>
            </div>
          </div>

          {/* Weight */}
          <WeightSlider value={weight} onChange={setWeight} disabled={isPending} />

          {/* Type-specific */}
          {type === 'MIN_GAP_CROSS_UNIT' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-navy">Mínimo de slots</label>
              <input
                type="number"
                min={1}
                max={20}
                value={minGapSlots}
                onChange={(e) => setMinGapSlots(parseInt(e.target.value, 10) || 1)}
                disabled={isPending}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring"
              />
            </div>
          )}

          {type === 'RESPECT_BASELINE' && (
            <WeightSlider
              label="Peso da proximidade"
              min={0}
              max={1}
              step={0.05}
              value={baselineWeight}
              onChange={setBaselineWeight}
              disabled={isPending}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          )}

          {type === 'CUSTOM' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-navy">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
                rows={3}
                placeholder="Descreva a regra customizada..."
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || (type === 'CUSTOM' && !description.trim())}
            className="bg-navy hover:bg-navy/90 text-white cursor-pointer"
          >
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function GlobalRulesConfig({ rules }: GlobalRulesConfigProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  function handleToggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleGlobalRule(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao alterar status.')
      else toast.success('Status atualizado.')
      setPendingId(null)
    })
  }

  function handleDelete(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await deleteGlobalRule(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao excluir.')
      else toast.success('Regra excluída.')
      setPendingId(null)
    })
  }

  // Debounce-less weight save: fire on every change inside transition
  function handleWeightChange(id: string, weight: number) {
    setPendingId(id)
    startTransition(async () => {
      const result = await updateGlobalRuleWeight(id, weight)
      if (!result.success) toast.error(result.error ?? 'Erro ao salvar peso.')
      setPendingId(null)
    })
  }

  function handleParamsChange(id: string, params: Record<string, unknown>) {
    setPendingId(id)
    startTransition(async () => {
      const result = await updateGlobalRuleParams(id, params)
      if (!result.success) toast.error(result.error ?? 'Erro ao salvar parâmetros.')
      setPendingId(null)
    })
  }

  function handleCreate(data: {
    type: RuleType
    priority: Priority
    weight: number
    params: Record<string, unknown> | null
    description: string | null
  }) {
    startTransition(async () => {
      const result = await createGlobalRule(data)
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao criar regra.')
        return
      }
      toast.success('Regra criada.')
      setShowAdd(false)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Regras Globais de Geração</h1>
          <p className="text-slate text-sm mt-1">
            Configure as regras que orientam o algoritmo na geração dos horários.
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-navy hover:bg-navy/90 text-white cursor-pointer gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Regra
        </Button>
      </div>

      {/* Info alert */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900 leading-relaxed">
          Regras <span className="font-semibold">OBRIGATÓRIAS</span> bloqueiam a
          geração se não puderem ser satisfeitas. Regras{' '}
          <span className="font-semibold">PREFERENCIAIS</span> penalizam o score
          mas não impedem a geração.
        </p>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl">
          <Settings2 className="h-12 w-12 text-slate/30 mb-4" />
          <p className="text-slate font-medium">Nenhuma regra global configurada</p>
          <p className="text-slate/60 text-sm mt-1">
            Adicione regras para orientar o algoritmo de geração de horários.
          </p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-3 text-sm text-navy hover:underline font-medium cursor-pointer"
          >
            + Adicionar primeira regra
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              isPending={isPending && pendingId === r.id}
              onToggle={() => handleToggle(r.id)}
              onDelete={() => handleDelete(r.id)}
              onWeightChange={(w) => handleWeightChange(r.id, w)}
              onParamsChange={(p) => handleParamsChange(r.id, p)}
            />
          ))}
        </div>
      )}

      {/* Add dialog */}
      {showAdd && (
        <AddRuleDialog
          onClose={() => setShowAdd(false)}
          onCreate={handleCreate}
          isPending={isPending}
        />
      )}
    </div>
  )
}
