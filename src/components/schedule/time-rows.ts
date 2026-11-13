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
