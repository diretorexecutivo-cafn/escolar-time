export const ROLES = ['ADMIN', 'COORDINATOR', 'VIEWER'] as const

export type RoleKey = (typeof ROLES)[number]

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: 'Administrador',
  COORDINATOR: 'Coordenador',
  VIEWER: 'Visualizador',
}

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  ADMIN: 'Acessa tudo, gerencia usuários e consulta o histórico.',
  COORDINATOR: 'Monta cadastros, grades e horários.',
  VIEWER: 'Só consulta: não cria, edita nem exclui nada.',
}

/** Papéis que podem criar, editar e excluir dados. VIEWER só consulta. */
export function canEdit(role: RoleKey | null | undefined): boolean {
  return role === 'ADMIN' || role === 'COORDINATOR'
}

/** Papel de quem entra pela primeira vez com uma conta Google da escola. */
export const DEFAULT_ROLE: RoleKey = 'VIEWER'
