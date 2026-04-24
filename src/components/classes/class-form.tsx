'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createClass, updateClass } from '@/app/(dashboard)/dashboard/classes/actions'

const SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Matutino' },
  { value: 'AFTERNOON', label: 'Vespertino' },
  { value: 'EVENING', label: 'Noturno' },
] as const

const classSchema = z.object({
  school_unit_id: z.string().uuid('Selecione uma unidade escolar'),
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(50, 'Nome deve ter no máximo 50 caracteres'),
  shift: z.enum(['MORNING', 'AFTERNOON', 'EVENING'], {
    message: 'Selecione um turno',
  }),
  year: z.number().int().min(2020, 'Ano inválido').max(2100, 'Ano inválido'),
})

type ClassFormValues = z.infer<typeof classSchema>

type Unit = { id: string; name: string }

interface ClassFormProps {
  units: Unit[]
  initialData?: {
    id: string
    name: string
    shift: string
    year: number
    active: boolean
    school_unit_id: string
  }
}

const selectClassName = cn(
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm',
  'transition-colors outline-none focus-visible:border-ring',
  'disabled:pointer-events-none disabled:opacity-50'
)

export function ClassForm({ units, initialData }: ClassFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      school_unit_id: initialData?.school_unit_id ?? '',
      name: initialData?.name ?? '',
      shift: (initialData?.shift as ClassFormValues['shift']) ?? undefined,
      year: initialData?.year ?? new Date().getFullYear(),
    },
  })

  async function onSubmit(values: ClassFormValues) {
    const result = isEditing
      ? await updateClass(initialData.id, values)
      : await createClass(values)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar turma.')
      return
    }

    toast.success(isEditing ? 'Turma atualizada!' : 'Turma criada!')
    router.push('/dashboard/classes')
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Unidade Escolar */}
          <div className="space-y-1.5">
            <Label htmlFor="school_unit_id">Unidade Escolar *</Label>
            <select
              id="school_unit_id"
              className={selectClassName}
              {...register('school_unit_id')}
            >
              <option value="">Selecione uma unidade…</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            {errors.school_unit_id && (
              <p className="text-xs text-red-500">{errors.school_unit_id.message}</p>
            )}
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Ex: 5º Ano A, 3EM B"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Turno */}
          <div className="space-y-1.5">
            <Label htmlFor="shift">Turno *</Label>
            <select
              id="shift"
              className={selectClassName}
              {...register('shift')}
            >
              <option value="">Selecione um turno…</option>
              {SHIFT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.shift && (
              <p className="text-xs text-red-500">{errors.shift.message}</p>
            )}
          </div>

          {/* Ano */}
          <div className="space-y-1.5">
            <Label htmlFor="year">Ano *</Label>
            <Input
              id="year"
              type="number"
              min={2020}
              max={2100}
              {...register('year', { valueAsNumber: true })}
            />
            {errors.year && (
              <p className="text-xs text-red-500">{errors.year.message}</p>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/classes')}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-navy hover:bg-navy-light text-white cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
