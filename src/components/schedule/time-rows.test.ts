import { describe, expect, it } from 'vitest'
import { buildSegments, groupBands, layoutColumn } from './time-rows'

const iv = (start: number, end: number) => ({ start, end })

describe('buildSegments', () => {
  it('turmas sincronizadas geram uma linha por aula', () => {
    const fund = [iv(420, 470), iv(470, 520)]
    expect(buildSegments([...fund, ...fund])).toEqual([iv(420, 470), iv(470, 520)])
  })

  it('aula do Infantil começando no meio quebra a faixa', () => {
    expect(buildSegments([iv(420, 470), iv(470, 520), iv(450, 500)])).toEqual([
      iv(420, 450),
      iv(450, 470),
      iv(470, 500),
      iv(500, 520),
    ])
  })

  it('vão em que nenhuma turma tem aula não vira linha', () => {
    expect(buildSegments([iv(420, 470), iv(780, 830)])).toEqual([iv(420, 470), iv(780, 830)])
  })
})

describe('layoutColumn', () => {
  const segments = [iv(420, 450), iv(450, 470), iv(470, 500), iv(500, 520)]

  it('aula longa ocupa várias linhas (rowSpan)', () => {
    const a = iv(420, 470)
    const b = iv(470, 520)
    expect(layoutColumn(segments, [a, b])).toEqual([
      { kind: 'slot', slot: a, rowSpan: 2 },
      null,
      { kind: 'slot', slot: b, rowSpan: 2 },
      null,
    ])
  })

  it('faixas sem horário da turma viram um vão só', () => {
    const a = iv(450, 470)
    expect(layoutColumn(segments, [a])).toEqual([
      { kind: 'gap', rowSpan: 1 },
      { kind: 'slot', slot: a, rowSpan: 1 },
      { kind: 'gap', rowSpan: 2 },
      null,
    ])
  })

  it('rowSpan não atravessa faixas não contíguas', () => {
    const a = iv(420, 520)
    expect(layoutColumn([iv(420, 450), iv(500, 520)], [a])).toEqual([
      { kind: 'slot', slot: a, rowSpan: 1 },
      { kind: 'slot', slot: a, rowSpan: 1 },
    ])
  })
})

describe('groupBands', () => {
  // Grade de 50 min começando em `first` (minutos), com `n` aulas, nos dias 1 e 2.
  const cadence = (first: number, n: number) => {
    const slots = Array.from({ length: n }, (_, k) => iv(first + 50 * k, first + 50 * (k + 1)))
    return new Map([
      [1, slots],
      [2, slots],
    ])
  }
  const col = (unit: string, slotsByDay: Map<number, ReturnType<typeof iv>[]>) => ({
    unit,
    slotsByDay,
  })

  it('turmas na mesma cadência ficam num bloco, mesmo com quantidades diferentes de aulas', () => {
    expect(groupBands([col('U1', cadence(430, 6)), col('U1', cadence(430, 7))])).toEqual([[0, 1]])
  })

  it('contraturno diferente não separa turmas com a mesma manhã', () => {
    const tarde = (slots: ReturnType<typeof iv>[]) => {
      const m = cadence(430, 6)
      m.set(2, [...m.get(2)!, ...slots])
      return m
    }
    const a = col('U1', tarde([iv(790, 830), iv(830, 870)]))
    const b = col('U1', tarde([iv(840, 890)]))
    expect(groupBands([a, a, b, b])).toEqual([[0, 1, 2, 3]])
  })

  it('outra cadência na mesma unidade abre outro bloco', () => {
    const a = col('U2', cadence(430, 5))
    const b = col('U2', cadence(450, 5))
    expect(groupBands([a, a, b, b])).toEqual([[0, 1], [2, 3]])
  })

  it('unidades diferentes nunca dividem bloco', () => {
    expect(groupBands([col('U1', cadence(430, 5)), col('U2', cadence(430, 5))])).toEqual([[0], [1]])
  })

  it('turmas isoladas vizinhas (Infantil) dividem um bloco só', () => {
    const fund = col('U2', cadence(450, 5))
    const inf3 = col('U2', new Map([[1, [iv(450, 470), iv(470, 505)]]]))
    const inf4 = col('U2', new Map([[1, [iv(450, 480), iv(480, 505)]]]))
    const inf5 = col('U2', new Map([[1, [iv(450, 460), iv(460, 505)]]]))
    expect(groupBands([fund, fund, inf3, inf4, inf5])).toEqual([[0, 1], [2, 3, 4]])
  })
})
