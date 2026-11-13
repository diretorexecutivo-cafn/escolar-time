// Lógica pura da edição manual de horários (sem React) — testável isoladamente.

export type EditableEntry = {
  id: string
  day_of_week: number
  time_slot_id: string
  teaching_assignments: {
    id: string
    class_subjects: {
      group_key: string | null
      class_groups: { id: string; name: string } | null
    } | null
  } | null
}

export type EditGridSlot = {
  id: string
  day_of_week: number | null
  slot_order: number
  type: string | null
}

export type EditClassGrid = { classGroupId: string; slots: EditGridSlot[] }

/** Uma célula da grade de uma turma. */
export type CellRef = { classGroupId: string; day: number; order: number }

export type SwapResult<E> = { ok: true; entries: E[] } | { ok: false; error: string }

const DAY_NAME: Record<number, string> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
}

export const cellKey = (c: CellRef) => `${c.classGroupId}:${c.day}:${c.order}`

export function classOf(e: EditableEntry): string | undefined {
  return e.teaching_assignments?.class_subjects?.class_groups?.id
}

function groupOf(e: EditableEntry): string | null {
  return e.teaching_assignments?.class_subjects?.group_key ?? null
}

/** Índices auxiliares sobre as grades das turmas. */
export function indexGrids(grids: EditClassGrid[]) {
  const bySlotId = new Map<string, EditGridSlot>()
  const byCell = new Map<string, EditGridSlot>()
  for (const g of grids) {
    for (const s of g.slots) {
      if (s.day_of_week == null) continue
      bySlotId.set(s.id, s)
      byCell.set(cellKey({ classGroupId: g.classGroupId, day: s.day_of_week, order: s.slot_order }), s)
    }
  }
  return { bySlotId, byCell }
}

/** Célula ocupada por uma aula (turma + dia + ordem da aula). */
export function cellOf(e: EditableEntry, bySlotId: Map<string, EditGridSlot>): CellRef | null {
  const classGroupId = classOf(e)
  const slot = bySlotId.get(e.time_slot_id)
  if (!classGroupId || !slot) return null
  return { classGroupId, day: e.day_of_week, order: slot.slot_order }
}

/**
 * Índices das aulas que se movem juntas a partir de uma célula: as aulas da célula e,
 * se alguma for agrupada, todas as aulas do mesmo grupo no mesmo dia/aula (outras turmas).
 */
function unitAt<E extends EditableEntry>(
  entries: E[],
  cell: CellRef,
  bySlotId: Map<string, EditGridSlot>
): number[] {
  const idx = new Set<number>()
  const groups = new Set<string>()
  entries.forEach((e, i) => {
    const c = cellOf(e, bySlotId)
    if (c && cellKey(c) === cellKey(cell)) {
      idx.add(i)
      const g = groupOf(e)
      if (g) groups.add(g)
    }
  })
  if (groups.size > 0) {
    entries.forEach((e, i) => {
      const g = groupOf(e)
      if (!g || !groups.has(g)) return
      const slot = bySlotId.get(e.time_slot_id)
      if (e.day_of_week === cell.day && slot?.slot_order === cell.order) idx.add(i)
    })
  }
  return [...idx]
}

/**
 * Troca o conteúdo de duas células da MESMA turma. Uma célula vazia funciona como
 * "mover para cá". Aulas agrupadas levam junto as outras turmas do grupo.
 *
 * Não valida regras (choques, restrições) — isso é papel do "Validar edições".
 * Só recusa trocas impossíveis: posição que não existe ou é intervalo na grade de
 * alguma turma envolvida.
 */
export function swapCells<E extends EditableEntry>(
  entries: E[],
  grids: EditClassGrid[],
  a: CellRef,
  b: CellRef
): SwapResult<E> {
  if (a.classGroupId !== b.classGroupId) {
    return { ok: false, error: 'Só é possível trocar aulas da mesma turma.' }
  }
  if (cellKey(a) === cellKey(b)) return { ok: true, entries }

  const { bySlotId, byCell } = indexGrids(grids)
  const unitA = unitAt(entries, a, bySlotId)
  const unitB = unitAt(entries, b, bySlotId)
  if (unitA.length === 0 && unitB.length === 0) return { ok: true, entries }

  const next = entries.slice()
  const moves: [number[], CellRef][] = [
    [unitA, b],
    [unitB, a],
  ]
  for (const [unit, target] of moves) {
    for (const i of unit) {
      const e = entries[i]!
      const classGroupId = classOf(e)!
      const slot = byCell.get(cellKey({ classGroupId, day: target.day, order: target.order }))
      const className = e.teaching_assignments?.class_subjects?.class_groups?.name ?? 'Turma'
      const where = `${target.order}ª aula de ${DAY_NAME[target.day] ?? `dia ${target.day}`}`
      if (!slot) return { ok: false, error: `${className} não tem ${where} (aula agrupada).` }
      if (slot.type === 'BREAK') return { ok: false, error: `${where} é intervalo para ${className}.` }
      if (slot.type === 'ROUTINE') return { ok: false, error: `${where} é uma rotina (não é aula) para ${className}.` }
      next[i] = { ...e, day_of_week: target.day, time_slot_id: slot.id }
    }
  }
  return { ok: true, entries: next }
}

/** Células cujo conteúdo difere do horário original (para marcar o que foi alterado). */
export function changedCells(
  original: EditableEntry[],
  draft: EditableEntry[],
  grids: EditClassGrid[]
): Set<string> {
  const { bySlotId } = indexGrids(grids)
  const content = (list: EditableEntry[]) => {
    const m = new Map<string, string[]>()
    for (const e of list) {
      const c = cellOf(e, bySlotId)
      if (!c) continue
      const k = cellKey(c)
      const arr = m.get(k) ?? []
      arr.push(e.teaching_assignments?.id ?? '')
      m.set(k, arr)
    }
    for (const arr of m.values()) arr.sort()
    return m
  }
  const before = content(original)
  const after = content(draft)
  const changed = new Set<string>()
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    if ((before.get(k) ?? []).join() !== (after.get(k) ?? []).join()) changed.add(k)
  }
  return changed
}

/** Formato aceito pela API de validação/salvamento. */
export function toPlacedLessons(entries: EditableEntry[]) {
  return entries
    .filter((e) => e.teaching_assignments?.id)
    .map((e) => ({
      assignmentId: e.teaching_assignments!.id,
      day: e.day_of_week,
      slotId: e.time_slot_id,
    }))
}
