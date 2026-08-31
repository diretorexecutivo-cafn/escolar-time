// ─── Engine domain types ──────────────────────────────────────────────────────

export type Priority = 'MANDATORY' | 'PREFERRED'
export type SlotType = 'LESSON' | 'BREAK'

export interface EngineConstraint {
  id: string
  type: string
  priority: Priority
  weight: number
  daysOfWeek: number[]
  schoolUnitId?: string
  subjectId?: string
  timeFrom?: string
  timeTo?: string
  slotOrder?: number
  minGapSlots?: number
  value?: Record<string, unknown>
}

export interface EngineGlobalRule {
  type: string
  priority: Priority
  weight: number
  params: Record<string, unknown>
}

export interface EngineAssignment {
  id: string
  teacherId: string
  classGroupId: string
  classGroupName: string
  schoolUnitId: string
  subjectId: string
  subjectName: string
  weeklyLessons: number
  allowDoubleLesson: boolean
}

export interface EngineTeacher {
  id: string
  name: string
  assignments: EngineAssignment[]
  constraints: EngineConstraint[]
}

export interface EngineTimeSlot {
  id: string
  order: number
  durationMinutes: number
  type: SlotType
  startTime: string
  endTime: string
}

export interface EngineTimeGrid {
  id: string
  classGroupId: string
  startTime: string
  daysOfWeek: number[]
  slotsByDay: Record<number, EngineTimeSlot[]>
}

export interface EngineClassGroup {
  id: string
  name: string
  schoolUnitId: string
  assignments: EngineAssignment[]
  timeGrid?: EngineTimeGrid
}

export interface BaselineSchedule {
  entries: { assignmentId: string; day: number; slotId: string }[]
}

export interface EngineInput {
  tenantId: string
  teachers: EngineTeacher[]
  classGroups: EngineClassGroup[]
  timeGrids: EngineTimeGrid[]
  constraints: EngineConstraint[]
  globalRules: EngineGlobalRule[]
  baseline?: BaselineSchedule
  baselineWeight: number
}

// ─── CSP / search types ───────────────────────────────────────────────────────

export interface SlotPosition {
  day: number
  slotId: string
  slotOrder: number
  startTime: string
  endTime: string
}

export interface LessonVariable {
  id: string
  assignmentId: string
  teacherId: string
  classGroupId: string
  schoolUnitId: string
  subjectId: string
  domain: SlotPosition[]
}

export interface SolutionEntry {
  lessonVariableId: string
  assignmentId: string
  teacherId: string
  classGroupId: string
  schoolUnitId: string
  day: number
  slotId: string
  slotOrder: number
}

export interface ConstraintViolation {
  type: string
  priority: Priority
  description: string
  affectedTeacherId?: string
  severity: number
}

export interface ScheduleSolution {
  entries: SolutionEntry[]
  score?: number
  violations?: ConstraintViolation[]
}

export interface EngineResult {
  status: 'SUCCESS' | 'PARTIAL' | 'INFEASIBLE'
  solution?: ScheduleSolution
  score: number
  violations: ConstraintViolation[]
  baselineSimilarity?: number
  stats: {
    totalLessons: number
    allocatedLessons: number
    durationMs: number
    backtracks: number
    optimizationIterations: number
  }
  validationErrors?: string[]
  warnings?: string[]
}
