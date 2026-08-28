'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

// Tempo máximo de espera pela sessão de recuperação antes de considerar o
// link inválido ou expirado.
const RECOVERY_TIMEOUT_MS = 4000

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme sua nova senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>
type SupabaseBrowserClient = ReturnType<typeof createClient>

type Status = 'verifying' | 'ready' | 'invalid' | 'success'

function hasErrorInUrl() {
  if (typeof window === 'undefined') return false

  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return Boolean(
    search.get('error') ||
      search.get('error_description') ||
      hash.get('error') ||
      hash.get('error_description')
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('verifying')
  const [serverError, setServerError] = useState<string | null>(null)
  // O client do Supabase acessa `window`/cookies do navegador e só pode ser
  // criado no cliente — nunca como efeito colateral da renderização no
  // servidor (SSR/prerender), por isso vive numa ref preenchida sob demanda.
  const supabaseRef = useRef<SupabaseBrowserClient | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    // Verificado uma vez, de forma síncrona, apenas para decidir o prazo do
    // timeout abaixo — o setState correspondente só acontece dentro do
    // callback do timer (nunca diretamente no corpo do efeito).
    const urlHasError = hasErrorInUrl()
    let resolved = false

    const timeoutId = setTimeout(
      () => {
        if (!resolved) {
          resolved = true
          setStatus('invalid')
        }
      },
      urlHasError ? 0 : RECOVERY_TIMEOUT_MS
    )

    if (urlHasError) {
      return () => clearTimeout(timeoutId)
    }

    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    function markReady() {
      if (resolved) return
      resolved = true
      clearTimeout(timeoutId)
      setStatus('ready')
    }

    // O Supabase (fluxo PKCE) troca o código presente na URL pela sessão de
    // recuperação automaticamente e emite o evento PASSWORD_RECOVERY.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') {
        markReady()
      }
    })

    // Cobre o caso em que a sessão já foi estabelecida antes deste efeito
    // se inscrever no evento.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        markReady()
      }
    })

    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(data: ResetPasswordForm) {
    setServerError(null)

    // O handler só roda no navegador; um novo client compartilha a sessão
    // persistida do fluxo de recuperação sem acessar refs durante a renderização.
    const { error } = await createClient().auth.updateUser({
      password: data.password,
    })

    if (error) {
      setServerError('Não foi possível redefinir sua senha. Tente novamente.')
      return
    }

    setStatus('success')
  }

  if (status === 'verifying') {
    return (
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-navy" />
          <p className="text-sm text-slate">Verificando link de recuperação…</p>
        </CardContent>
      </Card>
    )
  }

  if (status === 'invalid') {
    return (
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardHeader className="pb-2 text-center">
          <h1 className="text-2xl font-bold text-navy tracking-tight">
            Link inválido ou expirado
          </h1>
        </CardHeader>
        <CardContent className="pt-4 text-center space-y-4">
          <p className="text-sm text-slate">
            Solicite um novo link de recuperação de senha.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block text-sm font-medium text-navy hover:underline"
          >
            Solicitar novo link
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (status === 'success') {
    return (
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardHeader className="pb-2 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="text-2xl font-bold text-navy tracking-tight mt-2">
            Senha redefinida
          </h1>
        </CardHeader>
        <CardContent className="pt-4 text-center space-y-4">
          <p className="text-sm text-slate">Sua senha foi atualizada com sucesso.</p>
          <Button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full bg-navy hover:bg-navy-light text-white font-semibold h-11 cursor-pointer"
          >
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-4 shadow-xl border-0">
      <CardHeader className="pb-2 text-center">
        <h1 className="text-2xl font-bold text-navy tracking-tight">Redefinir senha</h1>
        <p className="text-sm text-slate mt-1">Escolha uma nova senha para sua conta</p>
      </CardHeader>

      <CardContent className="pt-4">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirme a nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
            )}
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
                Salvando…
              </>
            ) : (
              'Redefinir senha'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
