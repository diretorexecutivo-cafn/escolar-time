import type {
  ConstraintViolation,
  EngineConstraint,
  EngineInput,
  ScheduleSolution,
  SolutionEntry,
} from './types'

// ─── Tunable weights (per spec) ───────────────────────────────────────────────

const W = {
  PREFER_SINGLE_UNIT_DAY: 2.0,
  MIN_GAP_BETWEEN_UNITS: 1.5,
  NO_IDLE_GAPS: 1.0,
  AVOID_DAY: 1.0,
  SPREAD_SUBJECT: 1.0,
  BALANCE_DAILY_LOAD: 0.8,
  FIXED_DAY: 3.0,
}

const NEIGHBOR_MAX_ATTEMPTS = 20
const DEFAULT_ITERATIONS = 500
const DEFAULT_RESTARTS = 3

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(n: number): number {
  return Math.floor(Math.random() * n)
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function key(day: number, slotOrder: number): string {
  return `${day}:${slotOrder}`
}

function ruleWeight(input: EngineInput, type: string, fallback: number): number {
  const r = input.globalRules.find((g) => g.type === type && g.priority === 'PREFERRED')
  return r ? r.weight * fallback : fallback
}

function gridSlotIndex(input: EngineInput, classGroupId: string) {
  const cg = input.classGroups.find((c) => c.id === classGroupId)
  return cg?.timeGrid?.slotsByDay ?? null
}

function getSlotMeta(
  input: EngineInput,
  classGroupId: string,
  day: number,
  slotOrder: number
) {
  const slotsByDay = gridSlotIndex(input, classGroupId)
  if (!slotsByDay) return null
  return slotsByDay[day]?.find((s) => s.order === slotOrder) ?? null
}

function entriesByTeacher(entries: SolutionEntry[]): Map<string, SolutionEntry[]> {
  const map = new Map<string, SolutionEntry[]>()
  for (const e of entries) {
    let arr = map.get(e.teacherId)
    if (!arr) {
      arr = []
      map.set(e.teacherId, arr)
    }
    arr.push(e)
  }
  return map
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreSolution(
  solution: ScheduleSolution,
  input: EngineInput
): { score: number; violations: ConstraintViolation[] } {
  const entries = solution.entries
  const violations: ConstraintViolation[] = []
  let totalPenalty = 0

  const teachersIdx = new Map(input.teachers.map((t) => [t.id, t]))
  const byTeacher = entriesByTeacher(entries)

  // Helper to add violation + accumulate weighted penalty
  function add(
    type: string,
    description: string,
    teacherId: string | undefined,
    severity: number,
    weight: number,
    priority: 'MANDATORY' | 'PREFERRED' = 'PREFERRED'
  ) {
    violations.push({ type, description, affectedTeacherId: teacherId, severity, priority })
    totalPenalty += severity * weight
  }

  // ── PREFER_SINGLE_UNIT_DAY ──
  const wSingleUnit = ruleWeight(input, 'SINGLE_UNIT_PER_DAY', W.PREFER_SINGLE_UNIT_DAY)
  for (const [teacherId, list] of byTeacher) {
    const byDay = new Map<number, Set<string>>()
    for (const e of list) {
      let s = byDay.get(e.day)
      if (!s) {
        s = new Set()
        byDay.set(e.day, s)
      }
      s.add(e.schoolUnitId)
    }
    for (const [day, units] of byDay) {
      if (units.size > 1) {
        const teacherName = teachersIdx.get(teacherId)?.name ?? teacherId
        add(
          'PREFER_SINGLE_UNIT_DAY',
          `${teacherName} leciona em ${units.size} unidades no dia ${day}.`,
          teacherId,
          units.size - 1,
          wSingleUnit
        )
      }
    }
  }

  // ── MIN_GAP_BETWEEN_UNITS ──
  const wGap = ruleWeight(input, 'MIN_GAP_CROSS_UNIT', W.MIN_GAP_BETWEEN_UNITS)
  const minGapDefault = (() => {
    const r = input.globalRules.find((g) => g.type === 'MIN_GAP_CROSS_UNIT')
    return (r?.params?.min_gap_slots as number | undefined) ?? 1
  })()

  for (const [teacherId, list] of byTeacher) {
    const teacher = teachersIdx.get(teacherId)
    const byDay = new Map<number, SolutionEntry[]>()
    for (const e of list) {
      let arr = byDay.get(e.day)
      if (!arr) {
        arr = []
        byDay.set(e.day, arr)
      }
      arr.push(e)
    }
    for (const [day, dayEntries] of byDay) {
      const sorted = [...dayEntries].sort((a, b) => a.slotOrder - b.slotOrder)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const cur = sorted[i]!
        if (prev.schoolUnitId === cur.schoolUnitId) continue

        const teacherCons = teacher?.constraints.find(
          (c) => c.type === 'MIN_GAP_BETWEEN_UNITS' && c.priority === 'PREFERRED'
        )
        const required = teacherCons?.minGapSlots ?? minGapDefault
        const gap = cur.slotOrder - prev.slotOrder - 1
        if (gap < required) {
          add(
            'MIN_GAP_BETWEEN_UNITS',
            `${teacher?.name ?? teacherId} tem gap insuficiente entre unidades no dia ${day}.`,
            teacherId,
            required - gap,
            wGap
          )
        }
      }
    }
  }

  // ── NO_IDLE_GAPS ──
  for (const [teacherId, list] of byTeacher) {
    const teacher = teachersIdx.get(teacherId)
    const cons = teacher?.constraints.find(
      (c) => c.type === 'NO_IDLE_GAPS' && c.priority === 'PREFERRED'
    )
    if (!cons) continue
    const byDay = new Map<number, number[]>()
    for (const e of list) {
      let arr = byDay.get(e.day)
      if (!arr) {
        arr = []
        byDay.set(e.day, arr)
      }
      arr.push(e.slotOrder)
    }
    for (const [day, orders] of byDay) {
      orders.sort((a, b) => a - b)
      let gaps = 0
      for (let i = 1; i < orders.length; i++) {
        const diff = orders[i]! - orders[i - 1]! - 1
        if (diff > 0) gaps += diff
      }
      if (gaps > 0) {
        add(
          'NO_IDLE_GAPS',
          `${teacher?.name ?? teacherId} possui ${gaps} janela(s) livre(s) no dia ${day}.`,
          teacherId,
          gaps,
          W.NO_IDLE_GAPS
        )
      }
    }
  }

  // ── AVOID_DAY ──
  for (const teacher of input.teachers) {
    const avoid = teacher.constraints.filter(
      (c) => c.type === 'AVOID_DAY' && c.priority === 'PREFERRED'
    )
    if (avoid.length === 0) continue
    const teacherEntries = byTeacher.get(teacher.id) ?? []
    for (const c of avoid) {
      const days = c.daysOfWeek
      if (days.length === 0) continue
      const hits = teacherEntries.filter((e) => days.includes(e.day)).length
      if (hits > 0) {
        add(
          'AVOID_DAY',
          `${teacher.name} leciona ${hits} aula(s) em dia evitado.`,
          teacher.id,
          hits,
          W.AVOID_DAY
        )
      }
    }
  }

  // ── FIXED_DAY ──
  // "Professor deve lecionar neste dia": não é restrição de domínio (não proíbe
  // posições), e sim uma condição sobre o resultado — o professor precisa ter ao
  // menos uma aula em cada dia exigido.
  for (const teacher of input.teachers) {
    const fixed = teacher.constraints.filter((c) => c.type === 'FIXED_DAY')
    if (fixed.length === 0) continue
    const daysWithLessons = new Set((byTeacher.get(teacher.id) ?? []).map((e) => e.day))
    for (const c of fixed) {
      for (const day of c.daysOfWeek) {
        if (!daysWithLessons.has(day)) {
          add(
            'FIXED_DAY',
            `${teacher.name} deveria lecionar no dia ${day}, mas não recebeu nenhuma aula nesse dia.`,
            teacher.id,
            1,
            W.FIXED_DAY * c.weight,
            c.priority
          )
        }
      }
    }
  }

  // ── SPREAD_SUBJECT ──
  const wSpread = ruleWeight(input, 'SPREAD_SUBJECT', W.SPREAD_SUBJECT)
  const hasSpreadRule = input.globalRules.some(
    (g) => g.type === 'SPREAD_SUBJECT' && g.priority === 'PREFERRED'
  )
  if (hasSpreadRule) {
    const bySubjectClass = new Map<string, Map<string, Set<number>>>()
    for (const e of entries) {
      const a = findAssignment(input, e.assignmentId)
      if (!a) continue
      let cgMap = bySubjectClass.get(a.subjectId)
      if (!cgMap) {
        cgMap = new Map()
        bySubjectClass.set(a.subjectId, cgMap)
      }
      let days = cgMap.get(e.classGroupId)
      if (!days) {
        days = new Set()
        cgMap.set(e.classGroupId, days)
      }
      days.add(e.day)
    }
    for (const [, cgMap] of bySubjectClass) {
      for (const [classGroupId, days] of cgMap) {
        const sorted = [...days].sort((a, b) => a - b)
        let consecutive = 0
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i]! - sorted[i - 1]! === 1) consecutive++
        }
        if (consecutive > 0) {
          add(
            'SPREAD_SUBJECT',
            `Disciplina concentrada em dias consecutivos na turma ${classGroupId}.`,
            undefined,
            consecutive,
            wSpread
          )
        }
      }
    }
  }

  // ── BALANCE_DAILY_LOAD ──
  const wBalance = ruleWeight(input, 'BALANCE_DAILY_LOAD', W.BALANCE_DAILY_LOAD)
  const hasBalanceRule = input.globalRules.some(
    (g) => g.type === 'BALANCE_DAILY_LOAD' && g.priority === 'PREFERRED'
  )
  if (hasBalanceRule) {
    for (const [teacherId, list] of byTeacher) {
      const teacher = teachersIdx.get(teacherId)
      const counts = new Map<number, number>()
      for (const e of list) counts.set(e.day, (counts.get(e.day) ?? 0) + 1)
      const values = Array.from(counts.values())
      if (values.length < 2) continue
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance =
        values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
      const std = Math.sqrt(variance)
      if (std > 1) {
        add(
          'BALANCE_DAILY_LOAD',
          `${teacher?.name ?? teacherId} possui carga diária desbalanceada (σ=${std.toFixed(1)}).`,
          teacherId,
          std,
          wBalance
        )
      }
    }
  }

  // ── Baseline proximity reward ──
  let baselineMatches = 0
  if (input.baseline) {
    const baselineKeys = new Set(
      input.baseline.entries.map((e) => `${e.assignmentId}:${e.day}:${e.slotId}`)
    )
    for (const e of entries) {
      if (baselineKeys.has(`${e.assignmentId}:${e.day}:${e.slotId}`)) baselineMatches++
    }
    // Reward: subtract from penalty proportionally
    const reward = baselineMatches * input.baselineWeight
    totalPenalty = Math.max(0, totalPenalty - reward)
  }

  // ── Final score ──
  const maxPossiblePenalty = Math.max(1, entries.length * 5)
  const rawScore = 100 * (1 - totalPenalty / maxPossiblePenalty)
  const score = Math.max(0, Math.min(100, rawScore))

  return { score, violations }
}

function findAssignment(input: EngineInput, assignmentId: string) {
  for (const cg of input.classGroups) {
    const a = cg.assignments.find((x) => x.id === assignmentId)
    if (a) return a
  }
  return null
}

// ─── Neighbor generation ──────────────────────────────────────────────────────

type Indices = {
  teacherSlots: Map<string, Set<string>>
  classSlots: Map<string, Set<string>>
}

function buildIndices(entries: SolutionEntry[]): Indices {
  const teacherSlots = new Map<string, Set<string>>()
  const classSlots = new Map<string, Set<string>>()
  for (const e of entries) {
    const k = key(e.day, e.slotOrder)
    if (!teacherSlots.has(e.teacherId)) teacherSlots.set(e.teacherId, new Set())
    teacherSlots.get(e.teacherId)!.add(k)
    if (!classSlots.has(e.classGroupId)) classSlots.set(e.classGroupId, new Set())
    classSlots.get(e.classGroupId)!.add(k)
  }
  return { teacherSlots, classSlots }
}

function trySwap(
  entries: SolutionEntry[],
  input: EngineInput
): SolutionEntry[] | null {
  // Pick two random entries from same class
  const byClass = new Map<string, number[]>()
  entries.forEach((e, i) => {
    if (!byClass.has(e.classGroupId)) byClass.set(e.classGroupId, [])
    byClass.get(e.classGroupId)!.push(i)
  })
  const eligible = [...byClass.values()].filter((idxs) => idxs.length >= 2)
  if (eligible.length === 0) return null

  const pool = eligible[rand(eligible.length)]!
  if (pool.length < 2) return null
  const i1 = pool[rand(pool.length)]!
  let i2 = pool[rand(pool.length)]!
  let attempts = 0
  while (i2 === i1 && attempts < 5) {
    i2 = pool[rand(pool.length)]!
    attempts++
  }
  if (i1 === i2) return null

  const e1 = entries[i1]!
  const e2 = entries[i2]!
  if (e1.day === e2.day && e1.slotOrder === e2.slotOrder) return null

  const next = entries.slice()
  next[i1] = { ...e1, day: e2.day, slotId: e2.slotId, slotOrder: e2.slotOrder }
  next[i2] = { ...e2, day: e1.day, slotId: e1.slotId, slotOrder: e1.slotOrder }

  if (!validateHard(next, input, [i1, i2])) return null
  return next
}

function tryMove(
  entries: SolutionEntry[],
  input: EngineInput
): SolutionEntry[] | null {
  if (entries.length === 0) return null
  const idx = rand(entries.length)
  const e = entries[idx]!
  const slotsByDay = gridSlotIndex(input, e.classGroupId)
  if (!slotsByDay) return null

  // Pool of all (day, slot) lesson positions in class grid
  const positions: { day: number; slotId: string; slotOrder: number }[] = []
  for (const [dayStr, slots] of Object.entries(slotsByDay)) {
    const day = Number(dayStr)
    for (const s of slots) {
      if (s.type !== 'LESSON') continue
      positions.push({ day, slotId: s.id, slotOrder: s.order })
    }
  }
  if (positions.length === 0) return null

  const target = positions[rand(positions.length)]!
  if (target.day === e.day && target.slotOrder === e.slotOrder) return null

  const next = entries.slice()
  next[idx] = {
    ...e,
    day: target.day,
    slotId: target.slotId,
    slotOrder: target.slotOrder,
  }

  if (!validateHard(next, input, [idx])) return null
  return next
}

function validateHard(
  entries: SolutionEntry[],
  input: EngineInput,
  changed: number[]
): boolean {
  const idx = buildIndices(entries)
  // Re-derive: detect collisions at changed positions
  const seenTeacher = new Map<string, Set<string>>()
  const seenClass = new Map<string, Set<string>>()
  for (const e of entries) {
    const k = key(e.day, e.slotOrder)
    if (!seenTeacher.has(e.teacherId)) seenTeacher.set(e.teacherId, new Set())
    const ts = seenTeacher.get(e.teacherId)!
    if (ts.has(k)) return false
    ts.add(k)
    if (!seenClass.has(e.classGroupId)) seenClass.set(e.classGroupId, new Set())
    const cs = seenClass.get(e.classGroupId)!
    if (cs.has(k)) return false
    cs.add(k)
  }

  // Check MAX_LESSONS_PER_DAY and MAX_CONSECUTIVE for teachers with such MANDATORY constraints
  const limits = new Map<string, { maxDay?: number; maxConsec?: number }>()
  for (const t of input.teachers) {
    const l: { maxDay?: number; maxConsec?: number } = {}
    for (const c of t.constraints) {
      if (c.priority !== 'MANDATORY') continue
      const count = (c.value as { count?: number } | undefined)?.count
      if (c.type === 'MAX_LESSONS_PER_DAY' && typeof count === 'number') {
        l.maxDay = Math.min(l.maxDay ?? Infinity, count)
      } else if (c.type === 'MAX_CONSECUTIVE' && typeof count === 'number') {
        l.maxConsec = Math.min(l.maxConsec ?? Infinity, count)
      }
    }
    if (Object.keys(l).length > 0) limits.set(t.id, l)
  }

  if (limits.size > 0) {
    const teacherDay = new Map<string, Map<number, number[]>>()
    for (const e of entries) {
      let m = teacherDay.get(e.teacherId)
      if (!m) {
        m = new Map()
        teacherDay.set(e.teacherId, m)
      }
      let arr = m.get(e.day)
      if (!arr) {
        arr = []
        m.set(e.day, arr)
      }
      arr.push(e.slotOrder)
    }
    for (const [teacherId, l] of limits) {
      const dayMap = teacherDay.get(teacherId)
      if (!dayMap) continue
      for (const [, orders] of dayMap) {
        if (l.maxDay !== undefined && orders.length > l.maxDay) return false
        if (l.maxConsec !== undefined) {
          const sorted = [...orders].sort((a, b) => a - b)
          let run = 1
          for (let i = 1; i < sorted.length; i++) {
            run = sorted[i]! - sorted[i - 1]! === 1 ? run + 1 : 1
            if (run > l.maxConsec) return false
          }
        }
      }
    }
  }

  // changed/idx kept for potential targeted checks; void use suppresses unused warnings
  void changed
  void idx
  return true
}

export function generateNeighbor(
  solution: ScheduleSolution,
  input: EngineInput
): ScheduleSolution {
  for (let i = 0; i < NEIGHBOR_MAX_ATTEMPTS; i++) {
    const useSwap = Math.random() < 0.5
    const next = useSwap ? trySwap(solution.entries, input) : tryMove(solution.entries, input)
    if (next) return { entries: next }
  }
  return solution
}

// ─── Optimization (hill climbing with restarts) ───────────────────────────────

function perturb(
  solution: ScheduleSolution,
  input: EngineInput,
  kicks: number
): ScheduleSolution {
  let cur = solution
  for (let i = 0; i < kicks; i++) {
    cur = generateNeighbor(cur, input)
  }
  return cur
}

export function optimize(
  initial: ScheduleSolution,
  input: EngineInput,
  options?: { iterations?: number; restarts?: number }
): ScheduleSolution {
  const iterations = options?.iterations ?? DEFAULT_ITERATIONS
  const restarts = options?.restarts ?? DEFAULT_RESTARTS

  let best = initial
  let bestScore = scoreSolution(initial, input).score
  let current = initial
  let currentScore = bestScore

  for (let r = 0; r <= restarts; r++) {
    if (r > 0) {
      current = perturb(best, input, randInt(5, 10))
      currentScore = scoreSolution(current, input).score
    }
    for (let i = 0; i < iterations; i++) {
      const neighbor = generateNeighbor(current, input)
      const ns = scoreSolution(neighbor, input).score
      if (ns > currentScore) {
        current = neighbor
        currentScore = ns
      }
      if (ns > bestScore) {
        best = neighbor
        bestScore = ns
      }
    }
  }

  return { ...best, score: bestScore }
}
