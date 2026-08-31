import type {
  EngineConstraint,
  EngineInput,
  LessonVariable,
  ScheduleSolution,
  SlotPosition,
  SolutionEntry,
} from './types'

const DEFAULT_TIMEOUT_MS = 25000

// ─── Variable construction ────────────────────────────────────────────────────

export function buildVariables(input: EngineInput): LessonVariable[] {
  const variables: LessonVariable[] = []

  for (const cg of input.classGroups) {
    if (!cg.timeGrid) continue

    const lessonPositions: SlotPosition[] = []
    for (const [dayStr, slots] of Object.entries(cg.timeGrid.slotsByDay)) {
      const day = Number(dayStr)
      for (const s of slots) {
        if (s.type !== 'LESSON') continue
        lessonPositions.push({
          day,
          slotId: s.id,
          slotOrder: s.order,
          startTime: s.startTime,
          endTime: s.endTime,
        })
      }
    }

    for (const a of cg.assignments) {
      for (let i = 0; i < a.weeklyLessons; i++) {
        variables.push({
          id: `${a.id}#${i}`,
          assignmentId: a.id,
          teacherId: a.teacherId,
          classGroupId: a.classGroupId,
          schoolUnitId: a.schoolUnitId,
          subjectId: a.subjectId,
          domain: lessonPositions.slice(),
        })
      }
    }
  }

  return variables
}

// ─── Hard-constraint domain pruning ───────────────────────────────────────────

function dayMatches(c: EngineConstraint, day: number): boolean {
  return c.daysOfWeek.length === 0 || c.daysOfWeek.includes(day)
}

function isPositionBlocked(pos: SlotPosition, c: EngineConstraint): boolean {
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
    const constraints = teacherConstraints.get(v.teacherId) ?? []
    if (constraints.length === 0) return v

    const filtered = v.domain.filter((pos) => {
      for (const c of constraints) {
        if (c.subjectId && c.subjectId !== v.subjectId) continue
        if (c.schoolUnitId && c.schoolUnitId !== v.schoolUnitId) continue
        if (isPositionBlocked(pos, c)) return false
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

  const teacherSlot = new Map<string, Set<string>>() // teacherId -> "day:order"
  const classSlot = new Map<string, Set<string>>() // classGroupId -> "day:order"
  const teacherDayCount = new Map<string, Map<number, number>>() // teacher -> day -> count
  const teacherDayOrders = new Map<string, Map<number, Set<number>>>() // teacher -> day -> orders

  function ensureSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    let s = map.get(key)
    if (!s) {
      s = new Set<V>()
      map.set(key, s)
    }
    return s
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

  function isValid(v: LessonVariable, pos: SlotPosition): boolean {
    const key = makeKey(pos.day, pos.slotOrder)
    if (teacherSlot.get(v.teacherId)?.has(key)) return false
    if (classSlot.get(v.classGroupId)?.has(key)) return false

    const lim = limits.get(v.teacherId)
    if (lim?.maxLessonsPerDay !== undefined) {
      const count = teacherDayCount.get(v.teacherId)?.get(pos.day) ?? 0
      if (count + 1 > lim.maxLessonsPerDay) return false
    }
    if (lim?.maxConsecutive !== undefined) {
      const len = consecutiveLengthIfPlaced(v.teacherId, pos.day, pos.slotOrder)
      if (len > lim.maxConsecutive) return false
    }
    return true
  }

  function place(v: LessonVariable, pos: SlotPosition): SolutionEntry {
    const key = makeKey(pos.day, pos.slotOrder)
    ensureSet(teacherSlot, v.teacherId).add(key)
    ensureSet(classSlot, v.classGroupId).add(key)
    const dayMap = teacherDayCount.get(v.teacherId) ?? new Map<number, number>()
    teacherDayCount.set(v.teacherId, dayMap)
    dayMap.set(pos.day, (dayMap.get(pos.day) ?? 0) + 1)
    ensureDayMap(teacherDayOrders, v.teacherId, () => new Set<number>(), pos.day).add(
      pos.slotOrder
    )

    return {
      lessonVariableId: v.id,
      assignmentId: v.assignmentId,
      teacherId: v.teacherId,
      classGroupId: v.classGroupId,
      schoolUnitId: v.schoolUnitId,
      day: pos.day,
      slotId: pos.slotId,
      slotOrder: pos.slotOrder,
    }
  }

  function unplace(v: LessonVariable, pos: SlotPosition): void {
    const key = makeKey(pos.day, pos.slotOrder)
    teacherSlot.get(v.teacherId)?.delete(key)
    classSlot.get(v.classGroupId)?.delete(key)
    const dayMap = teacherDayCount.get(v.teacherId)
    if (dayMap) {
      const c = (dayMap.get(pos.day) ?? 1) - 1
      if (c <= 0) dayMap.delete(pos.day)
      else dayMap.set(pos.day, c)
    }
    teacherDayOrders.get(v.teacherId)?.get(pos.day)?.delete(pos.slotOrder)
  }

  function orderDomain(v: LessonVariable): SlotPosition[] {
    const baseline = baselineByAssignment.get(v.assignmentId)
    if (!baseline || baseline.size === 0) return v.domain
    return [...v.domain].sort((a, b) => {
      const ka = `${a.day}:${a.slotId}`
      const kb = `${b.day}:${b.slotId}`
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
      const entry = place(v, pos)
      solution.push(entry)
      if (solution.length > bestPartial.length) bestPartial = [...solution]
      if (backtrack(idx + 1)) return true
      solution.pop()
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
