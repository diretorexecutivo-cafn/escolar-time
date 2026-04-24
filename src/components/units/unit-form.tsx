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
import { createUnit, updateUnit } from '@/app/(dashboard)/dashboard/units/actions'

const unitSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  code: z
    .string()
    .min(2, 'Código deve ter pelo menos 2 caracteres')
    .max(10, 'Código deve ter no máximo 10 caracteres'),
  address: z.string().optional(),
})

type UnitFormValues = z.infer<typeof unitSchema>

interface UnitFormProps {
  initialData?: {
    id: string
    name: string
    code: string
    address: string | null
    active: boolean
  }
}

export function UnitForm({ initialData }: UnitFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      code: initialData?.code ?? '',
      address: initialData?.address ?? '',
    },
  })

  async function onSubmit(values: UnitFormValues) {
    const result = isEditing
      ? await updateUnit(initialData.id, values)
      : await createUnit(values)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar unidade.')
      return
    }

    toast.success(isEditing ? 'Unidade atualizada!' : 'Unidade criada!')
    router.push('/dashboard/units')
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              placeholder="Ex: Escola Municipal Centro"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">Código *</Label>
            <Input
              id="code"
              placeholder="Ex: EMC01"
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

          <div className="space-y-1.5">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              placeholder="Ex: Rua das Flores, 123 – Centro"
              {...register('address')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/units')}
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
