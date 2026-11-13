'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  Folder,
  FolderOpen,
  Plus,
  Power,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  duplicateTimeGrid,
  duplicateVigencia,
  toggleGridStatus,
} from '@/app/(dashboard)/dashboard/grids/actions'

const SHIFT_LABELS: Record<string, string> = {
  MORNING: 'Matutino',
  AFTERNOON: 'Vespertino',
  EVENING: 'Noturno',
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6] as const
const DAY_LABELS: Record<number, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}

type SchoolUnit = { id: string; name: string }
type ClassGroup = {
  id: string
  name: string
  school_units: SchoolUnit | SchoolUnit[] | null
}

type Grid = {
  id: string
  name: string
  shift: string
  days_of_week: number[]
  start_time: string | null
  active: boolean
  vigencia?: string | null
  class_group_id: string | null
  class_groups: ClassGroup | ClassGroup[] | null
  time_slots: { id: string; type: string; day_of_week: number }[] | null
}

interface GridsTableProps {
  grids: Grid[]
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function getClassGroupInfo(cg: Grid['class_groups']): {
  className: string | null
  unitName: string | null
} {
  const group = firstOf(cg)
  if (!group) return { className: null, unitName: null }
  const unit = firstOf(group.school_units)
  return { className: group.name, unitName: unit?.name ?? null }
}

function countLessons(time_slots: Grid['time_slots']): number {
  if (!time_slots) return 0
  return time_slots.filter((s) => s.type === 'LESSON').length
}

const NO_VIGENCIA = '__none__'

/** Mais recente primeiro ("2027/1" antes de "2026/2"); "sem vigência" por último. */
function compareVigencia(a: string, b: string): number {
  if (a === NO_VIGENCIA) return 1
  if (b === NO_VIGENCIA) return -1
  return b.localeCompare(a, 'pt-BR', { numeric: true })
}

/** Sugere a vigência seguinte: 2026/1 → 2026/2, 2026/2 → 2027/1. */
function nextVigencia(v: string | null): string {
  const m = v?.match(/^(\d{4})\/(\d+)$/)
  if (!m) return ''
  const year = Number(m[1])
  const sem = Number(m[2])
  return sem >= 2 ? `${year + 1}/1` : `${year}/${sem + 1}`
}

function vigenciaTitle(key: string) {
  return key === NO_VIGENCIA ? 'Sem vigência' : `Vigência ${key}`
}

// ─── Dialog de vigência (duplicar grade / duplicar vigência) ─────────────────

type VigenciaDialogState =
  | { kind: 'grid'; gridId: string; gridName: string; current: string | null }
  | { kind: 'folder'; source: string | null }

interface VigenciaDialogProps {
  state: VigenciaDialogState
  vigencias: string[]
  pending: boolean
  onConfirm: (vigencia: string) => void
  onClose: () => void
}

function VigenciaDialog({ state, vigencias, pending, onConfirm, onClose }: VigenciaDialogProps) {
  const isFolder = state.kind === 'folder'
  const source = isFolder ? state.source : state.current
  const [value, setValue] = useState(isFolder ? nextVigencia(source) : (source ?? ''))
  const trimmed = value.trim()
  const invalid = isFolder && (trimmed === '' || trimmed === (source ?? ''))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) onConfirm(trimmed)
        }}
        className="bg-white rounded-lg shadow-xl w-full max-w-md border border-border"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-navy">
            {isFolder
              ? `Duplicar ${vigenciaTitle(source ?? NO_VIGENCIA).toLowerCase()}`
              : 'Duplicar grade'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate">
            {isFolder ? (
              <>
                Todas as grades desta pasta serão copiadas para a nova vigência, com as mesmas
                turmas e horários. Depois é só editar o que mudou. A vigência original não é
                alterada.
              </>
            ) : (
              <>
                Uma cópia de <span className="font-semibold text-navy">{state.gridName}</span> será
                criada na vigência abaixo. A turma é mantida, a não ser que ela já tenha grade nessa
                vigência.
              </>
            )}
          </p>
          <div className="space-y-1.5">
            <label htmlFor="vigencia-destino" className="text-xs font-medium text-navy">
              {isFolder ? 'Nova vigência' : 'Vigência de destino'}
            </label>
            <Input
              id="vigencia-destino"
              autoFocus
              list="vigencias-existentes"
              placeholder="Ex: 2027/1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <datalist id="vigencias-existentes">
              {vigencias.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
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
            type="submit"
            size="sm"
            disabled={invalid || pending}
            className="bg-navy hover:bg-navy/90 text-white cursor-pointer"
          >
            {pending ? 'Duplicando…' : 'Duplicar'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

export function GridsTable({ grids }: GridsTableProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<{
    id: string
    kind: 'toggle' | 'duplicate'
  } | null>(null)
  const [dialog, setDialog] = useState<VigenciaDialogState | null>(null)

  const folders = useMemo(() => {
    const map = new Map<string, Grid[]>()
    for (const g of grids) {
      const key = g.vigencia?.trim() || NO_VIGENCIA
      const arr = map.get(key) ?? []
      arr.push(g)
      map.set(key, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => compareVigencia(a, b))
      .map(([key, items]) => ({
        key,
        items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
      }))
  }, [grids])

  const vigencias = folders.map((f) => f.key).filter((k) => k !== NO_VIGENCIA)

  // Só a vigência mais recente começa aberta.
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(folders.slice(0, 1).map((f) => f.key)),
  )

  function toggleFolder(key: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleToggle(id: string) {
    setPendingAction({ id, kind: 'toggle' })
    startTransition(async () => {
      const result = await toggleGridStatus(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao alterar status.')
      else toast.success('Status atualizado.')
      setPendingAction(null)
    })
  }

  function handleDialogConfirm(vigencia: string) {
    if (!dialog) return
    const current = dialog
    startTransition(async () => {
      if (current.kind === 'grid') {
        setPendingAction({ id: current.gridId, kind: 'duplicate' })
        const result = await duplicateTimeGrid(current.gridId, vigencia || null)
        setPendingAction(null)
        if (!result.success) {
          toast.error(result.error ?? 'Erro ao duplicar grade.')
          return
        }
        toast.success(
          result.keptClassGroup
            ? 'Grade duplicada! Edite a cópia para ajustar os horários.'
            : 'Grade duplicada sem turma (a turma já tem grade nessa vigência). Edite para vincular.',
        )
      } else {
        const result = await duplicateVigencia(current.source, vigencia)
        if (!result.success) {
          toast.error(result.error ?? 'Erro ao duplicar vigência.')
          return
        }
        const skipped = result.skipped
          ? ` ${result.skipped} turma(s) já tinham grade em ${vigencia} e foram puladas.`
          : ''
        toast.success(`${result.count} grade(s) copiadas para ${vigencia}.${skipped}`)
      }
      setOpenFolders((prev) => new Set(prev).add(vigencia || NO_VIGENCIA))
      setDialog(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Grades Horárias</h1>
          <p className="text-slate text-sm mt-1">
            Gerencie os horários de aulas e intervalos por turma, organizados por vigência.
          </p>
        </div>
        <Link href="/dashboard/grids/new">
          <Button className="bg-navy hover:bg-navy/90 text-white cursor-pointer gap-2">
            <Plus className="h-4 w-4" />
            Nova Grade
          </Button>
        </Link>
      </div>

      {grids.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-12 w-12 text-slate/40 mb-4" />
          <p className="text-slate font-medium">Nenhuma grade horária cadastrada.</p>
          <p className="text-slate/60 text-sm mt-1">Crie a primeira grade para começar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {folders.map(({ key, items }) => {
            const open = openFolders.has(key)
            const activeCount = items.filter((g) => g.active).length
            const vigencia = key === NO_VIGENCIA ? null : key
            return (
              <section key={key} className="rounded-lg border border-border bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleFolder(key)}
                    className="flex flex-1 min-w-0 items-center gap-2 text-left cursor-pointer"
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-slate shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate shrink-0" />
                    )}
                    {open ? (
                      <FolderOpen className="h-5 w-5 text-ocre shrink-0" />
                    ) : (
                      <Folder className="h-5 w-5 text-ocre shrink-0" />
                    )}
                    <span className="font-semibold text-navy truncate">{vigenciaTitle(key)}</span>
                    <span className="text-xs text-slate shrink-0">
                      {items.length} grade{items.length !== 1 ? 's' : ''}
                      {activeCount !== items.length &&
                        ` · ${activeCount} ativa${activeCount !== 1 ? 's' : ''}`}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Link
                      href={
                        vigencia
                          ? `/dashboard/grids/new?vigencia=${encodeURIComponent(vigencia)}`
                          : '/dashboard/grids/new'
                      }
                    >
                      <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Nova grade aqui</span>
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ kind: 'folder', source: vigencia })}
                      className="gap-1.5 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Duplicar vigência</span>
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 border-t border-border p-4 bg-[#F5F7FA]">
                    {items.map((grid) => {
                      const lessonCount = countLessons(grid.time_slots)
                      const { className, unitName } = getClassGroupInfo(grid.class_groups)
                      const togglePending =
                        isPending &&
                        pendingAction?.id === grid.id &&
                        pendingAction?.kind === 'toggle'
                      const duplicatePending =
                        isPending &&
                        pendingAction?.id === grid.id &&
                        pendingAction?.kind === 'duplicate'
                      const hasClassGroup = !!grid.class_group_id

                      return (
                        <Card
                          key={grid.id}
                          className={`border border-border shadow-sm transition-opacity ${
                            !grid.active ? 'opacity-60' : ''
                          }`}
                        >
                          <CardContent className="p-5 space-y-4">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="font-semibold text-navy truncate">{grid.name}</h3>
                                {hasClassGroup && className ? (
                                  <p className="text-slate text-xs mt-0.5 truncate">
                                    {className}
                                    {unitName && (
                                      <span className="text-slate/70"> ({unitName})</span>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-amber-700 text-xs mt-0.5 truncate">
                                    Sem turma vinculada — edite para configurar
                                  </p>
                                )}
                              </div>
                              <Badge
                                className={
                                  grid.active
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0'
                                    : 'bg-gray-100 text-gray-500 border-gray-200 shrink-0'
                                }
                              >
                                {grid.active ? 'Ativa' : 'Inativa'}
                              </Badge>
                            </div>

                            {/* Info rows */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate w-12">Turno</span>
                                <span className="text-xs font-medium text-navy">
                                  {SHIFT_LABELS[grid.shift] ?? grid.shift}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate w-12">Início</span>
                                <span className="text-xs font-medium text-navy">
                                  {grid.start_time ?? '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate w-12">Aulas</span>
                                <span className="text-xs font-medium text-navy">
                                  {lessonCount} aula
                                  {lessonCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Days of week */}
                            <div className="flex flex-wrap gap-1">
                              {ALL_DAYS.map((day) => {
                                const active = grid.days_of_week?.includes(day)
                                return (
                                  <span
                                    key={day}
                                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                      active ? 'bg-navy text-white' : 'bg-gray-100 text-gray-400'
                                    }`}
                                  >
                                    {DAY_LABELS[day]}
                                  </span>
                                )
                              })}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-1 border-t border-border">
                              <Link href={`/dashboard/grids/${grid.id}/edit`} className="flex-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-1.5 cursor-pointer"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setDialog({
                                    kind: 'grid',
                                    gridId: grid.id,
                                    gridName: grid.name,
                                    current: grid.vigencia ?? null,
                                  })
                                }
                                disabled={duplicatePending}
                                title="Duplicar grade (escolher vigência)"
                                className="cursor-pointer"
                              >
                                <Copy
                                  className={`h-3.5 w-3.5 ${
                                    duplicatePending ? 'opacity-50' : 'text-slate'
                                  }`}
                                />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggle(grid.id)}
                                disabled={togglePending}
                                title={grid.active ? 'Desativar grade' : 'Ativar grade'}
                                className="cursor-pointer"
                              >
                                <Power
                                  className={`h-3.5 w-3.5 ${
                                    grid.active ? 'text-emerald-600' : 'text-gray-400'
                                  }`}
                                />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {dialog && (
        <VigenciaDialog
          state={dialog}
          vigencias={vigencias}
          pending={isPending}
          onConfirm={handleDialogConfirm}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
