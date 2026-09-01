import type { EngineAssignment, EngineInput } from './types'

const TEACHER_OVERLOAD_THRESHOLD = 30

function lessonSlotCount(cg: EngineInput['classGroups'][number]): number {
  if (!cg.timeGrid) return 0
  return Object.values(cg.timeGrid.slotsByDay)
    .flat()
    .filter((s) => s.type === 'LESSON').length
}

// Aulas agrupadas (mesmo group_key) ocorrem simultaneamente — contam como 1 slot de demanda
// (não 1 por class_subjects), tanto para a turma quanto para o professor.
function groupedDemand(assignments: EngineAssignment[]): number {
  let sum = 0
  const seenGroups = new Map<string, number>() // groupKey -> weeklyLessons (1ª ocorrência)
  for (const a of assignments) {
    if (!a.groupKey) {
      sum += a.weeklyLessons
      continue
    }
    if (!seenGroups.has(a.groupKey)) {
      seenGroups.set(a.groupKey, a.weeklyLessons)
      sum += a.weeklyLessons
    }
  }
  return sum
}

export function validateEngineInput(input: EngineInput): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (input.classGroups.length === 0) {
    return { valid: false, errors: ['Nenhuma turma cadastrada.'], warnings }
  }

  // Turmas sem disciplinas ainda não estão prontas — avisamos, mas não bloqueamos
  // a geração das demais.
  const schedulable = input.classGroups.filter((cg) => cg.assignments.length > 0)
  for (const cg of input.classGroups) {
    if (cg.assignments.length === 0) {
      warnings.push(`Turma "${cg.name}" não possui disciplinas cadastradas — será ignorada.`)
    }
  }

  if (schedulable.length === 0) {
    errors.push(
      'Nenhuma turma possui disciplinas com professor atribuído. Cadastre as disciplinas e as atribuições antes de gerar.'
    )
    return { valid: false, errors, warnings }
  }

  for (const cg of schedulable) {
    if (!cg.timeGrid) {
      errors.push(`Turma "${cg.name}" não possui grade horária vinculada.`)
      continue
    }

    const slots = lessonSlotCount(cg)
    if (slots === 0) {
      errors.push(`Grade da turma "${cg.name}" não possui slots de aula (LESSON).`)
      continue
    }

    // Capacidade: não adianta procurar solução se não há slots suficientes.
    const demand = groupedDemand(cg.assignments)
    if (demand > slots) {
      errors.push(
        `Turma "${cg.name}": são ${demand} aulas semanais para apenas ${slots} slots de aula na grade. ` +
          `Reduza ${demand - slots} aula(s) semanal(is) ou acrescente slots à grade.`
      )
    } else if (demand < slots) {
      warnings.push(
        `Turma "${cg.name}": ${slots - demand} slot(s) de aula ficarão vazios (${demand} aulas para ${slots} slots).`
      )
    }

    for (const a of cg.assignments) {
      if (!a.teacherId) {
        errors.push(
          `Disciplina "${a.subjectName}" da turma "${cg.name}" não tem professor atribuído.`
        )
      }
      if (a.weeklyLessons <= 0) {
        warnings.push(
          `Disciplina "${a.subjectName}" da turma "${cg.name}" está com 0 aulas semanais.`
        )
      }
    }
  }

  // Carga por professor: um professor não pode dar mais aulas do que existem
  // posições na semana das turmas em que leciona.
  const slotsByClass = new Map(schedulable.map((cg) => [cg.id, lessonSlotCount(cg)]))
  for (const t of input.teachers) {
    const relevant = t.assignments.filter((a) => slotsByClass.has(a.classGroupId))
    const total = groupedDemand(relevant)
    if (total === 0) continue

    const reachable = Math.max(
      ...relevant.map((a) => slotsByClass.get(a.classGroupId) ?? 0)
    )
    if (total > reachable) {
      errors.push(
        `Professor ${t.name} tem ${total} aulas semanais, mas as turmas dele oferecem no máximo ${reachable} posições por semana.`
      )
    } else if (total > TEACHER_OVERLOAD_THRESHOLD) {
      warnings.push(
        `Professor ${t.name} possui ${total} aulas semanais — pode ser difícil alocar.`
      )
    }
  }

  if (!input.baseline) {
    warnings.push('Nenhum horário base definido — geração será feita do zero.')
  }

  return { valid: errors.length === 0, errors, warnings }
}
