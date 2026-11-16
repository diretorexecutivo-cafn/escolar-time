'use client'

import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { createUser, updateUser } from '@/app/(dashboard)/dashboard/users/actions'
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from '@/lib/auth/allowed-domain'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type RoleKey } from '@/lib/auth/roles'

const userSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z
    .string()
    .trim()
    .email('E-mail inválido')
    .refine(isAllowedEmail, `Use um e-mail @${ALLOWED_EMAIL_DOMAIN}`),
  role: z.enum(ROLES),
})

type UserFormValues = z.infer<typeof userSchema>

interface UserFormProps {
  initialData?: {
    id: string
    name: string
    email: string
    role: RoleKey
  }
  /** Editando o próprio usuário: o papel de administrador não pode ser retirado. */
  isSelf?: boolean
}

export function UserForm({ initialData, isSelf = false }: UserFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      // Na edição o e-mail não muda (é a conta de login); passa na validação
      // mesmo para contas fora do domínio, como a de verificação.
      email: initialData ? `x@${ALLOWED_EMAIL_DOMAIN}` : '',
      role: initialData?.role ?? 'COORDINATOR',
    },
  })

  const selectedRole = useWatch({ control, name: 'role' })
  const roleLocked = isSelf && initialData?.role === 'ADMIN'

  async function onSubmit(values: UserFormValues) {
    const result = isEditing
      ? await updateUser(initialData.id, { name: values.name, role: values.role })
      : await createUser(values)

    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar usuário.')
      return
    }

    toast.success(isEditing ? 'Usuário atualizado!' : 'Usuário criado!')
    router.push('/dashboard/users')
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" placeholder="Ex: Maria Souza" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail *</Label>
            {isEditing ? (
              <>
                <Input id="email" value={initialData.email} disabled readOnly />
                <p className="text-xs text-slate">
                  O e-mail é a conta de login e não pode ser alterado.
                </p>
              </>
            ) : (
              <>
                <Input
                  id="email"
                  type="email"
                  placeholder={`nome@${ALLOWED_EMAIL_DOMAIN}`}
                  autoComplete="off"
                  {...register('email')}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Papel *</Label>
            {roleLocked ? (
              // Campo não registrado: o papel segue o valor padrão (ADMIN).
              <Input id="role" value={ROLE_LABELS.ADMIN} disabled readOnly />
            ) : (
              <select
                id="role"
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                {...register('role')}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate">
              {roleLocked
                ? 'Você não pode remover o seu próprio papel de administrador.'
                : ROLE_DESCRIPTIONS[selectedRole]}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/users')}
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
