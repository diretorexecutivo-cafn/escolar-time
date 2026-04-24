'use client'

import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createSubject, updateSubject } from '@/app/(dashboard)/dashboard/subjects/actions'

const COLOR_OPTIONS = [
  '#E63946', '#2A9D8F', '#E9C46A', '#264653',
  '#F4A261', '#A8DADC', '#6D6875', '#B5838D',
  '#048BA8', '#212F5C', '#D6A441', '#7D869C',
]

const subjectSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  code: z
    .string()
    .min(2, 'Código deve ter pelo menos 2 caracteres')
    .max(10, 'Código deve ter no máximo 10 caracteres'),
  color: z.string().min(1, 'Selecione uma cor'),
  active: z.boolean(),
})

type SubjectFormValues = z.infer<typeof subjectSchema>

interface SubjectFormProps {
  initialData?: {
    id: string
    name: string
    code: string
    color: string
    active: boolean
  }
}

export function SubjectForm({ initialData }: SubjectFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      code: initialData?.code ?? '',
      color: initialData?.color ?? '#048BA8',
      active: initialData?.active ?? true,
    },
  })

  async function onSubmit(values: SubjectFormValues) {
    const result = isEditing
      ? await updateSubject(initialData.id, values)
      : await createSubject(values)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar disciplina.')
      return
    }

    toast.success(isEditing ? 'Disciplina atualizada!' : 'Disciplina criada!')
    router.push('/dashboard/subjects')
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
              placeholder="Ex: Matemática"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Código */}
          <div className="space-y-1.5">
            <Label htmlFor="code">Código *</Label>
            <Input
              id="code"
              placeholder="Ex: MAT"
              maxLength={10}
              {...register('code', {
                onChange: (e) =>
                  setValue('code', e.target.value.toUpperCase(), {
                    shouldValidate: true,
                  }),
              })}
            />
            {errors.code && (
              <p className="text-xs text-red-500">{errors.code.message}</p>
            )}
          </div>

          {/* Cor */}
          <div className="space-y-2">
            <Label>Cor *</Label>
            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2.5">
                  {COLOR_OPTIONS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => field.onChange(hex)}
                      title={hex}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        field.value === hex
                          ? 'border-navy scale-110 shadow-md'
                          : 'border-transparent'
                      )}
                      style={{ backgroundColor: hex }}
                    >
                      {field.value === hex && (
                        <Check
                          className="w-4 h-4 drop-shadow"
                          style={{ color: isLight(hex) ? '#1a1a1a' : '#ffffff' }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            />
            {errors.color && (
              <p className="text-xs text-red-500">{errors.color.message}</p>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/subjects')}
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

// determina se uma cor hex é clara para escolher a cor do ícone de check
function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
