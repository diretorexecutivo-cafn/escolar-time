import { describe, expect, it } from 'vitest'
import { buildSegments, layoutColumn } from './time-rows'

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
