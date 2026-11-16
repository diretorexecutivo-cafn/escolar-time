import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/history',
}))

import { HistoryView } from './history-view'
import { actionVerb, detailLines, type AuditEntry } from '@/lib/audit-labels'

const ADMIN = '79c1bf5d-eea0-4a94-86c1-0484aff70360'

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    occurred_at: '2026-11-16T15:00:00Z',
    actor_id: ADMIN,
    actor_name: 'Admin Dev',
    actor_email: 'admin@familiadenazare.com.br',
    action: 'UPDATE',
    table_name: 'class_groups',
    record_id: '00000000-0000-0000-0000-0000000000aa',
    record_label: '5º Ano A',
    changed_fields: ['name'],
    old_data: { name: '5º Ano' },
    new_data: { name: '5º Ano A' },
    ...over,
  }
}

function renderView(entries: AuditEntry[]) {
  return render(
    <HistoryView
      entries={entries}
      users={[{ id: ADMIN, name: 'Admin Dev' }]}
      filters={{ user: '', area: '' }}
      page={1}
      hasMore={false}
      error={null}
    />
  )
}

describe('audit labels', () => {
  it('descreve desativação e reativação', () => {
    const off = entry({ changed_fields: ['active'], old_data: { active: true }, new_data: { active: false } })
    const on = entry({ changed_fields: ['active'], old_data: { active: false }, new_data: { active: true } })
    expect(actionVerb(off)).toBe('desativou')
    expect(actionVerb(on)).toBe('reativou')
    expect(detailLines(off)).toEqual([{ field: 'active', label: 'Status', before: 'Ativo', after: 'Inativo' }])
  })

  it('traduz papéis e esconde campos técnicos na criação', () => {
    const created = entry({
      action: 'INSERT',
      table_name: 'profiles',
      changed_fields: null,
      old_data: null,
      new_data: { id: 'x', tenant_id: 'y', name: 'Maria', role: 'COORDINATOR', active: true },
    })
    expect(detailLines(created).map((l) => [l.label, l.after])).toEqual([
      ['Nome', 'Maria'],
      ['Papel', 'Coordenador'],
      ['Status', 'Ativo'],
    ])
  })

  it('reconhece horário apagado', () => {
    const del = entry({
      table_name: 'generated_schedules',
      changed_fields: ['deleted_at', 'deleted_reason', 'is_baseline'],
      new_data: { deleted_at: '2026-11-16T15:00:00Z', deleted_reason: 'manual', is_baseline: false },
    })
    expect(actionVerb(del)).toBe('apagou')
  })
})

describe('HistoryView', () => {
  it('mostra quem fez o quê e o antes/depois ao expandir', async () => {
    renderView([entry({})])
    const row = screen.getByRole('listitem')

    expect(within(row).getByText('Admin Dev')).toBeInTheDocument()
    expect(within(row).getByText('alterou')).toBeInTheDocument()
    expect(within(row).getByText(/“5º Ano A”/)).toBeInTheDocument()
    // 15:00 UTC = 12:00 em Goiânia/São Paulo
    expect(within(row).getByText('12:00')).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button'))
    expect(within(row).getByText('5º Ano')).toBeInTheDocument()
    expect(within(row).getByText('Nome')).toBeInTheDocument()
  })

  it('agrupa alterações seguidas da mesma pessoa na mesma área', async () => {
    renderView([
      entry({ id: 3, occurred_at: '2026-11-16T15:01:00Z', table_name: 'time_slots', record_label: 'Grade · 07:00–07:50' }),
      entry({ id: 2, occurred_at: '2026-11-16T15:00:30Z', table_name: 'time_slots', record_label: 'Grade · 07:50–08:40' }),
      entry({ id: 1, occurred_at: '2026-11-16T14:00:00Z', table_name: 'time_slots', record_label: 'Grade · 08:40–09:30' }),
    ])

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText(/2 registros de horário da grade/)).toBeInTheDocument()

    await userEvent.click(within(rows[0]).getByRole('button'))
    expect(within(rows[0]).getByText(/07:00–07:50/)).toBeInTheDocument()
    expect(within(rows[0]).getByText(/07:50–08:40/)).toBeInTheDocument()
  })

  it('identifica alterações feitas direto no banco como Sistema', () => {
    renderView([entry({ actor_id: null, actor_name: null, actor_email: null })])
    expect(within(screen.getByRole('listitem')).getByText('Sistema')).toBeInTheDocument()
  })

  it('avisa quando não há registros', () => {
    renderView([])
    expect(screen.getByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument()
  })
})
