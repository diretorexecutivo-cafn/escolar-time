import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
const onAuthStateChange = vi.fn()
const getSession = vi.fn()
const updateUser = vi.fn()
const createClient = vi.fn(() => ({
  auth: { onAuthStateChange, getSession, updateUser },
}))

let authStateCallback: ((event: string) => void) | undefined

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => createClient(),
}))

import ResetPasswordPage from './page'

beforeEach(() => {
  push.mockReset()
  updateUser.mockReset()
  createClient.mockClear()
  getSession.mockReset().mockResolvedValue({ data: { session: null } })
  onAuthStateChange.mockReset().mockImplementation((callback) => {
    authStateCallback = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  window.history.pushState({}, '', '/reset-password')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResetPasswordPage', () => {
  it('does not create the Supabase browser client while rendering on the server', () => {
    // renderToStaticMarkup never runs effects, mirroring how Next.js
    // pre-renders this client component on the server/build. The browser
    // client must therefore only be instantiated client-side (effect/ref),
    // never as a side effect of the render itself.
    renderToStaticMarkup(<ResetPasswordPage />)

    expect(createClient).not.toHaveBeenCalled()
  })

  it('shows a verifying state before the recovery session is established', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText(/verificando link de recuperação/i)).toBeInTheDocument()
  })

  it('shows the new-password form once Supabase emits a PASSWORD_RECOVERY event', async () => {
    render(<ResetPasswordPage />)

    authStateCallback?.('PASSWORD_RECOVERY')

    expect(await screen.findByLabelText(/^nova senha$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirme a nova senha/i)).toBeInTheDocument()
  })

  it('shows an invalid-link state when the URL already carries an error from Supabase', async () => {
    window.history.pushState(
      {},
      '',
      '/reset-password?error=access_denied&error_description=Link+expired'
    )

    render(<ResetPasswordPage />)

    expect(await screen.findByText(/link inválido ou expirado/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /solicitar novo link/i })
    ).toHaveAttribute('href', '/forgot-password')
  })

  it('shows an invalid-link state when no recovery session shows up in time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ResetPasswordPage />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(screen.getByText(/link inválido ou expirado/i)).toBeInTheDocument()
  })

  it('validates that password and confirmation match', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup()
    render(<ResetPasswordPage />)
    authStateCallback?.('PASSWORD_RECOVERY')

    await user.type(await screen.findByLabelText(/^nova senha$/i), 'segredo123')
    await user.type(screen.getByLabelText(/confirme a nova senha/i), 'outrasenha')
    await user.click(screen.getByRole('button', { name: /redefinir senha/i }))

    expect(await screen.findByText(/as senhas não coincidem/i)).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('updates the password and shows a success state on submit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    updateUser.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    render(<ResetPasswordPage />)
    authStateCallback?.('PASSWORD_RECOVERY')

    await user.type(await screen.findByLabelText(/^nova senha$/i), 'segredo123')
    await user.type(screen.getByLabelText(/confirme a nova senha/i), 'segredo123')
    await user.click(screen.getByRole('button', { name: /redefinir senha/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'segredo123' }))
    expect(await screen.findByText(/senha redefinida/i)).toBeInTheDocument()
  })

  it('shows an error state when Supabase rejects the new password', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    updateUser.mockResolvedValue({ data: {}, error: { message: 'weak password' } })
    const user = userEvent.setup()
    render(<ResetPasswordPage />)
    authStateCallback?.('PASSWORD_RECOVERY')

    await user.type(await screen.findByLabelText(/^nova senha$/i), 'segredo123')
    await user.type(screen.getByLabelText(/confirme a nova senha/i), 'segredo123')
    await user.click(screen.getByRole('button', { name: /redefinir senha/i }))

    expect(
      await screen.findByText(/não foi possível redefinir sua senha/i)
    ).toBeInTheDocument()
  })
})
