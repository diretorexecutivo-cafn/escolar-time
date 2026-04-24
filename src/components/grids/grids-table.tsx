'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Clock, Copy, Edit2, Plus, Power } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  duplicateTimeGrid,
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
  class_group_id: string | null
  class_groups: ClassGroup | ClassGroup[] | null
  time_slots: { id: string; type: string; day_of_week: number }[] | null
}

interface GridsTableProps {
  grids: Grid[]
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
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

export function GridsTable({ grids }: GridsTableProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<{
    id: string
    kind: 'toggle' | 'duplicate'
  } | null>(null)

  function handleToggle(id: string) {
    setPendingAction({ id, kind: 'toggle' })
    startTransition(async () => {
      const result = await toggleGridStatus(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao alterar status.')
      else toast.success('Status atualizado.')
      setPendingAction(null)
    })
  }

  function handleDuplicate(id: string) {
    setPendingAction({ id, kind: 'duplicate' })
    startTransition(async () => {
      const result = await duplicateTimeGrid(id)
      if (!result.success) toast.error(result.error ?? 'Erro ao duplicar grade.')
      else toast.success('Grade duplicada! Edite para vincular uma turma.')
      setPendingAction(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Grades Horárias</h1>
          <p className="text-slate text-sm mt-1">
            Gerencie os horários de aulas e intervalos por turma.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {grids.map((grid) => {
            const lessonCount = countLessons(grid.time_slots)
            const { className, unitName } = getClassGroupInfo(grid.class_groups)
            const togglePending =
              isPending && pendingAction?.id === grid.id && pendingAction?.kind === 'toggle'
            const duplicatePending =
              isPending && pendingAction?.id === grid.id && pendingAction?.kind === 'duplicate'
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
                        {lessonCount} aula{lessonCount !== 1 ? 's' : ''}
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
                            active
                              ? 'bg-navy text-white'
                              : 'bg-gray-100 text-gray-400'
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
                      onClick={() => handleDuplicate(grid.id)}
                      disabled={duplicatePending}
                      title="Duplicar grade"
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
    </div>
  )
}
