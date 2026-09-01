import type {
  EngineAssignment,
  EngineConstraint,
  EngineInput,
  GroupDomainPosition,
  LessonVariable,
  LessonVariableMember,
  ScheduleSolution,
  SlotPosition,
  SolutionEntry,
} from './types'

const DEFAULT_TIMEOUT_MS = 25000

// ─── Variable construction ────────────────────────────────────────────────────

function classLessonPositions(cg: EngineInput['classGroups'][number]): SlotPosition[] {
  const positions: SlotPosition[] = []
  if (!cg.timeGrid) return positions
  for (const [dayStr, slots] of Object.entries(cg.timeGrid.slotsByDay)) {
    const day = Number(dayStr)
    for (const s of slots) {
      if (s.type !== 'LESSON') continue
      positions.push({
        day,
        slotId: s.id,
        slotOrder: s.order,
        startTime: s.startTime,
        endTime: s.endTime,
      })
    }
  }
  return positions
}

function memberOf(a: EngineAssignment): LessonVariableMember {
  return {
    assignmentId: a.id,
    teacherId: a.teacherId,
    classGroupId: a.classGroupId,
    schoolUnitId: a.schoolUnitId,
    subjectId: a.subjectId,
  }
}

// Interseção das posições LESSON das turmas de um grupo, casadas por (day, slotOrder) —
// cada turma mantém seu próprio slotId nessa posição comum.
function intersectGroupDomain(
  classGroupIds: string[],
  positionsByClass: Map<string, SlotPosition[]>
): GroupDomainPosition[] {
  if (classGroupIds.length === 0) return []
  const [first, ...rest] = classGroupIds as [string, ...string[]]
  const base = positionsByClass.get(first) ?? []
  const result: GroupDomainPosition[] = []

  for (const pos of base) {
    const slotIdByClass: Record<string, string> = { [first]: pos.slotId }
    let ok = true
    for (const cid of rest) {
      const match = (positionsByClass.get(cid) ?? []).find(
        (p) => p.day === pos.day && p.slotOrder === pos.slotOrder
      )
      if (!match) {
        ok = false
        break
      }
      slotIdByClass[cid] = match.slotId
    }
    if (ok) {
      result.push({
        day: pos.day,
        slotOrder: pos.slotOrder,
        startTime: pos.startTime,
        endTime: pos.endTime,
        slotIdByClass,
      })
    }
  }

  return result
}

export function buildVariables(input: EngineInput): LessonVariable[] {
  const variables: LessonVariable[] = []

  const positionsByClass = new Map<string, SlotPosition[]>()
  for (const cg of input.classGroups) {
    positionsByClass.set(cg.id, classLessonPositions(cg))
  }

  const grouped = new Map<string, EngineAssignment[]>()
  const solo: EngineAssignment[] = []

  for (const cg of input.classGroups) {
    for (const a of cg.assignments) {
      if (a.groupKey) {
        let arr = grouped.get(a.groupKey)
        if (!arr) {
          arr = []
          grouped.set(a.groupKey, arr)
        }
        arr.push(a)
      } else {
        solo.push(a)
      }
    }
  }

  for (const a of solo) {
    const domain: GroupDomainPosition[] = (positionsByClass.get(a.classGroupId) ?? []).map(
      (pos) => ({
        day: pos.day,
        slotOrder: pos.slotOrder,
        startTime: pos.startTime,
        endTime: pos.endTime,
        slotIdByClass: { [a.classGroupId]: pos.slotId },
      })
    )
    const member = memberOf(a)
    for (let i = 0; i < a.weeklyLessons; i++) {
      variables.push({ id: `${a.id}#${i}`, members: [member], domain: domain.slice() })
    }
  }

  for (const [groupKey, members] of grouped) {
    const weeklyLessons = members[0]!.weeklyLessons
    if (members.some((m) => m.weeklyLessons !== weeklyLessons)) {
      console.warn(
        `group_key "${groupKey}": weeklyLessons divergente entre class_subjects do grupo — usando ${weeklyLessons}.`
      )
    }
    const classGroupIds = [...new Set(members.map((m) => m.classGroupId))]
    const domain = intersectGroupDomain(classGroupIds, positionsByClass)
    const variableMembers = members.map(memberOf)
    for (let i = 0; i < weeklyLessons; i++) {
      variables.push({
        id: `group:${groupKey}#${i}`,
        members: variableMembers,
        domain: domain.slice(),
      })
    }
  }

  return variables
}

// ─── Hard-constraint domain pruning ───────────────────────────────────────────

function dayMatches(c: EngineConstraint, day: number): boolean {
  return c.daysOfWeek.length === 0 || c.daysOfWeek.includes(day)
}

function isPositionBlocked(
  pos: { day: number; startTime: string; endTime: string; slotOrder: number },
  c: EngineConstraint
): boolean {
  if (!dayMatches(c, pos.day)) return false
  switch (c.type) {
    case 'UNAVAILABLE_SLOT':
      return c.slotOrder !== undefined && pos.slotOrder === c.slotOrder
    case 'UNAVAILABLE_PERIOD':
      return (
        c.timeFrom !== undefined &&
        c.timeTo !== undefined &&
        pos.startTime >= c.timeFrom &&
        pos.startTime < c.timeTo
      )
    case 'MUST_START_AFTER':
      return c.timeFrom !== undefined && pos.startTime < c.timeFrom
    case 'MUST_END_BEFORE':
      return c.timeTo !== undefined && pos.endTime > c.timeTo
    case 'AVOID_DAY':
      // Como PREFERRED vira penalidade no score; como MANDATORY bloqueia o dia.
      return c.daysOfWeek.length > 0
    default:
      return false
  }
}

export function applyHardConstraints(
  variables: LessonVariable[],
  input: EngineInput
): LessonVariable[] {
  const teacherConstraints = new Map<string, EngineConstraint[]>()
  for (const t of input.teachers) {
    teacherConstraints.set(
      t.id,
      t.constraints.filter((c) => c.priority === 'MANDATORY')
    )
  }

  return variables.map((v) => {
    // Uma posição é válida para o grupo só se for válida para TODOS os membros — se um dos
    // professores do grupo não pode naquele horário, o grupo inteiro não pode.
    const filtered = v.domain.filter((pos) => {
      for (const member of v.members) {
        const constraints = teacherConstraints.get(member.teacherId) ?? []
        for (const c of constraints) {
          if (c.subjectId && c.subjectId !== member.subjectId) continue
          if (c.schoolUnitId && c.schoolUnitId !== member.schoolUnitId) continue
          if (isPositionBlocked(pos, c)) return false
        }
      }
      return true
    })

    return { ...v, domain: filtered }
  })
}

// ─── Backtracking solver ──────────────────────────────────────────────────────

type TeacherMaxLimits = {
  maxLessonsPerDay?: number
  maxConsecutive?: number
}

function extractTeacherLimits(input: EngineInput): Map<string, TeacherMaxLimits> {
  const limits = new Map<string, TeacherMaxLimits>()
  for (const t of input.teachers) {
    const l: TeacherMaxLimits = {}
    for (const c of t.constraints) {
      if (c.priority !== 'MANDATORY') continue
      const count = (c.value as { count?: number } | undefined)?.count
      if (c.type === 'MAX_LESSONS_PER_DAY' && typeof count === 'number') {
        l.maxLessonsPerDay = Math.min(l.maxLessonsPerDay ?? Infinity, count)
      } else if (c.type === 'MAX_CONSECUTIVE' && typeof count === 'number') {
        l.maxConsecutive = Math.min(l.maxConsecutive ?? Infinity, count)
      }
    }
    if (Object.keys(l).length > 0) limits.set(t.id, l)
  }
  return limits
}

function makeKey(day: number, slotOrder: number): string {
  return `${day}:${slotOrder}`
}

class TimeoutSignal extends Error {
  constructor() {
    super('CSP timeout')
  }
}

export interface SolveResult {
  solution: ScheduleSolution | null
  backtracks: number
  timedOut: boolean
}

export function solve(
  input: EngineInput,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): SolveResult {
  const variablesRaw = buildVariables(input)
  const variables = applyHardConstraints(variablesRaw, input)

  // MRV ordering — smallest domain first
  variables.sort((a, b) => a.domain.length - b.domain.length)

  // Index baseline positions for preference
  const baselineByAssignment = new Map<string, Set<string>>()
  if (input.baseline) {
    for (const e of input.baseline.entries) {
      let set = baselineByAssignment.get(e.assignmentId)
      if (!set) {
        set = new Set()
        baselineByAssignment.set(e.assignmentId, set)
      }
      set.add(`${e.day}:${e.slotId}`)
    }
  }

  const limits = extractTeacherLimits(input)

  // "day:order" -> id do LessonVariable dono daquela ocupação. Como v.id é único por variável,
  // membros do mesmo grupo (mesmo v.id) nunca conflitam entre si; qualquer outra variável tem
  // v.id diferente e conflita normalmente.
  const teacherSlot = new Map<string, Map<string, string>>() // teacherId -> "day:order" -> variableId
  const classSlot = new Map<string, Map<string, string>>() // classGroupId -> "day:order" -> variableId
  const teacherDayCount = new Map<string, Map<number, number>>() // teacher -> day -> count
  const teacherDayOrders = new Map<string, Map<number, Set<number>>>() // teacher -> day -> orders

  function ensureMap<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
    let m = map.get(key)
    if (!m) {
      m = new Map<string, V>()
      map.set(key, m)
    }
    return m
  }

  function ensureDayMap<V>(
    map: Map<string, Map<number, V>>,
    key: string,
    factory: () => V,
    day: number
  ): V {
    let m = map.get(key)
    if (!m) {
      m = new Map<number, V>()
      map.set(key, m)
    }
    let v = m.get(day)
    if (v === undefined) {
      v = factory()
      m.set(day, v)
    }
    return v
  }

  function consecutiveLengthIfPlaced(
    teacherId: string,
    day: number,
    order: number
  ): number {
    const orders = teacherDayOrders.get(teacherId)?.get(day)
    if (!orders) return 1
    let len = 1
    let o = order - 1
    while (orders.has(o)) {
      len++
      o--
    }
    o = order + 1
    while (orders.has(o)) {
      len++
      o++
    }
    return len
  }

  function isValid(v: LessonVariable, pos: GroupDomainPosition): boolean {
    const key = makeKey(pos.day, pos.slotOrder)

    const uniqueTeachers = new Set<string>()
    for (const member of v.members) {
      const occTeacher = teacherSlot.get(member.teacherId)?.get(key)
      if (occTeacher !== undefined && occTeacher !== v.id) return false
      const occClass = classSlot.get(member.classGroupId)?.get(key)
      if (occClass !== undefined && occClass !== v.id) return false
      uniqueTeachers.add(member.teacherId)
    }

    for (const teacherId of uniqueTeachers) {
      const lim = limits.get(teacherId)
      if (lim?.maxLessonsPerDay !== undefined) {
        const count = teacherDayCount.get(teacherId)?.get(pos.day) ?? 0
        if (count + 1 > lim.maxLessonsPerDay) return false
      }
      if (lim?.maxConsecutive !== undefined) {
        const len = consecutiveLengthIfPlaced(teacherId, pos.day, pos.slotOrder)
        if (len > lim.maxConsecutive) return false
      }
    }
    return true
  }

  function place(v: LessonVariable, pos: GroupDomainPosition): SolutionEntry[] {
    const key = makeKey(pos.day, pos.slotOrder)
    const countedTeachers = new Set<string>()

    for (const member of v.members) {
      ensureMap(teacherSlot, member.teacherId).set(key, v.id)
      ensureMap(classSlot, member.classGroupId).set(key, v.id)

      if (!countedTeachers.has(member.teacherId)) {
        countedTeachers.add(member.teacherId)
        const dayMap = teacherDayCount.get(member.teacherId) ?? new Map<number, number>()
        teacherDayCount.set(member.teacherId, dayMap)
        dayMap.set(pos.day, (dayMap.get(pos.day) ?? 0) + 1)
        ensureDayMap(teacherDayOrders, member.teacherId, () => new Set<number>(), pos.day).add(
          pos.slotOrder
        )
      }
    }

    const groupInstanceId = v.members.length > 1 ? v.id : undefined
    return v.members.map((member) => ({
      lessonVariableId: v.id,
      assignmentId: member.assignmentId,
      teacherId: member.teacherId,
      classGroupId: member.classGroupId,
      schoolUnitId: member.schoolUnitId,
      day: pos.day,
      slotId: pos.slotIdByClass[member.classGroupId]!,
      slotOrder: pos.slotOrder,
      groupInstanceId,
    }))
  }

  function unplace(v: LessonVariable, pos: GroupDomainPosition): void {
    const key = makeKey(pos.day, pos.slotOrder)
    const uncountedTeachers = new Set<string>()

    for (const member of v.members) {
      teacherSlot.get(member.teacherId)?.delete(key)
      classSlot.get(member.classGroupId)?.delete(key)

      if (!uncountedTeachers.has(member.teacherId)) {
        uncountedTeachers.add(member.teacherId)
        const dayMap = teacherDayCount.get(member.teacherId)
        if (dayMap) {
          const c = (dayMap.get(pos.day) ?? 1) - 1
          if (c <= 0) dayMap.delete(pos.day)
          else dayMap.set(pos.day, c)
        }
        teacherDayOrders.get(member.teacherId)?.get(pos.day)?.delete(pos.slotOrder)
      }
    }
  }

  function orderDomain(v: LessonVariable): GroupDomainPosition[] {
    // Grupo não tem um "assignment" único — usa o primeiro membro como representante.
    const baseline = baselineByAssignment.get(v.members[0]!.assignmentId)
    if (!baseline || baseline.size === 0) return v.domain
    return [...v.domain].sort((a, b) => {
      const ka = `${a.day}:${a.slotIdByClass[v.members[0]!.classGroupId]}`
      const kb = `${b.day}:${b.slotIdByClass[v.members[0]!.classGroupId]}`
      return (baseline.has(kb) ? 1 : 0) - (baseline.has(ka) ? 1 : 0)
    })
  }

  const solution: SolutionEntry[] = []
  let bestPartial: SolutionEntry[] = []
  let backtracks = 0
  const startedAt = Date.now()

  function backtrack(idx: number): boolean {
    if (Date.now() - startedAt > timeoutMs) {
      if (solution.length > bestPartial.length) bestPartial = [...solution]
      throw new TimeoutSignal()
    }
    if (idx === variables.length) return true

    const v = variables[idx]!
    if (v.domain.length === 0) {
      // Variable infeasible from start — can't satisfy
      backtracks++
      return false
    }

    const ordered = orderDomain(v)
    for (const pos of ordered) {
      if (!isValid(v, pos)) continue
      const before = solution.length
      const entries = place(v, pos)
      solution.push(...entries)
      if (solution.length > bestPartial.length) bestPartial = [...solution]
      if (backtrack(idx + 1)) return true
      solution.length = before
      unplace(v, pos)
      backtracks++
    }
    return false
  }

  let timedOut = false
  try {
    if (backtrack(0)) {
      return { solution: { entries: [...solution] }, backtracks, timedOut }
    }
  } catch (err) {
    if (err instanceof TimeoutSignal) {
      timedOut = true
      if (bestPartial.length > 0) {
        return { solution: { entries: bestPartial }, backtracks, timedOut }
      }
      return { solution: null, backtracks, timedOut }
    }
    throw err
  }

  if (bestPartial.length > 0) {
    return { solution: { entries: bestPartial }, backtracks, timedOut }
  }
  return { solution: null, backtracks, timedOut }
}

export const __cspInternals = { extractTeacherLimits, isPositionBlocked }
