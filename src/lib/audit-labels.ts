import { ROLE_LABELS, type RoleKey } from '@/lib/auth/roles'

/** Linha de audit_log (migration 008). */
export type AuditEntry = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  record_id: string | null
  record_label: string | null
  changed_fields: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

/** Áreas do sistema (tabelas auditadas), na ordem do menu. */
export const AREA_LABELS: Record<string, string> = {
  school_units: 'Unidade',
  class_groups: 'Turma',
  class_subjects: 'Disciplina da turma',
  subjects: 'Disciplina',
  teachers: 'Professor',
  teaching_assignments: 'Atribuição',
  time_grids: 'Grade horária',
  time_slots: 'Horário da grade',
  teacher_constraints: 'Restrição',
  global_rules: 'Regra global',
  generated_schedules: 'Horário',
  profiles: 'Usuário',
  tenants: 'Instituição',
}

export function areaLabel(table: string): string {
  return AREA_LABELS[table] ?? table
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  code: 'Código',
  address: 'Endereço',
  active: 'Status',
  role: 'Papel',
  email: 'E-mail',
  phone: 'Telefone',
  color: 'Cor',
  shift: 'Turno',
  year: 'Ano',
  slug: 'Identificador',
  homeroom_teacher_id: 'Professora regente',
  school_unit_id: 'Unidade',
  class_group_id: 'Turma',
  subject_id: 'Disciplina',
  teacher_id: 'Professor',
  class_subject_id: 'Disciplina da turma',
  time_grid_id: 'Grade',
  weekly_lessons: 'Aulas semanais',
  allow_double_lesson: 'Permite aula dupla',
  max_double_lessons: 'Máx. aulas duplas',
  group_key: 'Agrupamento',
  max_daily_lessons: 'Máx. aulas por dia',
  max_weekly_lessons: 'Máx. aulas por semana',
  notes: 'Observações',
  days_of_week: 'Dias da semana',
  day_of_week: 'Dia',
  start_time: 'Início',
  end_time: 'Fim',
  slot_order: 'Ordem',
  duration_minutes: 'Duração (min)',
  type: 'Tipo',
  label: 'Rótulo',
  vigencia: 'Vigência',
  priority: 'Prioridade',
  time_from: 'De',
  time_to: 'Até',
  min_gap_slots: 'Intervalo mínimo',
  value: 'Valor',
  description: 'Descrição',
  weight: 'Peso',
  params: 'Parâmetros',
  status: 'Situação',
  score: 'Pontuação',
  is_baseline: 'Horário base',
  baseline_weight: 'Peso da base',
  deleted_at: 'Apagado em',
  deleted_reason: 'Motivo',
  replaced_by: 'Substituído por',
  config_snapshot: 'Configuração',
  violations: 'Violações',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/** Campos técnicos que não aparecem nos detalhes. */
const HIDDEN_FIELDS = new Set([
  'id',
  'tenant_id',
  'created_at',
  'updated_at',
  'created_by',
  'deleted_by',
  'generated_schedule_id',
])

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
  7: 'Domingo',
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  shift: { MORNING: 'Matutino', AFTERNOON: 'Vespertino', EVENING: 'Noturno' },
  status: { COMPLETED: 'Concluído', FAILED: 'Falhou', RUNNING: 'Gerando', PENDING: 'Pendente' },
  deleted_reason: { manual: 'Excluído manualmente', replaced_by_edit: 'Substituído por edição' },
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  LESSON: 'Aula',
  BREAK: 'Intervalo',
  ROUTINE: 'Rotina',
}

function isReference(field: string): boolean {
  return field.endsWith('_id') || field === 'replaced_by'
}

/** Valor legível de um campo. */
export function formatValue(field: string, value: unknown, table?: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'config_snapshot' || field === 'violations') return '(omitido)'
  if (isReference(field)) return '(referência)'

  if (typeof value === 'boolean') {
    if (field === 'active') return value ? 'Ativo' : 'Inativo'
    return value ? 'Sim' : 'Não'
  }

  if (field === 'role' && typeof value === 'string' && value in ROLE_LABELS) {
    return ROLE_LABELS[value as RoleKey]
  }
  if (field === 'type' && table === 'time_slots' && typeof value === 'string') {
    return SLOT_TYPE_LABELS[value] ?? value
  }
  if (typeof value === 'string' && ENUM_LABELS[field]?.[value]) {
    return ENUM_LABELS[field][value]
  }

  if (field === 'day_of_week' && typeof value === 'number') return DAY_NAMES[value] ?? String(value)
  if (field === 'days_of_week' && Array.isArray(value)) {
    return value.map((d) => DAY_NAMES[Number(d)] ?? String(d)).join(', ') || '—'
  }

  if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  }
  if (typeof value === 'number') return value.toLocaleString('pt-BR')
  if (Array.isArray(value)) return value.map((v) => formatValue('', v)).join(', ') || '—'
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > 120 ? `${json.slice(0, 117)}…` : json
  }
  return String(value)
}

export type DetailLine = { field: string; label: string; before?: string; after?: string }

/** Linhas de detalhe: o antes/depois numa alteração; os dados numa criação/exclusão. */
export function detailLines(entry: AuditEntry): DetailLine[] {
  const t = entry.table_name

  if (entry.action === 'UPDATE') {
    return (entry.changed_fields ?? [])
      .filter((f) => !HIDDEN_FIELDS.has(f))
      .map((f) => ({
        field: f,
        label: fieldLabel(f),
        before: formatValue(f, entry.old_data?.[f], t),
        after: formatValue(f, entry.new_data?.[f], t),
      }))
  }

  const data = (entry.action === 'INSERT' ? entry.new_data : entry.old_data) ?? {}
  return Object.entries(data)
    .filter(([f, v]) => !HIDDEN_FIELDS.has(f) && !isReference(f) && v !== null && v !== '')
    .filter(([f]) => f !== 'config_snapshot' && f !== 'violations')
    .map(([f, v]) => ({ field: f, label: fieldLabel(f), after: formatValue(f, v, t) }))
}

/** Verbo da ação: "criou", "alterou", "desativou", "apagou"… */
export function actionVerb(entry: AuditEntry): string {
  if (entry.action === 'INSERT') return 'criou'
  if (entry.action === 'DELETE') return 'excluiu'

  const changed = entry.changed_fields ?? []
  if (entry.table_name === 'generated_schedules') {
    if (changed.includes('deleted_at') && entry.new_data?.deleted_at) return 'apagou'
    if (changed.includes('is_baseline') && changed.length === 1) {
      return entry.new_data?.is_baseline ? 'marcou como base' : 'desmarcou como base'
    }
    if (changed.includes('status')) {
      return entry.new_data?.status === 'FAILED' ? 'teve falha ao gerar' : 'concluiu a geração de'
    }
  }
  if (changed.length === 1 && changed[0] === 'active') {
    return entry.new_data?.active ? 'reativou' : 'desativou'
  }
  return 'alterou'
}

export function actorName(entry: AuditEntry): string {
  if (!entry.actor_id) return 'Sistema'
  return entry.actor_name ?? entry.actor_email ?? 'Usuário removido'
}
