import { describe, expect, it } from 'vitest'
import { solve } from './csp-solver'
import { optimize } from './optimizer'
import { validateSolution, type PlacedLesson } from './solution-validator'
import type {
  EngineAssignment,
  EngineConstraint,
  EngineInput,
  EngineTimeGrid,
  EngineTimeSlot,
} from './types'

// ─── Fixture: 2 turmas, 2 dias, aulas 1, 2, intervalo (3) e 4 ─────────────────

const DAYS = [1, 2]

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Grade que começa às 07:00 + `offset` minutos: aulas de 50 min, intervalo de 20 na 3ª posição. */
function grid(classId: string, offset = 0): EngineTimeGrid {
  const defs: [number, 'LESSON' | 'BREAK', number][] = [
    [1, 'LESSON', 50],
    [2, 'LESSON', 50],
    [3, 'BREAK', 20],
    [4, 'LESSON', 50],
  ]
  const slotsByDay: Record<number, EngineTimeSlot[]> = {}
  for (const d of DAYS) {
    let cursor = 7 * 60 + offset
    slotsByDay[d] = defs.map(([order, type, dur]) => {
      const startTime = hhmm(cursor)
      cursor += dur
      return { id: `${classId}-d${d}-${order}`, order, durationMinutes: dur, type, startTime, endTime: hhmm(cursor) }
    })
  }
  return { id: `grid-${classId}`, classGroupId: classId, startTime: hhmm(7 * 60 + offset), daysOfWeek: DAYS, slotsByDay }
}

const slot = (classId: string, day: number, order: number) => `${classId}-d${day}-${order}`

function assignment(
  id: string,
  teacherId: string,
  classId: string,
  subjectName: string,
  weeklyLessons: number,
  groupKey?: string
): EngineAssignment {
  return {
    id,
    teacherId,
    classGroupId: classId,
    classGroupName: classId === 'A' ? '6º A' : '6º B',
    schoolUnitId: 'U1',
    subjectId: `subj-${subjectName}`,
    subjectName,
    weeklyLessons,
    allowDoubleLesson: false,
    groupKey,
  }
}

const MAT_A = assignment('mat-A', 'T1', 'A', 'Matemática', 2)
const MAT_B = assignment('mat-B', 'T1', 'B', 'Matemática', 2)
const HIS_A = assignment('his-A', 'T3', 'A', 'História', 1)
const HIS_B = assignment('his-B', 'T3', 'B', 'História', 1)
const EF_A = assignment('ef-A', 'T2', 'A', 'Ed. Física', 1, 'ef-6')
const EF_B = assignment('ef-B', 'T2', 'B', 'Ed. Física', 1, 'ef-6')

function makeInput(
  constraints: Record<string, EngineConstraint[]> = {},
  offsetB = 0
): EngineInput {
  const all = [MAT_A, MAT_B, HIS_A, HIS_B, EF_A, EF_B]
  const teachers = ['T1', 'T2', 'T3'].map((id) => ({
    id,
    name: { T1: 'Ana', T2: 'Bruno', T3: 'Carla' }[id]!,
    assignments: all.filter((a) => a.teacherId === id),
    constraints: constraints[id] ?? [],
  }))
  const gA = grid('A')
  const gB = grid('B', offsetB)
  return {
    tenantId: 't',
    teachers,
    classGroups: [
      { id: 'A', name: '6º A', schoolUnitId: 'U1', assignments: [MAT_A, HIS_A, EF_A], timeGrid: gA },
      { id: 'B', name: '6º B', schoolUnitId: 'U1', assignments: [MAT_B, HIS_B, EF_B], timeGrid: gB },
    ],
    timeGrids: [gA, gB],
    constraints: Object.values(constraints).flat(),
    globalRules: [],
    baselineWeight: 0,
  }
}

/** Horário válido de referência. */
function validLessons(): PlacedLesson[] {
  return [
    { assignmentId: 'mat-A', day: 1, slotId: slot('A', 1, 1) },
    { assignmentId: 'mat-A', day: 2, slotId: slot('A', 2, 1) },
    { assignmentId: 'mat-B', day: 1, slotId: slot('B', 1, 2) },
    { assignmentId: 'mat-B', day: 2, slotId: slot('B', 2, 2) },
    { assignmentId: 'his-A', day: 1, slotId: slot('A', 1, 2) },
    { assignmentId: 'his-B', day: 1, slotId: slot('B', 1, 1) },
    // Ed. Física agrupada: as duas turmas juntas, mesmo professor — não é bilocação
    { assignmentId: 'ef-A', day: 1, slotId: slot('A', 1, 4) },
    { assignmentId: 'ef-B', day: 1, slotId: slot('B', 1, 4) },
  ]
}

function move(lessons: PlacedLesson[], index: number, classId: string, day: number, order: number) {
  const copy = lessons.map((l) => ({ ...l }))
  copy[index] = { ...copy[index]!, day, slotId: slot(classId, day, order) }
  return copy
}

const types = (r: ReturnType<typeof validateSolution>) => r.hardViolations.map((v) => v.type)

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('validateSolution', () => {
  it('aceita um horário válido (aula agrupada não conta como bilocação)', () => {
    const r = validateSolution(validLessons(), makeInput())
    expect(r.hardViolations).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.score).toBeGreaterThan(0)
  })

  it('aceita o resultado do próprio solver — mesmas regras do gerador', () => {
    const input = makeInput({
      T1: [
        { id: 'c1', type: 'MAX_LESSONS_PER_DAY', priority: 'MANDATORY', weight: 1, daysOfWeek: [], value: { count: 2 } },
        { id: 'c2', type: 'UNAVAILABLE_SLOT', priority: 'MANDATORY', weight: 1, daysOfWeek: [2], slotOrder: 4 },
      ],
    })
    const { solution } = solve(input, 5000)
    expect(solution).not.toBeNull()
    const lessons = solution!.entries.map((e) => ({
      assignmentId: e.assignmentId,
      day: e.day,
      slotId: e.slotId,
    }))
    expect(validateSolution(lessons, input).hardViolations).toEqual([])
  })

  it('detecta bilocação do professor', () => {
    // Matemática do 6º B (Ana) vai para seg 1ª, onde Ana já está no 6º A
    const lessons = move(validLessons(), 2, 'B', 1, 1)
    // e História do 6º B sai de lá para não gerar choque de turma
    lessons[5] = { ...lessons[5]!, day: 2, slotId: slot('B', 2, 1) }
    const r = validateSolution(lessons, makeInput())
    expect(types(r)).toEqual(['TEACHER_CLASH'])
    expect(r.hardViolations[0]!.description).toBe(
      'Bilocação: Ana na segunda — 6º A 1ª (07:00–07:50) × 6º B 1ª (07:00–07:50).'
    )
    expect(r.hardViolations[0]!.cells).toHaveLength(2)
    expect(r.valid).toBe(false)
  })

  it('detecta duas aulas da mesma turma no mesmo horário', () => {
    const lessons = move(validLessons(), 4, 'A', 1, 1) // História A em cima de Matemática A
    expect(types(validateSolution(lessons, makeInput()))).toContain('CLASS_CLASH')
  })

  it('detecta aula agrupada separada', () => {
    const lessons = move(validLessons(), 7, 'B', 2, 4) // só o 6º B muda
    const r = validateSolution(lessons, makeInput())
    expect(types(r)).toContain('GROUP_SPLIT')
  })

  it('aceita aula agrupada movida inteira', () => {
    let lessons = move(validLessons(), 6, 'A', 2, 4)
    lessons = move(lessons, 7, 'B', 2, 4)
    expect(validateSolution(lessons, makeInput()).valid).toBe(true)
  })

  it('detecta indisponibilidade obrigatória', () => {
    const input = makeInput({
      T1: [{ id: 'c', type: 'UNAVAILABLE_SLOT', priority: 'MANDATORY', weight: 1, daysOfWeek: [1], slotOrder: 1 }],
    })
    const r = validateSolution(validLessons(), input)
    expect(types(r)).toEqual(['TEACHER_UNAVAILABLE'])
    expect(r.hardViolations[0]!.description).toMatch(/Ana indisponível nesta aula/)
  })

  it('ignora indisponibilidade apenas preferencial', () => {
    const input = makeInput({
      T1: [{ id: 'c', type: 'UNAVAILABLE_SLOT', priority: 'PREFERRED', weight: 1, daysOfWeek: [1], slotOrder: 1 }],
    })
    expect(validateSolution(validLessons(), input).valid).toBe(true)
  })

  it('detecta excesso de aulas por dia e consecutivas', () => {
    const input = makeInput({
      T1: [
        { id: 'a', type: 'MAX_LESSONS_PER_DAY', priority: 'MANDATORY', weight: 1, daysOfWeek: [], value: { count: 1 } },
        { id: 'b', type: 'MAX_CONSECUTIVE', priority: 'MANDATORY', weight: 1, daysOfWeek: [], value: { count: 1 } },
      ],
    })
    const r = validateSolution(validLessons(), input)
    expect(types(r)).toEqual(expect.arrayContaining(['MAX_LESSONS_PER_DAY', 'MAX_CONSECUTIVE']))
  })

  it('rejeita aula no intervalo', () => {
    const lessons = move(validLessons(), 4, 'A', 2, 3)
    expect(types(validateSolution(lessons, makeInput()))).toContain('INVALID_SLOT')
  })

  it('detecta disciplina com aulas a menos', () => {
    const lessons = validLessons().filter((_, i) => i !== 0)
    const r = validateSolution(lessons, makeInput())
    expect(types(r)).toEqual(['LESSON_COUNT'])
  })

  it('aponta aulas de atribuições removidas', () => {
    const lessons = [...validLessons(), { assignmentId: 'sumiu', day: 1, slotId: slot('A', 1, 1) }]
    expect(types(validateSolution(lessons, makeInput()))).toContain('UNKNOWN_ASSIGNMENT')
  })

  it('FIXED_DAY obrigatório bloqueia', () => {
    const input = makeInput({
      T3: [{ id: 'f', type: 'FIXED_DAY', priority: 'MANDATORY', weight: 1, daysOfWeek: [2] }],
    })
    expect(types(validateSolution(validLessons(), input))).toEqual(['FIXED_DAY'])
  })

  describe('choque por horário real (grades diferentes por turma)', () => {
    it('detecta bilocação com números de aula diferentes que se sobrepõem', () => {
      // 6º B começa 30 min depois: 1ª aula 07:30–08:20. Ana na 2ª do 6º A (07:50–08:40)
      // e na 1ª do 6º B → sobreposição de 30 min, embora os números de aula sejam diferentes.
      const lessons: PlacedLesson[] = [
        { assignmentId: 'mat-A', day: 1, slotId: slot('A', 1, 2) },
        { assignmentId: 'mat-A', day: 2, slotId: slot('A', 2, 1) },
        { assignmentId: 'mat-B', day: 1, slotId: slot('B', 1, 1) },
        { assignmentId: 'mat-B', day: 2, slotId: slot('B', 2, 4) },
        { assignmentId: 'his-A', day: 1, slotId: slot('A', 1, 1) },
        { assignmentId: 'his-B', day: 2, slotId: slot('B', 2, 2) },
        { assignmentId: 'ef-A', day: 1, slotId: slot('A', 1, 4) },
        { assignmentId: 'ef-B', day: 1, slotId: slot('B', 1, 4) },
      ]
      const r = validateSolution(lessons, makeInput({}, 30))
      expect(types(r)).toEqual(['TEACHER_CLASH'])
      expect(r.hardViolations[0]!.description).toBe(
        'Bilocação: Ana na segunda — 6º B 1ª (07:30–08:20) × 6º A 2ª (07:50–08:40).'
      )
    })

    it('detecta bilocação no mesmo número de aula com horários deslocados', () => {
      // validLessons: Ana na 1ª do 6º A (07:00–07:50); movendo Matemática do 6º B para a
      // 1ª dele, que agora é 07:40–08:30 → sobrepõe 10 min.
      const lessons = move(validLessons(), 2, 'B', 1, 1)
      lessons[5] = { ...lessons[5]!, day: 2, slotId: slot('B', 2, 1) }
      expect(types(validateSolution(lessons, makeInput({}, 40)))).toEqual(['TEACHER_CLASH'])
    })

    it('aulas que apenas encostam não são choque', () => {
      // 6º B começa 50 min depois: 1ª aula 07:50–08:40, logo após a 1ª do 6º A (07:00–07:50).
      const lessons = move(validLessons(), 2, 'B', 1, 1)
      lessons[5] = { ...lessons[5]!, day: 2, slotId: slot('B', 2, 1) }
      expect(validateSolution(lessons, makeInput({}, 50)).hardViolations).toEqual([])
    })

    it('mesmo nº de aula em horários que não se sobrepõem não é choque', () => {
      // 6º B começa 2h depois: Ana na 1ª das duas turmas não é bilocação.
      const lessons = move(validLessons(), 2, 'B', 1, 1)
      lessons[5] = { ...lessons[5]!, day: 2, slotId: slot('B', 2, 1) }
      expect(validateSolution(lessons, makeInput({}, 120)).hardViolations).toEqual([])
    })

    it('solver + otimizador respeitam a sobreposição de horário', () => {
      for (const offset of [10, 25, 30, 40]) {
        const input = makeInput({}, offset)
        const { solution } = solve(input, 5000)
        expect(solution).not.toBeNull()
        const optimized = optimize(solution!, input, { iterations: 200, restarts: 2 })
        for (const s of [solution!, optimized]) {
          const lessons = s.entries.map((e) => ({ assignmentId: e.assignmentId, day: e.day, slotId: e.slotId }))
          expect(validateSolution(lessons, input).hardViolations).toEqual([])
        }
      }
    })
  })
})
