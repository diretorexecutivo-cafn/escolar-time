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
import { toggleTeacherStatus } from '@/app/(dashboard)/dashboard/teachers/actions'

type Teacher = {
  id: string
  name: string
  email: string | null
  phone: string | null
  max_daily_lessons: number | null
  max_weekly_lessons: number | null
  active: boolean
}

const EMPTY = <span className="text-gray-300">—</span>

export function TeachersTable({ teachers }: { teachers: Teacher[] }) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = teachers.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleToggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleTeacherStatus(id)
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
          <h1 className="text-2xl font-bold text-navy">Professores</h1>
          <p className="text-slate text-sm mt-1">Gerencie o quadro docente da rede.</p>
        </div>
        <Link
          href="/dashboard/teachers/new"
          className={cn(buttonVariants(), 'bg-navy hover:bg-navy-light text-white cursor-pointer')}
        >
          <Plus className="h-4 w-4" />
          Novo Professor
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate" />
        <Input
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold text-navy">Nome</TableHead>
              <TableHead className="font-semibold text-navy">E-mail</TableHead>
              <TableHead className="font-semibold text-navy">Telefone</TableHead>
              <TableHead className="font-semibold text-navy text-center">Limite Diário</TableHead>
              <TableHead className="font-semibold text-navy text-center">Limite Semanal</TableHead>
              <TableHead className="font-semibold text-navy">Status</TableHead>
              <TableHead className="font-semibold text-navy text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate">
                  {search
                    ? 'Nenhum professor encontrado para esta busca.'
                    : 'Nenhum professor cadastrado.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((teacher) => (
                <TableRow key={teacher.id} className="hover:bg-gray-50/50">
                  <TableCell className="font-medium text-navy">{teacher.name}</TableCell>
                  <TableCell className="text-slate text-sm">
                    {teacher.email ?? EMPTY}
                  </TableCell>
                  <TableCell className="text-slate text-sm">
                    {teacher.phone ?? EMPTY}
                  </TableCell>
                  <TableCell className="text-center">
                    {teacher.max_daily_lessons != null ? (
                      <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-slate">
                        {teacher.max_daily_lessons}
                      </span>
                    ) : EMPTY}
                  </TableCell>
                  <TableCell className="text-center">
                    {teacher.max_weekly_lessons != null ? (
                      <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-slate">
                        {teacher.max_weekly_lessons}
                      </span>
                    ) : EMPTY}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        teacher.active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-slate hover:bg-gray-100'
                      }
                    >
                      {teacher.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/teachers/${teacher.id}/edit`}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'h-8 w-8 p-0 text-slate hover:text-navy cursor-pointer'
                        )}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending && pendingId === teacher.id}
                        onClick={() => handleToggle(teacher.id)}
                        className={cn(
                          'h-8 w-8 p-0 cursor-pointer',
                          teacher.active
                            ? 'text-emerald-600 hover:text-red-500'
                            : 'text-slate hover:text-emerald-600'
                        )}
                        title={teacher.active ? 'Desativar' : 'Ativar'}
                      >
                        <Power className="h-4 w-4" />
                        <span className="sr-only">{teacher.active ? 'Desativar' : 'Ativar'}</span>
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
