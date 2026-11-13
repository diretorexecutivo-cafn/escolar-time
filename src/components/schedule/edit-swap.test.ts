import { describe, expect, it } from 'vitest'
import { changedCells, swapCells, type EditableEntry, type EditClassGrid } from './edit-swap'

// Turmas A e B, seg/ter, aulas 1, 2, intervalo (3) e 4. B não tem 4ª aula na terça.
function grid(classId: string, noTue4 = false): EditClassGrid {
  const slots = []
  for (const day of [1, 2]) {
    for (const order of [1, 2, 3, 4]) {
      if (noTue4 && day === 2 && order === 4) continue
      slots.push({ id: `${classId}${day}${order}`, day_of_week: day, slot_order: order, type: order === 3 ? 'BREAK' : 'LESSON' })
    }
  }
  return { classGroupId: classId, slots }
}
const GRIDS = [grid('A'), grid('B', true)]

function entry(id: string, classId: string, day: number, order: number, group: string | null = null): EditableEntry {
  return {
    id,
    day_of_week: day,
    time_slot_id: `${classId}${day}${order}`,
    teaching_assignments: {
      id: `ta-${id}`,
      class_subjects: { group_key: group, class_groups: { id: classId, name: `Turma ${classId}` } },
    },
  }
}

const pos = (e: EditableEntry) => `${e.day_of_week}:${e.time_slot_id}`

describe('swapCells', () => {
  const base = () => [
    entry('matA', 'A', 1, 1),
    entry('hisA', 'A', 2, 2),
    entry('efA', 'A', 1, 4, 'ef'),
    entry('efB', 'B', 1, 4, 'ef'),
    entry('matB', 'B', 1, 1),
  ]

  it('troca duas aulas da mesma turma', () => {
    const r = swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 1 }, { classGroupId: 'A', day: 2, order: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(pos(r.entries[0]!)).toBe('2:A22')
    expect(pos(r.entries[1]!)).toBe('1:A11')
    expect(pos(r.entries[4]!)).toBe('1:B11')
  })

  it('move para célula vazia', () => {
    const r = swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 1 }, { classGroupId: 'A', day: 2, order: 1 })
    expect(r.ok && pos(r.entries[0]!)).toBe('2:A21')
  })

  it('aula agrupada leva junto a outra turma', () => {
    const r = swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 4 }, { classGroupId: 'A', day: 1, order: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(pos(r.entries[2]!)).toBe('1:A12')
    expect(pos(r.entries[3]!)).toBe('1:B12')
  })

  it('recusa quando a outra turma do grupo não tem a posição', () => {
    const r = swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 4 }, { classGroupId: 'A', day: 2, order: 4 })
    expect(r).toEqual({ ok: false, error: 'Turma B não tem 4ª aula de terça (aula agrupada).' })
  })

  it('recusa intervalo e turmas diferentes', () => {
    expect(swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 1 }, { classGroupId: 'A', day: 1, order: 3 }).ok).toBe(false)
    expect(swapCells(base(), GRIDS, { classGroupId: 'A', day: 1, order: 1 }, { classGroupId: 'B', day: 1, order: 1 }).ok).toBe(false)
  })

  it('trocar e destrocar volta ao original, sem células alteradas', () => {
    const a = { classGroupId: 'A', day: 1, order: 1 }
    const b = { classGroupId: 'A', day: 2, order: 2 }
    const r1 = swapCells(base(), GRIDS, a, b)
    if (!r1.ok) throw new Error()
    expect(changedCells(base(), r1.entries, GRIDS)).toEqual(new Set(['A:1:1', 'A:2:2']))
    const r2 = swapCells(r1.entries, GRIDS, a, b)
    if (!r2.ok) throw new Error()
    expect(changedCells(base(), r2.entries, GRIDS).size).toBe(0)
  })
})
