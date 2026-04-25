import { applyHardConstraints, buildVariables, solve } from './csp-solver'
import { loadEngineInput } from './data-loader'
import { optimize, scoreSolution } from './optimizer'
import type { EngineInput, EngineResult } from './types'
import { validateEngineInput } from './validator'

const SOLVE_TIMEOUT_MS = 25000

export interface GenerateScheduleOptions {
  name: string
  baselineScheduleId?: string
  baselineWeight?: number
}

export async function generateSchedule(
  tenantId: string,
  options: GenerateScheduleOptions
): Promise<EngineResult> {
  const startedAt = Date.now()

  // 1. Load input
  let input: EngineInput
  try {
    input = await loadEngineInput(
      tenantId,
      options.baselineScheduleId,
      options.baselineWeight ?? 0.5
    )
  } catch (err) {
    return {
      status: 'INFEASIBLE',
      score: 0,
      violations: [],
      stats: {
        totalLessons: 0,
        allocatedLessons: 0,
        durationMs: Date.now() - startedAt,
        backtracks: 0,
        optimizationIterations: 0,
      },
      validationErrors: [(err as Error).message],
    }
  }

  // 2. Validate
  const { valid, errors } = validateEngineInput(input)
  const totalLessons = input.classGroups.reduce(
    (sum, cg) => sum + cg.assignments.reduce((s, a) => s + a.weeklyLessons, 0),
    0
  )

  if (!valid) {
    return {
      status: 'INFEASIBLE',
      score: 0,
      violations: [],
      stats: {
        totalLessons,
        allocatedLessons: 0,
        durationMs: Date.now() - startedAt,
        backtracks: 0,
        optimizationIterations: 0,
      },
      validationErrors: errors,
    }
  }

  // 3. Build CSP variables + apply hard constraints
  const variables = applyHardConstraints(buildVariables(input), input)

  // Quick infeasibility check: any variable with empty domain
  if (variables.some((v) => v.domain.length === 0)) {
    return {
      status: 'INFEASIBLE',
      score: 0,
      violations: [],
      stats: {
        totalLessons,
        allocatedLessons: 0,
        durationMs: Date.now() - startedAt,
        backtracks: 0,
        optimizationIterations: 0,
      },
      validationErrors: [
        'Algumas aulas não possuem horário disponível após aplicar restrições obrigatórias.',
      ],
    }
  }

  // 4. Solve (CSP backtracking)
  const { solution: initialSolution, backtracks } = solve(input, SOLVE_TIMEOUT_MS)

  if (!initialSolution || initialSolution.entries.length === 0) {
    return {
      status: 'INFEASIBLE',
      score: 0,
      violations: [],
      stats: {
        totalLessons,
        allocatedLessons: 0,
        durationMs: Date.now() - startedAt,
        backtracks,
        optimizationIterations: 0,
      },
      validationErrors: [
        'Não foi possível encontrar uma alocação que satisfaça todas as restrições obrigatórias.',
      ],
    }
  }

  const allocatedFromCsp = initialSolution.entries.length
  const isPartial = allocatedFromCsp < totalLessons

  // 5. Optimize (skip if partial — optimization assumes full solution)
  const optimizationIterations = isPartial ? 0 : 500 * (3 + 1)
  const optimized = isPartial ? initialSolution : optimize(initialSolution, input)

  // 6. Score
  const { score, violations } = scoreSolution(optimized, input)

  // 7. Baseline similarity
  let baselineSimilarity: number | undefined
  if (input.baseline && input.baseline.entries.length > 0) {
    const baselineKeys = new Set(
      input.baseline.entries.map((e) => `${e.assignmentId}:${e.day}:${e.slotId}`)
    )
    const matches = optimized.entries.filter((e) =>
      baselineKeys.has(`${e.assignmentId}:${e.day}:${e.slotId}`)
    ).length
    baselineSimilarity = matches / input.baseline.entries.length
  }

  return {
    status: isPartial ? 'PARTIAL' : 'SUCCESS',
    solution: { ...optimized, score, violations },
    score,
    violations,
    baselineSimilarity,
    stats: {
      totalLessons,
      allocatedLessons: optimized.entries.length,
      durationMs: Date.now() - startedAt,
      backtracks,
      optimizationIterations,
    },
  }
}

export type { EngineInput, EngineResult, ScheduleSolution } from './types'
