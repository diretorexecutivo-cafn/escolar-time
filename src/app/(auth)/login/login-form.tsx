'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/allowed-domain'
import { loginAction } from './actions'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const CALLBACK_ERRORS: Record<string, string> = {
  domain: `Use uma conta Google @${ALLOWED_EMAIL_DOMAIN}.`,
  no_profile:
    'Sua conta Google não está cadastrada no sistema. Peça acesso ao administrador.',
  oauth: 'Não foi possível entrar com o Google. Tente novamente.',
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.27a12 12 0 0 0 0 10.74l4-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}

export function LoginForm({ callbackError }: { callbackError?: string }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? CALLBACK_ERRORS.oauth) : null
  )
  const [googleLoading, setGoogleLoading] = useState(false)

  async function onGoogleLogin() {
    setServerError(null)
    setGoogleLoading(true)

    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // `hd` apenas filtra o seletor de contas do Google; a validação real
        // do domínio é feita no servidor em /auth/callback.
        queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' },
      },
    })

    // Em caso de sucesso o navegador já está sendo redirecionado ao Google.
    if (error) {
      setServerError(CALLBACK_ERRORS.oauth)
      setGoogleLoading(false)
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormValues) {
    setServerError(null)
    const result = await loginAction(data.email, data.password)

    if (!result.success) {
      setServerError(result.error ?? 'Erro inesperado. Tente novamente.')
      return
    }

    router.push('/dashboard')
  }

  return (
    <Card className="w-full max-w-md mx-4 shadow-xl border-0">
      <CardHeader className="pb-2 text-center">
        <h1 className="text-3xl font-bold text-navy tracking-tight">
          EscolarTime
        </h1>
        <p className="text-sm text-slate mt-1">
          Acesse sua conta para continuar
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

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-navy hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {serverError}
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
                Entrando…
              </>
            ) : (
              'Entrar'
            )}
          </Button>

          <div className="flex items-center gap-3 text-xs text-slate">
            <span className="h-px flex-1 bg-gray-200" />
            ou
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onGoogleLogin}
            disabled={googleLoading || isSubmitting}
            className="w-full h-11 font-medium cursor-pointer"
          >
            {googleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Entrar com Google
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
