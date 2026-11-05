'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Eye, Star, Trash2, ChevronDown, ChevronRight, Archive } from 'lucide-react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Schedule = {
  id: string
  name: string
  created_at: string
  status: string
  score: number | null
  is_baseline: boolean | null
  violations: unknown
  created_by: string | null
  profiles: { id: string; name: string } | null
}

type DeletedSchedule = {
  id: string
  name: string
  created_at: string
  status: string
  score: number | null
  deleted_at: string
  deleted_reason: 'manual' | 'replaced_by_edit' | null
  replaced_by: string | null
  deleter: { id: string; name: string } | null
  replacement: { id: string; name: string } | null
}

type Props = {
  schedules: Schedule[]
  deletedSchedules?: DeletedSchedule[]
}

const DELETE_REASON_LABEL: Record<string, string> = {
  manual: 'Excluído manualmente',
  replaced_by_edit: 'Substituído por edição',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Concluído</Badge>
    )
  }
  if (status === 'FAILED') {
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Falhou</Badge>
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse">
      Gerando…
    </Badge>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const pct = Math.round(score)
  const cls =
    pct >= 80
      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
      : pct >= 60
        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
        : 'bg-red-100 text-red-700 hover:bg-red-100'
  return <Badge className={cls}>Score: {pct}</Badge>
}

export function SchedulesHistory({ schedules, deletedSchedules = [] }: Props) {
  const router = useRouter()
  const [list, setList] = useState(schedules)
  const [showDeleted, setShowDeleted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Excluir este horário? Ele ficará registrado no histórico de apagados.')) return
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' })
        if (res.ok) {
          setList((prev) => prev.filter((s) => s.id !== id))
          toast.success('Horário excluído.')
          router.refresh()
        } else {
          toast.error('Erro ao excluir horário.')
        }
      } catch {
        toast.error('Erro de conexão.')
      } finally {
        setPendingId(null)
      }
    })
  }

  async function handleSetBaseline(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/schedule/${id}/baseline`, { method: 'POST' })
        if (res.ok) {
          setList((prev) =>
            prev.map((s) => ({ ...s, is_baseline: s.id === id }))
          )
          toast.success('Horário marcado como baseline.')
        } else {
          toast.error('Erro ao marcar como baseline.')
        }
      } catch {
        toast.error('Erro de conexão.')
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Horários Gerados</h1>
          <p className="text-slate text-sm mt-1">Histórico de grades horárias geradas pelo motor.</p>
        </div>
        <Link
          href="/dashboard/generate"
          className={cn(buttonVariants(), 'bg-navy hover:bg-navy-light text-white cursor-pointer')}
        >
          <Plus className="h-4 w-4" />
          Gerar Novo Horário
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-16 text-center">
          <p className="text-slate text-sm">
            Nenhum horário gerado ainda.{' '}
            <Link href="/dashboard/generate" className="text-navy underline hover:text-ocre">
              Clique em Gerar Novo Horário
            </Link>{' '}
            para começar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((schedule) => (
            <div
              key={schedule.id}
              className="rounded-lg border border-border bg-white shadow-sm p-4 flex items-center gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-navy truncate">{schedule.name}</span>
                  {schedule.is_baseline && (
                    <Badge className="bg-ocre/20 text-ocre-dark border border-ocre hover:bg-ocre/20 text-xs">
                      BASELINE
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate mt-0.5">
                  {format(new Date(schedule.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {schedule.profiles?.name ? ` — por ${schedule.profiles.name}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <StatusBadge status={schedule.status} />
                  <ScoreBadge score={schedule.score} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {schedule.status === 'COMPLETED' && (
                  <>
                    <Link
                      href={`/dashboard/schedules/${schedule.id}`}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                        'text-slate hover:text-navy cursor-pointer gap-1'
                      )}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="hidden sm:inline">Visualizar</span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending && pendingId === schedule.id}
                      onClick={() => handleSetBaseline(schedule.id)}
                      title="Marcar como Baseline"
                      className={cn(
                        'cursor-pointer gap-1',
                        schedule.is_baseline
                          ? 'text-ocre hover:text-ocre-dark'
                          : 'text-slate hover:text-ocre'
                      )}
                    >
                      <Star className="h-4 w-4" />
                      <span className="hidden sm:inline">Marcar Baseline</span>
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending && pendingId === schedule.id}
                  onClick={() => handleDelete(schedule.id)}
                  title="Excluir"
                  className="text-slate hover:text-red-500 cursor-pointer gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Excluir</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deletedSchedules.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate hover:text-navy cursor-pointer"
          >
            {showDeleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Archive className="h-4 w-4" />
            Apagados ({deletedSchedules.length})
          </button>

          {showDeleted && (
            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F7FA] text-slate text-xs">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Horário</th>
                    <th className="text-left font-medium px-4 py-2">Apagado em</th>
                    <th className="text-left font-medium px-4 py-2">Por</th>
                    <th className="text-left font-medium px-4 py-2">Motivo</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {deletedSchedules.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <span className="text-navy">{d.name}</span>
                        <span className="block text-xs text-slate">
                          criado em {format(new Date(d.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate tabular-nums">
                        {format(new Date(d.deleted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-2 text-slate">{d.deleter?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-slate">
                        {DELETE_REASON_LABEL[d.deleted_reason ?? ''] ?? '—'}
                        {d.replacement && (
                          <>
                            {' → '}
                            <Link
                              href={`/dashboard/schedules/${d.replacement.id}`}
                              className="text-navy underline hover:text-ocre"
                            >
                              {d.replacement.name}
                            </Link>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {d.status === 'COMPLETED' && (
                          <Link
                            href={`/dashboard/schedules/${d.id}`}
                            className={cn(
                              buttonVariants({ variant: 'ghost', size: 'sm' }),
                              'text-slate hover:text-navy cursor-pointer gap-1'
                            )}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="hidden sm:inline">Consultar</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
