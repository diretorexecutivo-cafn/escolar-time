// Layout por TEMPO REAL da tela "Por Horário". Cada turma tem a própria grade: no
// Fundamental as aulas costumam andar juntas (50 em 50 min), mas no Infantil uma atividade
// pode começar no meio da aula de outra turma. Por isso as linhas não são o "número da aula":
// são as faixas entre todas as fronteiras (inícios e fins) do dia, e cada aula ocupa
// (rowSpan) as faixas que cobre. Módulo puro, testado em time-rows.test.ts.

import type { Interval } from '@/engine/time'

/** Faixa de tempo [start, end) em minutos — uma linha da tabela. */
export type Segment = Interval

/**
 * Faixas entre as fronteiras de todos os intervalos, só onde ao menos um intervalo cobre
 * (o vão entre manhã e tarde em que nenhuma turma tem aula não vira linha).
 */
export function buildSegments(intervals: Interval[]): Segment[] {
  const bounds = Array.from(new Set(intervals.flatMap((i) => [i.start, i.end]))).sort(
    (a, b) => a - b
  )
  const segments: Segment[] = []
  for (let i = 0; i + 1 < bounds.length; i++) {
    const seg = { start: bounds[i]!, end: bounds[i + 1]! }
    if (intervals.some((iv) => iv.start <= seg.start && iv.end >= seg.end)) segments.push(seg)
  }
  return segments
}

export type ColumnCell<T> =
  | { kind: 'slot'; slot: T; rowSpan: number }
  | { kind: 'gap'; rowSpan: number }

/**
 * Células de uma coluna (turma) alinhadas às faixas: a célula fica na primeira linha que
 * ocupa e as linhas cobertas por ela recebem `null` (não renderizam <td>). Faixas em que a
 * turma não tem horário viram `gap`, fundido com os vizinhos. Um rowSpan nunca atravessa
 * faixas não contíguas (vão sem aula ou linha escondida pelo filtro).
 */
export function layoutColumn<T extends Interval>(
  segments: Segment[],
  slots: T[]
): (ColumnCell<T> | null)[] {
  const covering = segments.map(
    (seg) => slots.find((s) => s.start <= seg.start && s.end >= seg.end) ?? null
  )
  const cells: (ColumnCell<T> | null)[] = []
  let current: ColumnCell<T> | null = null
  for (let i = 0; i < segments.length; i++) {
    const slot = covering[i]!
    const contiguous = i > 0 && segments[i - 1]!.end === segments[i]!.start
    const continues =
      current !== null &&
      contiguous &&
      (current.kind === 'slot' ? current.slot === slot : slot === null)
    if (continues) {
      current!.rowSpan++
      cells.push(null)
    } else {
      current = slot ? { kind: 'slot', slot, rowSpan: 1 } : { kind: 'gap', rowSpan: 1 }
      cells.push(current)
    }
  }
  return cells
}

// ─── Blocos de turmas (cada um com a própria coluna de horário) ──────────────

/** true se alguma fronteira de `b` cai estritamente dentro de um horário de `a`. */
function cutsInto(a: Interval[], b: Interval[]): boolean {
  return b.some((y) =>
    a.some((x) => (x.start < y.start && y.start < x.end) || (x.start < y.end && y.end < x.end))
  )
}

/** Um vão a partir disto (em minutos) separa o turno principal do contraturno. */
const SHIFT_GAP_MINUTES = 30

/** Horários do turno principal do dia: o primeiro bloco sem vão de SHIFT_GAP_MINUTES. */
export function mainShift(slots: Interval[]): Interval[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start)
  const block: Interval[] = []
  for (const s of sorted) {
    const prevEnd = block.length ? Math.max(...block.map((b) => b.end)) : null
    if (prevEnd !== null && s.start - prevEnd >= SHIFT_GAP_MINUTES) break
    block.push(s)
  }
  return block
}

/**
 * Duas turmas são compatíveis quando, no turno principal de cada dia, nenhuma fronteira de
 * uma cai no meio de um horário da outra — dá para mostrá-las sob a mesma coluna de horário.
 * O contraturno não conta: na Unidade I a manhã é igual para todos e só a tarde varia por
 * etapa; ali a coluna de horário do bloco simplesmente se divide.
 */
export function compatibleGrids(a: Map<number, Interval[]>, b: Map<number, Interval[]>): boolean {
  for (const day of new Set([...a.keys(), ...b.keys()])) {
    const x = mainShift(a.get(day) ?? [])
    const y = mainShift(b.get(day) ?? [])
    if (cutsInto(x, y) || cutsInto(y, x)) return false
  }
  return true
}

export type BandColumn = {
  unit: string
  /** Horários da turma por dia da semana. */
  slotsByDay: Map<number, Interval[]>
}

/**
 * Agrupa colunas consecutivas (já ordenadas por unidade e turma) em blocos que dividem uma
 * coluna de horário: uma turma entra no bloco atual se for da mesma unidade e compatível com
 * todas as turmas dele. Turmas isoladas e vizinhas (ex.: Infantil III, IV e V, cada uma com
 * horários próprios) são reunidas num bloco só, cuja coluna de horário se divide para caber
 * todas. Devolve os índices das colunas de cada bloco.
 */
export function groupBands(columns: BandColumn[]): number[][] {
  const bands: number[][] = []
  for (let i = 0; i < columns.length; i++) {
    const band = bands[bands.length - 1]
    const fits =
      band !== undefined &&
      columns[band[0]!]!.unit === columns[i]!.unit &&
      band.every((j) => compatibleGrids(columns[j]!.slotsByDay, columns[i]!.slotsByDay))
    if (fits) band.push(i)
    else bands.push([i])
  }
  const merged: { cols: number[]; isolated: boolean }[] = []
  for (const band of bands) {
    const last = merged[merged.length - 1]
    const lastIsolated = last !== undefined && last.isolated
    if (
      band.length === 1 &&
      lastIsolated &&
      columns[last.cols[0]!]!.unit === columns[band[0]!]!.unit
    ) {
      last.cols.push(band[0]!)
    } else {
      merged.push({ cols: [...band], isolated: band.length === 1 })
    }
  }
  return merged.map((m) => m.cols)
}
