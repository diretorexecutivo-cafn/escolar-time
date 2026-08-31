import { adminSupabase } from '@/lib/supabase/admin'
import type {
  BaselineSchedule,
  EngineAssignment,
  EngineClassGroup,
  EngineConstraint,
  EngineGlobalRule,
  EngineInput,
  EngineTeacher,
  EngineTimeGrid,
  EngineTimeSlot,
  Priority,
  SlotType,
} from './types'

// ─── Raw row shapes (relaxed; Supabase types cast at edges) ───────────────────

type RawTeacher = {
  id: string
  name: string
  active: boolean
}

type RawConstraint = {
  id: string
  teacher_id: string
  type: string
  priority: string
  days_of_week: number[] | null
  school_unit_id: string | null
  subject_id: string | null
  time_from: string | null
  time_to: string | null
  slot_order: number | null
  min_gap_slots: number | null
  value: Record<string, unknown> | null
  active: boolean
}

type RawGlobalRule = {
  type: string
  priority: string
  weight: number | null
  params: Record<string, unknown> | null
}

type RawSubject = { id: string; name: string }

type RawTeachingAssignment = {
  id: string
  teacher_id: string | null
}

type RawClassSubject = {
  id: string
  weekly_lessons: number
  allow_double_lesson: boolean
  subjects: RawSubject | RawSubject[] | null
  // PostgREST devolve objeto (não array) porque teaching_assignments.class_subject_id é UNIQUE
  teaching_assignments: RawTeachingAssignment | RawTeachingAssignment[] | null
}

type RawTimeSlot = {
  id: string
  day_of_week: number
  slot_order: number
  duration_minutes: number
  type: string
  start_time: string | null
  end_time: string | null
}

type RawTimeGrid = {
  id: string
  class_group_id: string | null
  start_time: string
  days_of_week: number[]
  active: boolean
  time_slots: RawTimeSlot[] | null
}

type RawClassGroup = {
  id: string
  name: string
  school_unit_id: string
  active: boolean
  class_subjects: RawClassSubject[] | null
  time_grids: RawTimeGrid[] | null
}

type RawBaselineEntry = {
  teaching_assignment_id: string
  day_of_week: number
  time_slot_id: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function addMinutes(time: string, minutes: number): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function buildSlotsByDay(
  raw: RawTimeSlot[],
  gridStart: string
): Record<number, EngineTimeSlot[]> {
  const grouped = new Map<number, RawTimeSlot[]>()
  for (const s of raw) {
    let arr = grouped.get(s.day_of_week)
    if (!arr) {
      arr = []
      grouped.set(s.day_of_week, arr)
    }
    arr.push(s)
  }

  const out: Record<number, EngineTimeSlot[]> = {}
  for (const [day, slots] of grouped) {
    slots.sort((a, b) => a.slot_order - b.slot_order)
    let cursor = gridStart
    out[day] = slots.map((s) => {
      const start = cursor
      const end = addMinutes(cursor, s.duration_minutes)
      cursor = end
      return {
        id: s.id,
        order: s.slot_order,
        durationMinutes: s.duration_minutes,
        type: (s.type === 'BREAK' ? 'BREAK' : 'LESSON') as SlotType,
        startTime: start,
        endTime: end,
      }
    })
  }
  return out
}

function normalizePriority(p: string): Priority {
  return p === 'MANDATORY' ? 'MANDATORY' : 'PREFERRED'
}

function normalizeConstraint(r: RawConstraint): EngineConstraint {
  return {
    id: r.id,
    type: r.type,
    priority: normalizePriority(r.priority),
    weight: typeof r.value?.weight === 'number' ? r.value.weight : 1,
    daysOfWeek: r.days_of_week ?? [],
    schoolUnitId: r.school_unit_id ?? undefined,
    subjectId: r.subject_id ?? undefined,
    timeFrom: r.time_from ?? undefined,
    timeTo: r.time_to ?? undefined,
    slotOrder: r.slot_order ?? undefined,
    minGapSlots: r.min_gap_slots ?? undefined,
    value: r.value ?? undefined,
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loadEngineInput(
  tenantId: string,
  baselineScheduleId?: string,
  baselineWeight: number = 0.5
): Promise<EngineInput> {
  // 1. Class groups + class_subjects (subjects + teaching_assignments) + time_grids + slots
  const { data: classGroupsRaw, error: cgErr } = await adminSupabase
    .from('class_groups')
    .select(
      `
      id, name, school_unit_id, active,
      class_subjects (
        id, weekly_lessons, allow_double_lesson,
        subjects ( id, name ),
        teaching_assignments ( id, teacher_id )
      ),
      time_grids!class_group_id (
        id, class_group_id, start_time, days_of_week, active,
        time_slots ( id, day_of_week, slot_order, duration_minutes, type, start_time, end_time )
      )
    `
    )
    .eq('tenant_id', tenantId)
    .eq('active', true)

  if (cgErr) throw new Error(`Falha ao carregar turmas: ${cgErr.message}`)

  const classGroupsRows = (classGroupsRaw ?? []) as unknown as RawClassGroup[]

  // 2. Teachers + constraints
  const { data: teachersRaw, error: tErr } = await adminSupabase
    .from('teachers')
    .select('id, name, active')
    .eq('tenant_id', tenantId)
    .eq('active', true)

  if (tErr) throw new Error(`Falha ao carregar professores: ${tErr.message}`)

  const teachers = (teachersRaw ?? []) as RawTeacher[]

  const { data: constraintsRaw, error: ctErr } = await adminSupabase
    .from('teacher_constraints')
    .select(
      'id, teacher_id, type, priority, days_of_week, school_unit_id, subject_id, time_from, time_to, slot_order, min_gap_slots, value, active'
    )
    .eq('tenant_id', tenantId)
    .eq('active', true)

  if (ctErr) throw new Error(`Falha ao carregar restrições: ${ctErr.message}`)

  const constraintsRows = (constraintsRaw ?? []) as RawConstraint[]
  const allConstraints = constraintsRows.map(normalizeConstraint)
  const constraintsByTeacher = new Map<string, EngineConstraint[]>()
  for (const row of constraintsRows) {
    const c = normalizeConstraint(row)
    let arr = constraintsByTeacher.get(row.teacher_id)
    if (!arr) {
      arr = []
      constraintsByTeacher.set(row.teacher_id, arr)
    }
    arr.push(c)
  }

  // 3. Global rules
  const { data: rulesRaw, error: rErr } = await adminSupabase
    .from('global_rules')
    .select('type, priority, weight, params')
    .eq('tenant_id', tenantId)
    .eq('active', true)

  if (rErr) throw new Error(`Falha ao carregar regras globais: ${rErr.message}`)

  const globalRules: EngineGlobalRule[] = (rulesRaw ?? []).map((r) => {
    const row = r as unknown as RawGlobalRule
    return {
      type: row.type,
      priority: normalizePriority(row.priority),
      weight: row.weight ?? 1,
      params: row.params ?? {},
    }
  })

  // 4. Build assignments + group by teacher / class
  const assignmentsByTeacher = new Map<string, EngineAssignment[]>()
  const assignmentsByClass = new Map<string, EngineAssignment[]>()
  const allAssignments: EngineAssignment[] = []

  for (const cg of classGroupsRows) {
    for (const cs of cg.class_subjects ?? []) {
      const ta = firstOf(cs.teaching_assignments)
      if (!ta || !ta.teacher_id) continue
      const subj = firstOf(cs.subjects)
      const a: EngineAssignment = {
        id: ta.id,
        teacherId: ta.teacher_id,
        classGroupId: cg.id,
        classGroupName: cg.name,
        schoolUnitId: cg.school_unit_id,
        subjectId: subj?.id ?? '',
        subjectName: subj?.name ?? '',
        weeklyLessons: cs.weekly_lessons,
        allowDoubleLesson: cs.allow_double_lesson,
      }
      allAssignments.push(a)
      let tarr = assignmentsByTeacher.get(a.teacherId)
      if (!tarr) {
        tarr = []
        assignmentsByTeacher.set(a.teacherId, tarr)
      }
      tarr.push(a)
      let carr = assignmentsByClass.get(cg.id)
      if (!carr) {
        carr = []
        assignmentsByClass.set(cg.id, carr)
      }
      carr.push(a)
    }
  }

  // 5. Build time grids per class group (active grid only — pick first active)
  const allTimeGrids: EngineTimeGrid[] = []
  const gridByClass = new Map<string, EngineTimeGrid>()
  for (const cg of classGroupsRows) {
    const grids = (cg.time_grids ?? []).filter((g) => g.active)
    if (grids.length === 0) continue
    const g = grids[0]!
    const tg: EngineTimeGrid = {
      id: g.id,
      classGroupId: cg.id,
      startTime: g.start_time,
      daysOfWeek: g.days_of_week ?? [],
      slotsByDay: buildSlotsByDay(g.time_slots ?? [], g.start_time),
    }
    allTimeGrids.push(tg)
    gridByClass.set(cg.id, tg)
  }

  // 6. Compose engine class groups
  const classGroups: EngineClassGroup[] = classGroupsRows.map((cg) => ({
    id: cg.id,
    name: cg.name,
    schoolUnitId: cg.school_unit_id,
    assignments: assignmentsByClass.get(cg.id) ?? [],
    timeGrid: gridByClass.get(cg.id),
  }))

  // 7. Compose engine teachers
  const engineTeachers: EngineTeacher[] = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    assignments: assignmentsByTeacher.get(t.id) ?? [],
    constraints: constraintsByTeacher.get(t.id) ?? [],
  }))

  // 8. Baseline (best-effort — table may not exist yet)
  let baseline: BaselineSchedule | undefined
  if (baselineScheduleId) {
    try {
      const { data: entries } = await adminSupabase
        .from('schedule_entries')
        .select('teaching_assignment_id, day_of_week, time_slot_id')
        .eq('generated_schedule_id', baselineScheduleId)
      if (entries && entries.length > 0) {
        const rows = entries as unknown as RawBaselineEntry[]
        baseline = {
          entries: rows.map((e) => ({
            assignmentId: e.teaching_assignment_id,
            day: e.day_of_week,
            slotId: e.time_slot_id,
          })),
        }
      }
    } catch {
      // baseline table absent — skip
    }
  }

  return {
    tenantId,
    teachers: engineTeachers,
    classGroups,
    timeGrids: allTimeGrids,
    constraints: allConstraints,
    globalRules,
    baseline,
    baselineWeight,
  }
}
