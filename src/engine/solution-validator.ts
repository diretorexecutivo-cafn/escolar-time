import { __cspInternals } from './csp-solver'
import { scoreSolution } from './optimizer'
import type {
  ConstraintViolation,
  EngineAssignment,
  EngineConstraint,
  EngineInput,
  EngineTimeSlot,
  SolutionEntry,
} from './types'
import { findTeacherClashes, slotTimeIndex, type TimedItem } from './time'

const { extractTeacherLimits, isPositionBlocked } = __cspInternals

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Uma aula como gravada em schedule_entries. */
export interface PlacedLesson {
  assignmentId: string
  day: number
  slotId: string
}

export type HardViolationType =
  | 'UNKNOWN_ASSIGNMENT'
  | 'INVALID_SLOT'
  | 'CLASS_CLASH'
  | 'TEACHER_CLASH'
  | 'TEACHER_UNAVAILABLE'
  | 'MAX_LESSONS_PER_DAY'
  | 'MAX_CONSECUTIVE'
  | 'GROUP_SPLIT'
  | 'LESSON_COUNT'
  | 'FIXED_DAY'

/** Célula da grade envolvida numa violação — usada pela UI para destacar. */
export interface ViolationCell {
  classGroupId: string
  day: number
  slotOrder: number
}

export interface HardViolation {
  type: HardViolationType
  description: string
  teacherId?: string
  cells: ViolationCell[]
}

export interface SolutionValidationResult {
  /** true = nenhuma violação obrigatória; o horário pode ser salvo. */
  valid: boolean
  hardViolations: HardViolation[]
  /** Regras preferenciais (não bloqueiam), no mesmo formato gravado em generated_schedules. */
  softViolations: ConstraintViolation[]
  score: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABEL: Record<number, string> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
}

function where(day: number, slotOrder: number): string {
  return `${DAY_LABEL[day] ?? `dia ${day}`}, ${slotOrder}ª aula`
}

function posKey(day: number, slotOrder: number): string {
  return `${day}:${slotOrder}`
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

function describeBlock(c: EngineConstraint): string {
  switch (c.type) {
    case 'UNAVAILABLE_SLOT':
      return 'indisponível nesta aula'
    case 'UNAVAILABLE_PERIOD':
      return `indisponível das ${c.timeFrom?.slice(0, 5)} às ${c.timeTo?.slice(0, 5)}`
    case 'MUST_START_AFTER':
      return `só pode começar após ${c.timeFrom?.slice(0, 5)}`
    case 'MUST_END_BEFORE':
      return `precisa terminar até ${c.timeTo?.slice(0, 5)}`
    case 'AVOID_DAY':
      return 'não leciona neste dia'
    default:
      return c.type
  }
}

/** Unidade de alocação: aula solo = ela mesma; aula agrupada = todas as turmas do grupo naquele dia/aula. */
function ownerOf(e: SolutionEntry): string {
  return e.groupInstanceId ?? e.lessonVariableId
}

// ─── Validação ────────────────────────────────────────────────────────────────

/**
 * Confere um horário completo (ex.: editado manualmente) contra as mesmas regras
 * obrigatórias que o gerador respeita, e recalcula a nota pelas regras preferenciais.
 *
 * Choque de professor é por sobreposição de horário real (mesma regra do solver e do
 * otimizador — ver ./time). Choque de turma é por (dia, nº da aula), pois a turma tem uma grade só.
 */
export function validateSolution(
  lessons: PlacedLesson[],
  input: EngineInput
): SolutionValidationResult {
  const hard: HardViolation[] = []

  const assignmentById = new Map<string, EngineAssignment>()
  const classNameById = new Map<string, string>()
  for (const cg of input.classGroups) {
    classNameById.set(cg.id, cg.name)
    for (const a of cg.assignments) assignmentById.set(a.id, a)
  }
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]))
  const teacherName = (id: string) => teacherById.get(id)?.name ?? 'Professor'
  const className = (id: string) => classNameById.get(id) ?? 'Turma'

  // slotId -> (dia, slot) por turma
  const slotIndex = new Map<string, Map<string, { day: number; slot: EngineTimeSlot }>>()
  for (const cg of input.classGroups) {
    const m = new Map<string, { day: number; slot: EngineTimeSlot }>()
    for (const [dayStr, slots] of Object.entries(cg.timeGrid?.slotsByDay ?? {})) {
      for (const slot of slots) m.set(slot.id, { day: Number(dayStr), slot })
    }
    slotIndex.set(cg.id, m)
  }

  // 1. Resolve cada aula para o formato do motor ──────────────────────────────
  const entries: SolutionEntry[] = []
  const slotOf = new Map<SolutionEntry, EngineTimeSlot>()
  let unknownCount = 0

  lessons.forEach((l, i) => {
    const a = assignmentById.get(l.assignmentId)
    if (!a) {
      unknownCount++
      return
    }
    const meta = slotIndex.get(a.classGroupId)?.get(l.slotId)
    if (!meta || meta.day !== l.day || meta.slot.type !== 'LESSON') {
      hard.push({
        type: 'INVALID_SLOT',
        description: meta
          ? `${a.subjectName} (${a.classGroupName}) está num intervalo — ${where(meta.day, meta.slot.order)}.`
          : `${a.subjectName} (${a.classGroupName}) está num horário que não existe na grade atual da turma.`,
        cells: meta ? [{ classGroupId: a.classGroupId, day: meta.day, slotOrder: meta.slot.order }] : [],
      })
      return
    }
    const order = meta.slot.order
    const groupInstanceId = a.groupKey ? `group:${a.groupKey}@${posKey(l.day, order)}` : undefined
    const entry: SolutionEntry = {
      lessonVariableId: groupInstanceId ?? `${a.id}#${i}`,
      assignmentId: a.id,
      teacherId: a.teacherId,
      classGroupId: a.classGroupId,
      schoolUnitId: a.schoolUnitId,
      day: l.day,
      slotId: l.slotId,
      slotOrder: order,
      groupInstanceId,
    }
    entries.push(entry)
    slotOf.set(entry, meta.slot)
  })

  if (unknownCount > 0) {
    hard.push({
      type: 'UNKNOWN_ASSIGNMENT',
      description:
        `${unknownCount} aula(s) pertencem a atribuições que não existem mais (disciplina, ` +
        `professor ou turma alterados depois da geração).`,
      cells: [],
    })
  }

  // 2. Choque de turma: duas aulas diferentes da mesma turma no mesmo horário ─
  const byClassPos = new Map<string, SolutionEntry[]>()
  for (const e of entries) push(byClassPos, `${e.classGroupId}|${posKey(e.day, e.slotOrder)}`, e)
  for (const list of byClassPos.values()) {
    const owners = new Set(list.map(ownerOf))
    if (owners.size < 2) continue
    const e0 = list[0]!
    const subjects = list.map((e) => assignmentById.get(e.assignmentId)?.subjectName ?? '?')
    hard.push({
      type: 'CLASS_CLASH',
      description: `${className(e0.classGroupId)} tem ${owners.size} aulas ao mesmo tempo (${subjects.join(', ')}) — ${where(e0.day, e0.slotOrder)}.`,
      cells: [{ classGroupId: e0.classGroupId, day: e0.day, slotOrder: e0.slotOrder }],
    })
  }

  // 3. Bilocação: mesmo professor em aulas diferentes com horários que se sobrepõem ─
  //    Medido pelo horário real de cada turma (não pelo nº da aula). Aula agrupada conta
  //    como uma só, mesmo envolvendo várias turmas.
  const slotTimes = slotTimeIndex(input)
  const timed: TimedItem<SolutionEntry>[] = []
  for (const e of entries) {
    const interval = slotTimes.get(e.slotId)
    if (interval) timed.push({ teacherId: e.teacherId, day: e.day, interval, owner: ownerOf(e), item: e })
  }
  for (const cluster of findTeacherClashes(timed)) {
    const e0 = cluster[0]!.item
    const parts = cluster.map(({ item }) => {
      const slot = slotOf.get(item)!
      return `${className(item.classGroupId)} ${item.slotOrder}ª (${slot.startTime}–${slot.endTime})`
    })
    hard.push({
      type: 'TEACHER_CLASH',
      description: `Bilocação: ${teacherName(e0.teacherId)} na ${DAY_LABEL[e0.day] ?? e0.day} — ${parts.join(' × ')}.`,
      teacherId: e0.teacherId,
      cells: cluster.map(({ item }) => ({
        classGroupId: item.classGroupId,
        day: item.day,
        slotOrder: item.slotOrder,
      })),
    })
  }

  // 4. Indisponibilidades obrigatórias do professor ───────────────────────────
  const mandatoryByTeacher = new Map<string, EngineConstraint[]>()
  for (const t of input.teachers) {
    mandatoryByTeacher.set(
      t.id,
      t.constraints.filter((c) => c.priority === 'MANDATORY')
    )
  }
  for (const e of entries) {
    const a = assignmentById.get(e.assignmentId)!
    const slot = slotOf.get(e)!
    const pos = { day: e.day, slotOrder: e.slotOrder, startTime: slot.startTime, endTime: slot.endTime }
    for (const c of mandatoryByTeacher.get(e.teacherId) ?? []) {
      if (c.subjectId && c.subjectId !== a.subjectId) continue
      if (c.schoolUnitId && c.schoolUnitId !== a.schoolUnitId) continue
      if (!isPositionBlocked(pos, c)) continue
      hard.push({
        type: 'TEACHER_UNAVAILABLE',
        description: `${teacherName(e.teacherId)} ${describeBlock(c)} — ${a.subjectName} (${a.classGroupName}), ${where(e.day, e.slotOrder)}.`,
        teacherId: e.teacherId,
        cells: [{ classGroupId: e.classGroupId, day: e.day, slotOrder: e.slotOrder }],
      })
      break
    }
  }

  // 5. Máximo de aulas por dia / consecutivas ────────────────────────────────
  const limits = extractTeacherLimits(input)
  const teacherDayOrders = new Map<string, Map<number, Set<number>>>()
  const teacherDayEntries = new Map<string, SolutionEntry[]>()
  for (const e of entries) {
    if (!limits.has(e.teacherId)) continue
    let days = teacherDayOrders.get(e.teacherId)
    if (!days) {
      days = new Map()
      teacherDayOrders.set(e.teacherId, days)
    }
    let orders = days.get(e.day)
    if (!orders) {
      orders = new Set()
      days.set(e.day, orders)
    }
    orders.add(e.slotOrder)
    push(teacherDayEntries, `${e.teacherId}|${e.day}`, e)
  }
  for (const [teacherId, days] of teacherDayOrders) {
    const lim = limits.get(teacherId)!
    for (const [day, orderSet] of days) {
      const cells = (teacherDayEntries.get(`${teacherId}|${day}`) ?? []).map((e) => ({
        classGroupId: e.classGroupId,
        day,
        slotOrder: e.slotOrder,
      }))
      if (lim.maxLessonsPerDay !== undefined && orderSet.size > lim.maxLessonsPerDay) {
        hard.push({
          type: 'MAX_LESSONS_PER_DAY',
          description: `${teacherName(teacherId)} tem ${orderSet.size} aulas na ${DAY_LABEL[day] ?? day} (máximo ${lim.maxLessonsPerDay}).`,
          teacherId,
          cells,
        })
      }
      if (lim.maxConsecutive !== undefined) {
        const sorted = [...orderSet].sort((a, b) => a - b)
        let run = 1
        let worst = 1
        for (let i = 1; i < sorted.length; i++) {
          run = sorted[i]! - sorted[i - 1]! === 1 ? run + 1 : 1
          worst = Math.max(worst, run)
        }
        if (worst > lim.maxConsecutive) {
          hard.push({
            type: 'MAX_CONSECUTIVE',
            description: `${teacherName(teacherId)} tem ${worst} aulas seguidas na ${DAY_LABEL[day] ?? day} (máximo ${lim.maxConsecutive}).`,
            teacherId,
            cells,
          })
        }
      }
    }
  }

  // 6. Aulas agrupadas precisam estar todas no mesmo dia/aula ─────────────────
  const groupMembers = new Map<string, EngineAssignment[]>()
  for (const a of assignmentById.values()) if (a.groupKey) push(groupMembers, a.groupKey, a)
  const entriesByAssignment = new Map<string, SolutionEntry[]>()
  for (const e of entries) push(entriesByAssignment, e.assignmentId, e)

  for (const members of groupMembers.values()) {
    // só faz sentido conferir grupos que aparecem no horário
    if (!members.some((m) => entriesByAssignment.has(m.id))) continue
    const countByMember = new Map<string, Map<string, number>>()
    const allKeys = new Set<string>()
    for (const m of members) {
      const counts = new Map<string, number>()
      for (const e of entriesByAssignment.get(m.id) ?? []) {
        const k = posKey(e.day, e.slotOrder)
        counts.set(k, (counts.get(k) ?? 0) + 1)
        allKeys.add(k)
      }
      countByMember.set(m.id, counts)
    }
    for (const k of allKeys) {
      const present = members.filter((m) => (countByMember.get(m.id)!.get(k) ?? 0) > 0)
      if (present.length === members.length) continue
      const missing = members.filter((m) => !present.includes(m))
      const [day, order] = k.split(':').map(Number) as [number, number]
      hard.push({
        type: 'GROUP_SPLIT',
        description:
          `Aula agrupada de ${members[0]!.subjectName} separada: ${present.map((m) => m.classGroupName).join(', ')} ` +
          `está na ${where(day, order)}, mas ${missing.map((m) => m.classGroupName).join(', ')} não.`,
        cells: present.map((m) => ({ classGroupId: m.classGroupId, day, slotOrder: order })),
      })
    }
  }

  // 7. Cada disciplina mantém suas aulas semanais (turmas presentes no horário) ─
  const classesInSchedule = new Set(entries.map((e) => e.classGroupId))
  for (const cg of input.classGroups) {
    if (!classesInSchedule.has(cg.id)) continue
    for (const a of cg.assignments) {
      const placed = entriesByAssignment.get(a.id)?.length ?? 0
      if (placed === a.weeklyLessons) continue
      hard.push({
        type: 'LESSON_COUNT',
        description: `${a.subjectName} (${cg.name}) tem ${placed} aula(s) no horário, mas o cadastro prevê ${a.weeklyLessons}.`,
        cells: [],
      })
    }
  }

  // 8. Regras preferenciais + nota (mesma função usada pelo gerador) ─────────
  const { score, violations } = scoreSolution({ entries }, input)
  // FIXED_DAY obrigatório só é detectável no resultado final — scoreSolution o
  // marca com priority MANDATORY; aqui ele bloqueia.
  const softViolations: ConstraintViolation[] = []
  for (const v of violations) {
    if (v.priority === 'MANDATORY') {
      hard.push({
        type: 'FIXED_DAY',
        description: v.description,
        teacherId: v.affectedTeacherId,
        cells: [],
      })
    } else {
      softViolations.push(v)
    }
  }

  return { valid: hard.length === 0, hardViolations: hard, softViolations, score }
}
