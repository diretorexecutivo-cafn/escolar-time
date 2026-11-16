'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { History, Pencil, Plus, Power, Search } from 'lucide-react'
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
import { toggleUserActive } from '@/app/(dashboard)/dashboard/users/actions'
import { ROLE_LABELS, type RoleKey } from '@/lib/auth/roles'
import { formatDateTime } from '@/lib/format-date'

type User = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  last_sign_in_at: string | null
}

const ROLE_BADGE: Record<RoleKey, string> = {
  ADMIN: 'bg-navy/10 text-navy hover:bg-navy/10',
  COORDINATOR: 'bg-ocre/15 text-ocre-dark hover:bg-ocre/15',
  VIEWER: 'bg-gray-100 text-slate hover:bg-gray-100',
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const term = search.trim().toLowerCase()
  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
  )

  function handleToggle(user: User) {
    setPendingId(user.id)
    startTransition(async () => {
      const result = await toggleUserActive(user.id)
      if (!result.success) {
        toast.error(result.error ?? 'Erro ao alterar acesso.')
      } else {
        toast.success(user.active ? 'Acesso desativado.' : 'Acesso reativado.')
      }
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Usuários</h1>
          <p className="text-slate text-sm mt-1">Quem pode acessar o sistema e com qual papel.</p>
        </div>
        <Link
          href="/dashboard/users/new"
          className={cn(buttonVariants(), 'bg-navy hover:bg-navy-light text-white cursor-pointer')}
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate" />
        <Input
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold text-navy">Nome</TableHead>
              <TableHead className="font-semibold text-navy">E-mail</TableHead>
              <TableHead className="font-semibold text-navy">Papel</TableHead>
              <TableHead className="font-semibold text-navy">Último acesso</TableHead>
              <TableHead className="font-semibold text-navy">Status</TableHead>
              <TableHead className="font-semibold text-navy text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate">
                  {search ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário cadastrado.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const isSelf = user.id === currentUserId
                const role = (user.role in ROLE_LABELS ? user.role : 'VIEWER') as RoleKey
                return (
                  <TableRow key={user.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-navy">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs font-normal text-slate">(você)</span>}
                    </TableCell>
                    <TableCell className="text-slate">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_BADGE[role]}>{ROLE_LABELS[role]}</Badge>
                    </TableCell>
                    <TableCell className="text-slate text-sm">
                      {user.last_sign_in_at ? (
                        formatDateTime(user.last_sign_in_at)
                      ) : (
                        <span className="text-gray-400">Nunca entrou</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          user.active
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-slate hover:bg-gray-100'
                        }
                      >
                        {user.active ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/history?user=${user.id}`}
                          title="Ver o que este usuário fez"
                          className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'h-8 w-8 p-0 text-slate hover:text-navy cursor-pointer'
                          )}
                        >
                          <History className="h-4 w-4" />
                          <span className="sr-only">Histórico</span>
                        </Link>
                        <Link
                          href={`/dashboard/users/${user.id}/edit`}
                          title="Editar"
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
                          disabled={isSelf || (isPending && pendingId === user.id)}
                          onClick={() => handleToggle(user)}
                          className={[
                            'h-8 w-8 p-0 cursor-pointer',
                            user.active
                              ? 'text-emerald-600 hover:text-red-500'
                              : 'text-slate hover:text-emerald-600',
                          ].join(' ')}
                          title={
                            isSelf
                              ? 'Você não pode desativar o seu próprio acesso'
                              : user.active
                                ? 'Desativar acesso'
                                : 'Reativar acesso'
                          }
                        >
                          <Power className="h-4 w-4" />
                          <span className="sr-only">{user.active ? 'Desativar' : 'Reativar'}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
