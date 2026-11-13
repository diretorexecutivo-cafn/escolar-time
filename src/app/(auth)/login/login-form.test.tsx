import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInWithOAuth = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./actions', () => ({
  loginAction: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

import { LoginForm } from './login-form'

beforeEach(() => {
  signInWithOAuth.mockReset().mockResolvedValue({ error: null })
})

describe('LoginForm', () => {
  it('shows a link to the forgot-password flow', () => {
    render(<LoginForm />)

    const link = screen.getByRole('link', { name: /esqueci minha senha/i })
    expect(link).toHaveAttribute('href', '/forgot-password')
  })

  it('starts Google OAuth hinting the school domain', async () => {
    render(<LoginForm />)

    await userEvent.click(screen.getByRole('button', { name: /entrar com google/i }))

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1))
    const args = signInWithOAuth.mock.calls[0][0]
    expect(args.provider).toBe('google')
    expect(args.options.redirectTo).toMatch(/\/auth\/callback$/)
    expect(args.options.queryParams.hd).toBe('familiadenazare.com.br')
  })

  it('explains why the callback rejected the account', () => {
    render(<LoginForm callbackError="domain" />)

    expect(screen.getByText(/@familiadenazare\.com\.br/i)).toBeInTheDocument()
  })
})
