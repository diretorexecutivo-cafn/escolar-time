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
import { createTeacher, updateTeacher } from '@/app/(dashboard)/dashboard/teachers/actions'

const teacherSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z
    .string()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('')),
  phone: z.string().optional(),
  max_daily_lessons: z
    .union([
      z.number().int().min(1, 'Mínimo 1').max(12, 'Máximo 12'),
      z.nan(),
    ])
    .optional()
    .nullable(),
  max_weekly_lessons: z
    .union([
      z.number().int().min(1, 'Mínimo 1').max(60, 'Máximo 60'),
      z.nan(),
    ])
    .optional()
    .nullable(),
})

type TeacherFormValues = z.infer<typeof teacherSchema>

interface TeacherFormProps {
  initialData?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    max_daily_lessons: number | null
    max_weekly_lessons: number | null
    active: boolean
  }
}

export function TeacherForm({ initialData }: TeacherFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      phone: initialData?.phone ?? '',
      max_daily_lessons: initialData?.max_daily_lessons ?? undefined,
      max_weekly_lessons: initialData?.max_weekly_lessons ?? undefined,
    },
  })

  async function onSubmit(values: TeacherFormValues) {
    const payload = {
      name: values.name,
      email: values.email || undefined,
      phone: values.phone || undefined,
      max_daily_lessons:
        values.max_daily_lessons == null || isNaN(values.max_daily_lessons as number)
          ? null
          : values.max_daily_lessons,
      max_weekly_lessons:
        values.max_weekly_lessons == null || isNaN(values.max_weekly_lessons as number)
          ? null
          : values.max_weekly_lessons,
    }

    const result = isEditing
      ? await updateTeacher(initialData.id, payload)
      : await createTeacher(payload)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar professor.')
      return
    }

    toast.success(isEditing ? 'Professor atualizado!' : 'Professor criado!')
    router.push('/dashboard/teachers')
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Ex: Maria da Silva"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="professor@escola.edu.br"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(00) 00000-0000"
              {...register('phone')}
            />
          </div>

          {/* Limites — lado a lado */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max_daily_lessons">Máx. aulas por dia</Label>
              <Input
                id="max_daily_lessons"
                type="number"
                min={1}
                max={12}
                placeholder="—"
                {...register('max_daily_lessons', { valueAsNumber: true })}
              />
              {errors.max_daily_lessons && (
                <p className="text-xs text-red-500">{errors.max_daily_lessons.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_weekly_lessons">Máx. aulas por semana</Label>
              <Input
                id="max_weekly_lessons"
                type="number"
                min={1}
                max={60}
                placeholder="—"
                {...register('max_weekly_lessons', { valueAsNumber: true })}
              />
              {errors.max_weekly_lessons && (
                <p className="text-xs text-red-500">{errors.max_weekly_lessons.message}</p>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/teachers')}
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
