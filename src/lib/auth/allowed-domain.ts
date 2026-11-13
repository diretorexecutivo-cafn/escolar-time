// Login com Google é restrito a contas do domínio da escola.
export const ALLOWED_EMAIL_DOMAIN = 'familiadenazare.com.br'

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}
