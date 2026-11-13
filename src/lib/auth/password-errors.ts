// Traduz o erro do Supabase ao trocar a senha numa mensagem acionável.
// O `code` (AuthApiError) é estável; `message` serve só de fallback.
export function passwordUpdateErrorMessage(error: {
  code?: string
  message?: string
  name?: string
}): string {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()

  if (code === 'same_password' || message.includes('different from the old')) {
    return 'A nova senha deve ser diferente da senha atual.'
  }

  if (code === 'weak_password' || message.includes('weak') || message.includes('pwned')) {
    return 'Esta senha é considerada fraca ou já apareceu em vazamentos. Escolha uma senha mais forte (misture letras, números e símbolos).'
  }

  if (
    error.name === 'AuthSessionMissingError' ||
    code === 'session_not_found' ||
    code === 'session_expired' ||
    message.includes('session')
  ) {
    return 'Sua sessão de recuperação expirou. Solicite um novo link de redefinição.'
  }

  if (code === 'over_request_rate_limit' || message.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }

  return 'Não foi possível redefinir sua senha. Tente novamente.'
}
