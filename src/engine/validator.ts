import type { EngineInput } from './types'

const TEACHER_OVERLOAD_THRESHOLD = 30

export function validateEngineInput(input: EngineInput): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (input.classGroups.length === 0) {
    errors.push('Nenhuma turma cadastrada.')
  }

  for (const cg of input.classGroups) {
    if (!cg.timeGrid) {
      errors.push(`Turma "${cg.name}" não possui grade horária vinculada.`)
      continue
    }

    if (cg.assignments.length === 0) {
      errors.push(`Turma "${cg.name}" não possui disciplinas cadastradas.`)
    }

    const lessonSlotCount = Object.values(cg.timeGrid.slotsByDay)
      .flat()
      .filter((s) => s.type === 'LESSON').length

    if (lessonSlotCount === 0) {
      errors.push(`Grade da turma "${cg.name}" não possui slots de aula (LESSON).`)
    }
  }

  // Check assignments completeness — each class_subject must have a teacher
  for (const cg of input.classGroups) {
    for (const a of cg.assignments) {
      if (!a.teacherId) {
        errors.push(
          `Disciplina "${a.subjectName}" da turma "${cg.name}" não tem professor atribuído.`
        )
      }
    }
  }

  // Warnings
  if (!input.baseline) {
    warnings.push('Nenhum horário base definido — geração será feita do zero.')
  }

  for (const t of input.teachers) {
    const totalLessons = t.assignments.reduce((sum, a) => sum + a.weeklyLessons, 0)
    if (totalLessons > TEACHER_OVERLOAD_THRESHOLD) {
      warnings.push(
        `Professor ${t.name} possui ${totalLessons} aulas semanais — pode ser difícil alocar.`
      )
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
