'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Power, Search, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toggleClassStatus } from '@/app/(dashboard)/dashboard/classes/actions'

const SHIFT_LABELS: Record<string, string> = {
  MORNING: 'Matutino',
  AFTERNOON: 'Vespertino',
  EVENING: 'Noturno',
}

type ClassGroup = {
  id: string
  name: string
  shift: string
  year: number
  active: boolean
  school_units: { id: string; name: string }[]
}

type Unit = { id: string; name: string }

interface ClassesTableProps {
  classes: ClassGroup[]
  units: Unit[]
}

const selectClassName = cn(
  'h-8 rounded-lg border border-input bg-white px-2.5 py-1 text-sm',
  'transition-colors outline-none focus-visible:border-ring'
)

export function ClassesTable({ classes, units }: ClassesTableProps) {
  const [search, setSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = classes.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchesUnit = unitFilter === '' || c.school_units?.[0]?.id === unitFilter
    return matchesSearch && matchesUnit
  })

  function handleToggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleClassStatus(id)
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao alterar status.')
      } else {
        toast.success('Status atualizado.')
      }
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Turmas</h1>
          <p className="text-slate text-sm mt-1">Gerencie as turmas da rede.</p>
        </div>
        <Link
          href="/dashboard/classes/new"
          className={cn(buttonVariants(), 'bg-navy hover:bg-navy-light text-white cursor-pointer')}
        >
          <Plus className="h-4 w-4" />
          Nova Turma
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate" />
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-56"
          />
        </div>
        <select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className={selectClassName}
        >
          <option value="">Todas as unidades</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold text-navy">Nome</TableHead>
              <TableHead className="font-semibold text-navy">Unidade Escolar</TableHead>
              <TableHead className="font-semibold text-navy">Turno</TableHead>
              <TableHead className="font-semibold text-navy">Ano</TableHead>
              <TableHead className="font-semibold text-navy">Status</TableHead>
              <TableHead className="font-semibold text-navy text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate">
                  {search || unitFilter
                    ? 'Nenhuma turma encontrada para os filtros selecionados.'
                    : 'Nenhuma turma cadastrada.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((classGroup) => (
                <TableRow key={classGroup.id} className="hover:bg-gray-50/50">
                  <TableCell className="font-medium text-navy">{classGroup.name}</TableCell>
                  <TableCell className="text-slate">
                    {classGroup.school_units?.[0]?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate">
                      {SHIFT_LABELS[classGroup.shift] ?? classGroup.shift}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate">{classGroup.year}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        classGroup.active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-slate hover:bg-gray-100'
                      }
                    >
                      {classGroup.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/classes/${classGroup.id}/edit`}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'h-8 w-8 p-0 text-slate hover:text-navy cursor-pointer'
                        )}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending && pendingId === classGroup.id}
                        onClick={() => handleToggle(classGroup.id)}
                        className={cn(
                          'h-8 w-8 p-0 cursor-pointer',
                          classGroup.active
                            ? 'text-emerald-600 hover:text-red-500'
                            : 'text-slate hover:text-emerald-600'
                        )}
                        title={classGroup.active ? 'Desativar' : 'Ativar'}
                      >
                        <Power className="h-4 w-4" />
                        <span className="sr-only">
                          {classGroup.active ? 'Desativar' : 'Ativar'}
                        </span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
