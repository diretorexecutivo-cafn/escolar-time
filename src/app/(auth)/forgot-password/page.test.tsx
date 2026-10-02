import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const resetPasswordForEmail = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { resetPasswordForEmail },
  }),
}))

import ForgotPasswordPage from './page'

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset()
  })

  it('validates the e-mail field before submitting', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.click(screen.getByRole('button', { name: /enviar link de recuperação/i }))

    expect(await screen.findByText(/e-mail inválido/i)).toBeInTheDocument()
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('sends the recovery e-mail with a redirect to /reset-password and shows a success state', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/e-mail/i), 'professor@example.com')
    await user.click(screen.getByRole('button', { name: /enviar link de recuperação/i }))

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1))
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'professor@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    )

    expect(await screen.findByText(/verifique seu e-mail/i)).toBeInTheDocument()
  })

  it('shows a generic success state even when Supabase reports an error, to avoid leaking account existence', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'User not found' } })
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/e-mail/i), 'ninguem@example.com')
    await user.click(screen.getByRole('button', { name: /enviar link de recuperação/i }))

    expect(await screen.findByText(/verifique seu e-mail/i)).toBeInTheDocument()
  })

  it('shows an error state when the request fails unexpectedly', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/e-mail/i), 'professor@example.com')
    await user.click(screen.getByRole('button', { name: /enviar link de recuperação/i }))

    expect(
      await screen.findByText(/não foi possível enviar o e-mail de recuperação/i)
    ).toBeInTheDocument()
  })
})
