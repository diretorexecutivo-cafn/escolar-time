import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ adminSupabase: {} }))

import { pickGrid, type RawTimeGrid } from './data-loader'

function grid(id: string, vigencia: string | null, active = true): RawTimeGrid {
  return {
    id,
    class_group_id: 'turma',
    start_time: '07:00',
    days_of_week: [1],
    active,
    vigencia,
    time_slots: [],
  }
}

describe('pickGrid', () => {
  const grids = [grid('g20262', '2026/2'), grid('g20271', '2027/1'), grid('gsem', null)]

  it('usa a grade da vigência pedida', () => {
    expect(pickGrid(grids, '2026/2')?.id).toBe('g20262')
    expect(pickGrid(grids, '2027/1')?.id).toBe('g20271')
  })

  it('null pede a grade sem vigência', () => {
    expect(pickGrid(grids, null)?.id).toBe('gsem')
  })

  it('turma sem grade na vigência pedida fica sem grade', () => {
    expect(pickGrid(grids, '2028/1')).toBeNull()
  })

  it('ignora grades inativas', () => {
    expect(pickGrid([grid('g', '2026/2', false)], '2026/2')).toBeNull()
  })

  it('sem vigência informada, usa a mais recente (numérica) e deixa "sem vigência" por último', () => {
    expect(pickGrid(grids, undefined)?.id).toBe('g20271')
    expect(pickGrid([grid('a', '2026/9'), grid('b', '2026/10')], undefined)?.id).toBe('b')
    expect(pickGrid([grid('sem', null), grid('x', '2026/2')], undefined)?.id).toBe('x')
  })
})
