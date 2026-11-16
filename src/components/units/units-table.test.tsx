import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/app/(dashboard)/dashboard/units/actions', () => ({
  toggleUnitStatus: vi.fn(),
}))

import { CanEditProvider } from '@/components/auth/can-edit'
import { UnitsTable } from './units-table'

const units = [{ id: 'u1', name: 'Sede', code: 'SED', address: null, active: true }]

describe('UnitsTable', () => {
  it('shows create/edit controls to editors', () => {
    render(
      <CanEditProvider canEdit>
        <UnitsTable units={units} />
      </CanEditProvider>
    )
    expect(screen.getByRole('link', { name: /nova unidade/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /editar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /desativar/i })).toBeInTheDocument()
  })

  it('is read-only for viewers', () => {
    render(
      <CanEditProvider canEdit={false}>
        <UnitsTable units={units} />
      </CanEditProvider>
    )
    expect(screen.getByText('Sede')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /nova unidade/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /desativar/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Ações')).not.toBeInTheDocument()
  })
})
