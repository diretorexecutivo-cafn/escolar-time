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
})

type TeacherFormValues = z.infer<typeof teacherSchema>

interface TeacherFormProps {
  initialData?: {
    id: string
    name: string
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
    },
  })

  async function onSubmit(values: TeacherFormValues) {
    const result = isEditing
      ? await updateTeacher(initialData.id, { name: values.name })
      : await createTeacher({ name: values.name })

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
