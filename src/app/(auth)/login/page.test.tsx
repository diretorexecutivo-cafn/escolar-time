import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./actions', () => ({
  loginAction: vi.fn(),
}))

import LoginPage from './page'

describe('LoginPage', () => {
  it('shows a link to the forgot-password flow', () => {
    render(<LoginPage />)

    const link = screen.getByRole('link', { name: /esqueci minha senha/i })
    expect(link).toHaveAttribute('href', '/forgot-password')
  })
})
