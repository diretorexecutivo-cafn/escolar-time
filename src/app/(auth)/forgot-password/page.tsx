'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, MailCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>

type Status = 'idle' | 'sent' | 'error'

export default function ForgotPasswordPage() {
  const [status, setStatus] = useState<Status>('idle')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordForm) {
    setStatus('idle')

    try {
      const supabase = createClient()
      // O retorno de erro do Supabase não é exposto ao usuário para evitar
      // vazar quais e-mails possuem conta cadastrada.
      await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardHeader className="pb-2 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-navy" />
          <h1 className="text-2xl font-bold text-navy tracking-tight mt-2">
            Verifique seu e-mail
          </h1>
        </CardHeader>
        <CardContent className="pt-4 text-center space-y-4">
          <p className="text-sm text-slate">
            Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-navy hover:underline"
          >
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-4 shadow-xl border-0">
      <CardHeader className="pb-2 text-center">
        <h1 className="text-2xl font-bold text-navy tracking-tight">
          Esqueci minha senha
        </h1>
        <p className="text-sm text-slate mt-1">
          Informe seu e-mail para receber um link de recuperação
        </p>
      </CardHeader>

      <CardContent className="pt-4">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Não foi possível enviar o e-mail de recuperação. Tente novamente.
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-navy hover:bg-navy-light text-white font-semibold h-11 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              'Enviar link de recuperação'
            )}
          </Button>

          <Link
            href="/login"
            className="block text-center text-sm font-medium text-navy hover:underline"
          >
            Voltar para o login
          </Link>
        </form>
      </CardContent>
    </Card>
  )
}
