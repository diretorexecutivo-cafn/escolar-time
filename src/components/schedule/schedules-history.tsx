'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Eye, Star, Trash2 } from 'lucide-react'
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

type Props = {
  schedules: Schedule[]
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

export function SchedulesHistory({ schedules }: Props) {
  const [list, setList] = useState(schedules)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Excluir este horário? Esta ação não pode ser desfeita.')) return
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' })
        if (res.ok) {
          setList((prev) => prev.filter((s) => s.id !== id))
          toast.success('Horário excluído.')
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
    </div>
  )
}
