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
import { toggleSubjectStatus } from '@/app/(dashboard)/dashboard/subjects/actions'

type Subject = {
  id: string
  name: string
  code: string
  color: string
  active: boolean
}

export function SubjectsTable({ subjects }: { subjects: Subject[] }) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleToggle(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleSubjectStatus(id)
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
          <h1 className="text-2xl font-bold text-navy">Disciplinas</h1>
          <p className="text-slate text-sm mt-1">Gerencie as disciplinas da rede.</p>
        </div>
        <Link
          href="/dashboard/subjects/new"
          className={cn(buttonVariants(), 'bg-navy hover:bg-navy-light text-white cursor-pointer')}
        >
          <Plus className="h-4 w-4" />
          Nova Disciplina
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
              <TableHead className="font-semibold text-navy">Código</TableHead>
              <TableHead className="font-semibold text-navy">Cor</TableHead>
              <TableHead className="font-semibold text-navy">Status</TableHead>
              <TableHead className="font-semibold text-navy text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate">
                  {search
                    ? 'Nenhuma disciplina encontrada para esta busca.'
                    : 'Nenhuma disciplina cadastrada.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((subject) => (
                <TableRow key={subject.id} className="hover:bg-gray-50/50">
                  <TableCell className="font-medium text-navy">{subject.name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-slate">
                      {subject.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-5 h-5 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="text-xs text-slate font-mono">{subject.color}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        subject.active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-slate hover:bg-gray-100'
                      }
                    >
                      {subject.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/subjects/${subject.id}/edit`}
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
                        disabled={isPending && pendingId === subject.id}
                        onClick={() => handleToggle(subject.id)}
                        className={cn(
                          'h-8 w-8 p-0 cursor-pointer',
                          subject.active
                            ? 'text-emerald-600 hover:text-red-500'
                            : 'text-slate hover:text-emerald-600'
                        )}
                        title={subject.active ? 'Desativar' : 'Ativar'}
                      >
                        <Power className="h-4 w-4" />
                        <span className="sr-only">{subject.active ? 'Desativar' : 'Ativar'}</span>
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
