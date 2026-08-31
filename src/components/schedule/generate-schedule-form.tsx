'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wand2, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ExistingSchedule = {
  id: string
  name: string
  created_at: string
  score: number | null
  status: string
}

type Props = {
  existingSchedules: ExistingSchedule[]
}

export function GenerateScheduleForm({ existingSchedules }: Props) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [baselineScheduleId, setBaselineScheduleId] = useState('')
  const [baselineWeight, setBaselineWeight] = useState(70)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const completedSchedules = existingSchedules.filter((s) => s.status === 'COMPLETED')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Informe o nome do horário.')
      return
    }

    setIsLoading(true)
    setErrors(null)
    setWarnings([])

    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          baselineScheduleId: baselineScheduleId || undefined,
          baselineWeight: baselineScheduleId ? baselineWeight / 100 : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok && !data.errors) {
        setErrors([data.error ?? 'Erro ao gerar horário.'])
        return
      }

      if (data.status === 'COMPLETED') {
        if (data.partial) {
          toast.warning(
            `Horário gerado parcialmente: ${data.stats?.allocatedLessons ?? 0} de ${data.stats?.totalLessons ?? 0} aulas alocadas.`
          )
        } else {
          toast.success('Horário gerado com sucesso!')
        }
        router.push(`/dashboard/schedules/${data.scheduleId}`)
      } else {
        setErrors(data.errors ?? ['Não foi possível gerar um horário válido.'])
        setWarnings(data.warnings ?? [])
      }
    } catch {
      setErrors(['Erro de conexão. Verifique sua internet e tente novamente.'])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Gerar Novo Horário</h1>
        <p className="text-slate text-sm mt-1">
          Configure as opções e deixe o motor resolver os conflitos automaticamente.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-navy font-medium">
                Nome do horário <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Grade Fev 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            {/* Baseline */}
            <div className="space-y-2">
              <Label htmlFor="baseline" className="text-navy font-medium">
                Basear em horário anterior
              </Label>
              <select
                id="baseline"
                value={baselineScheduleId}
                onChange={(e) => setBaselineScheduleId(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Nenhum (gerar do zero)</option>
                {completedSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    {s.score != null ? ` — Score: ${Math.round(s.score)}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Baseline weight slider */}
            {baselineScheduleId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-navy font-medium">Fidelidade ao horário anterior</Label>
                  <span className="text-sm font-semibold text-ocre">{baselineWeight}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={baselineWeight}
                  onChange={(e) => setBaselineWeight(Number(e.target.value))}
                  disabled={isLoading}
                  className="w-full accent-ocre"
                />
                <div className="flex justify-between text-xs text-slate">
                  <span>0% — Ignorar</span>
                  <span>100% — Manter igual</span>
                </div>
              </div>
            )}

            {/* Warning list */}
            {warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-1">
                <p className="text-sm font-semibold text-amber-800">Avisos:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-700">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error list */}
            {errors && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-1">
                <p className="text-sm font-semibold text-red-700">
                  Não foi possível gerar o horário:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {errors.map((err, i) => (
                    <li key={i} className="text-sm text-red-600">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-6 text-base bg-navy hover:bg-navy-light text-white cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Gerando… isso pode levar até 30 segundos
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5 mr-2" />
                  Gerar Horário
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-border bg-gray-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-navy">Como funciona a geração?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'Valida todas as configurações cadastradas',
            'Resolve conflitos automaticamente (professores, turmas, restrições)',
            'Otimiza o resultado respeitando preferências',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-sm text-slate">{step}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
