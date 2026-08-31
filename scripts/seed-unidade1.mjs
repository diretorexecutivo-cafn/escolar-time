/**
 * Carrega no Supabase o horário vigente da Unidade I (2026 / 2º semestre),
 * a partir de data/horario-unidade1-2026-2sem.csv (transcrição do PDF oficial).
 *
 * Idempotente: apaga e recria turmas, grades, disciplinas-da-turma, atribuições
 * e o horário-base da Unidade I. Não toca na Unidade II.
 *
 *   node scripts/seed-unidade1.mjs [--dry-run]
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')
const UNIT_CODE = 'U1CAFN'
const YEAR = 2026
const BASELINE_NAME = 'Horário vigente — Unidade I — 2026/2º semestre'

// ─── env ─────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const die = (msg, e) => { console.error('✗', msg, e?.message ?? e ?? ''); process.exit(1) }
const ok = (r, what) => { if (r.error) die(what, r.error); return r.data }

// ─── grades de horário ───────────────────────────────────────────────────────
// L = LESSON, B = BREAK. duration em minutos, encadeados a partir de start_time.
const MANHA = [
  ['L', 50], ['L', 50], ['L', 50], ['B', 20, 'Recreio'], ['L', 50], ['L', 50], ['L', 50],
]
const GRIDS = {
  'FUND II': {
    start: '07:10',
    days: {
      1: MANHA,
      2: [...MANHA, ['B', 40, 'Almoço'], ['L', 40], ['L', 40], ['L', 40], ['L', 40]],
      3: [...MANHA, ['B', 90, 'Almoço'], ['L', 40], ['L', 40], ['L', 40], ['L', 40]],
      4: MANHA,
      5: MANHA,
    },
  },
  'MÉDIO': {
    start: '07:10',
    days: {
      1: MANHA,
      2: [...MANHA, ['B', 90, 'Almoço'], ['L', 50], ['B', 10, 'Intervalo'], ['L', 40], ['B', 10, 'Intervalo'], ['L', 40], ['L', 40]],
      3: [...MANHA, ['B', 90, 'Almoço'], ['L', 50], ['L', 50], ['B', 20, 'Recreio'], ['L', 50], ['L', 50]],
      4: [...MANHA, ['B', 90, 'Almoço'], ['L', 40], ['L', 40], ['B', 10, 'Intervalo'], ['L', 40], ['L', 40]],
      5: MANHA,
    },
  },
}
const addMin = (t, m) => {
  const [h, mm] = t.split(':').map(Number)
  const tot = h * 60 + mm + m
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}
function buildSlots(etapa) {
  const g = GRIDS[etapa]
  const out = []
  for (const [day, defs] of Object.entries(g.days)) {
    let cursor = g.start
    defs.forEach(([type, mins, label], i) => {
      const start = cursor, end = addMin(cursor, mins)
      cursor = end
      out.push({
        day_of_week: Number(day), slot_order: i + 1, start_time: start, end_time: end,
        duration_minutes: mins, type: type === 'B' ? 'BREAK' : 'LESSON', label: label ?? null,
      })
    })
  }
  return out
}

// ─── turmas ──────────────────────────────────────────────────────────────────
const TURMAS = [
  { pdf: '6º ANO', name: '6º Ano', etapa: 'FUND II' },
  { pdf: '7º ANO', name: '7º Ano', etapa: 'FUND II' },
  { pdf: '8º ANO', name: '8º Ano', etapa: 'FUND II' },
  { pdf: '9º ANO', name: '9º Ano', etapa: 'FUND II' },
  { pdf: '1ª SÉRIE', name: '1ª Série', etapa: 'MÉDIO' },
  { pdf: '2ª SÉRIE', name: '2ª Série', etapa: 'MÉDIO' },
  { pdf: '3ª SÉRIE', name: '3ª Série', etapa: 'MÉDIO' },
]

// ─── disciplinas: nome no PDF → { name, code } ───────────────────────────────
const SUBJECTS = {
  'ARTE': ['Artes', 'ART'],
  'BIOLOGIA': ['Biologia', 'BIO'],
  'BIOLOGIA 1': ['Biologia 1', 'BIO1'],
  'BIOLOGIA 2': ['Biologia 2', 'BIO2'],
  'CIÊNCIAS': ['Ciências', 'CIE'],
  'EDUCAÇÃO FÍSICA FEM.': ['Educação Física Feminina', 'EFF'],
  'EDUCAÇÃO FÍSICA MASC.': ['Educação Física Masculina', 'EFM'],
  'ENSINO RELIGIOSO': ['Ensino Religioso', 'ENR'],
  'ESPANHOL': ['Espanhol', 'ESP'],
  'FILOSOFIA': ['Filosofia', 'FIL'],
  'FÍSICA': ['Física', 'FIS'],
  'FÍSICA 1': ['Física 1', 'FIS1'],
  'FÍSICA 2': ['Física 2', 'FIS2'],
  'GEOGRAFIA': ['Geografia', 'GEO'],
  'GRAMÁTICA': ['Gramática', 'GRA'],
  'HISTÓRIA': ['História', 'HIS'],
  'HISTÓRIA 1': ['História 1', 'HIS1'],
  'HISTÓRIA 2': ['História 2', 'HIS2'],
  'INGLÊS': ['Inglês', 'ING'],
  'INGLÊS 1': ['Inglês 1', 'ING1'],
  'INGLÊS 2': ['Inglês 2', 'ING2'],
  'LATIM': ['Latim', 'LAT'],
  'LITERATURA': ['Literatura', 'LIT'],
  'LITERATURA 1': ['Literatura 1', 'LIT1'],
  'LITERATURA 2': ['Literatura 2', 'LIT2'],
  'MATEMÁTICA 1': ['Matemática 1', 'MAT1'],
  'MATEMÁTICA 2': ['Matemática 2', 'MAT2'],
  'MÚSICA': ['Música', 'MUS'],
  'OFICINA DE FILOSOFIA': ['Oficina de Filosofia', 'OFFIL'],
  'OFICINA DE FÍSICA': ['Oficina de Física', 'OFFIS'],
  'OFICINA DE LITERATURA': ['Oficina de Literatura', 'OFLIT'],
  'OFICINA DE MATEMÁTICA': ['Oficina de Matemática', 'OFMAT'],
  'OFICINA DE PRODUÇÃO DE TEXTO': ['Oficina de Produção de Texto', 'OFPTX'],
  'OFICINA DE QUÍMICA': ['Oficina de Química', 'OFQUI'],
  'PRODUÇÃO DE TEXTO': ['Produção de Texto', 'PTX'],
  'PROJETO DE VIDA FEM.': ['Projeto de Vida Feminino', 'PVF'],
  'PROJETO DE VIDA MASC.': ['Projeto de Vida Masculino', 'PVM'],
  'QUÍMICA': ['Química', 'QUI'],
  'SOCIOLOGIA': ['Sociologia', 'SOC'],
}

// Professores: nome no PDF → nome canônico
// "Christiane" e "Cristiane" são a mesma pessoa (confirmado pelo usuário) —
// grafias diferentes no PDF, mescladas no nome já cadastrado "Cristiane".
const TEACHERS = {
  'ALEX': 'Alex', 'ALEXANDRE': 'Alexandre', 'ALEXANDRE QUEIROZ': 'Alexandre Queiroz',
  'BIANKA': 'Bianka', 'CASSIANO': 'Cassiano', 'CÉSAR': 'César', 'CHRISTIANE': 'Cristiane',
  'CLARISSA': 'Clarissa', 'CRISTIANE': 'Cristiane', 'ERIELSON': 'Erielson', 'EUGÊNIO': 'Eugênio',
  'GILMARA': 'Gilmara', 'GLEICE': 'Gleice', 'JAQUELINE': 'Jaqueline', 'JEANN': 'Jeann',
  'KELVY': 'Kelvy', 'LARA': 'Lara', 'LIZ': 'Liz', 'LUCAS RIBEIRO': 'Lucas Ribeiro',
  'MARCELA': 'Marcela', 'MARCELINA': 'Marcelina', 'MARCIO': 'Marcio',
  'MARIA BARBARA': 'Maria Barbara', 'MAYARA': 'Mayara', 'RAQUEL': 'Raquel',
  'RAYNNER': 'Raynner', 'SALYN': 'Salyn', 'SAMUEL': 'Samuel',
}

// Nivelamento de Inglês do Fund. II: cada bloco junta os alunos de DUAS turmas
// (6º+7º num bloco, 8º+9º noutro) e os REDISTRIBUI por nível — não é "turma A
// fica com Clarissa, turma B fica com Lara": cada turma manda parte dos seus
// alunos para o Nível 1 (Clarissa / Inglês 1) e parte para o Nível 2 (Lara /
// Inglês 2). Por isso as DUAS turmas do bloco recebem AMBAS as disciplinas,
// e as quatro entradas (2 turmas × 2 níveis) compartilham um único group_key
// — mesmo horário, e nem professor nem turma devem contar como conflito
// entre elas.
const ING_NIVEIS = [
  { subject: 'INGLÊS 1', teacher: 'CLARISSA' },
  { subject: 'INGLÊS 2', teacher: 'LARA' },
]
const ING_BLOCO = { '6º ANO': 'ING-F2-A', '7º ANO': 'ING-F2-A', '8º ANO': 'ING-F2-B', '9º ANO': 'ING-F2-B' }

// Aulas agrupadas: disciplina → turma → group_key
const GROUPS = {
  'EDUCAÇÃO FÍSICA MASC.': { '6º ANO': 'EFM-F2-A', '7º ANO': 'EFM-F2-A', '8º ANO': 'EFM-F2-B', '9º ANO': 'EFM-F2-B', '1ª SÉRIE': 'EFM-EM', '2ª SÉRIE': 'EFM-EM', '3ª SÉRIE': 'EFM-EM' },
  'EDUCAÇÃO FÍSICA FEM.': { '6º ANO': 'EFF-F2-A', '7º ANO': 'EFF-F2-A', '8º ANO': 'EFF-F2-B', '9º ANO': 'EFF-F2-B', '1ª SÉRIE': 'EFF-EM', '2ª SÉRIE': 'EFF-EM', '3ª SÉRIE': 'EFF-EM' },
  'PROJETO DE VIDA MASC.': { '1ª SÉRIE': 'PVM-EM', '2ª SÉRIE': 'PVM-EM', '3ª SÉRIE': 'PVM-EM' },
  'PROJETO DE VIDA FEM.': { '1ª SÉRIE': 'PVF-EM', '2ª SÉRIE': 'PVF-EM', '3ª SÉRIE': 'PVF-EM' },
}

const DAYNUM = { SEGUNDA: 1, 'TERÇA': 2, QUARTA: 3, QUINTA: 4, SEXTA: 5 }

// ─── CSV ─────────────────────────────────────────────────────────────────────
function readCsv(path) {
  const [head, ...lines] = fs.readFileSync(path, 'utf8').trim().split('\n')
  const cols = head.split(',')
  return lines.map((l) => {
    const vals = []; let cur = ''; let q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { vals.push(cur); cur = '' }
      else cur += ch
    }
    vals.push(cur)
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
  })
}

// Resolve uma célula do PDF para uma OU MAIS entradas { subjectKey, teacherKey,
// groupKey }. Normalmente uma célula = uma entrada; o nivelamento de Inglês é a
// exceção — uma célula do PDF vira duas entradas (Nível 1 e Nível 2) para a
// mesma turma, pois ambos os níveis recebem alunos dela.
function resolveAll(rec) {
  const { turma, disciplina, professor } = rec
  if (disciplina === 'INGLÊS' && professor === 'CLARISSA E LARA') {
    const groupKey = ING_BLOCO[turma]
    return ING_NIVEIS.map((n) => ({ subjectKey: n.subject, teacherKey: n.teacher, groupKey }))
  }
  return [{
    subjectKey: disciplina,
    teacherKey: professor,
    groupKey: GROUPS[disciplina]?.[turma] ?? null,
  }]
}

// ─── main ────────────────────────────────────────────────────────────────────
const rows = readCsv('data/horario-unidade1-2026-2sem.csv')
const aulas = rows.filter((r) => r.tipo === 'AULA')
console.log(`→ CSV: ${rows.length} células, ${aulas.length} aulas`)

const units = ok(await sb.from('school_units').select('id,tenant_id,code').eq('code', UNIT_CODE), 'school_units')
if (!units.length) die(`Unidade ${UNIT_CODE} não encontrada`)
const { id: unitId, tenant_id: tenantId } = units[0]
console.log(`→ Unidade I: ${unitId}  tenant: ${tenantId}`)

const hasGroupKey = (() => {
  return sb.from('class_subjects').select('group_key').limit(1).then((r) => !r.error)
})()
const GROUP_COL = await hasGroupKey
console.log(`→ coluna class_subjects.group_key: ${GROUP_COL ? 'presente' : 'AUSENTE (migration 002 não aplicada)'}`)

if (DRY) { console.log('— dry-run, nada foi gravado —'); process.exit(0) }

// 1. disciplinas
const existingSubjects = ok(await sb.from('subjects').select('id,name,code').eq('tenant_id', tenantId), 'subjects')
const subjById = new Map(existingSubjects.map((s) => [s.name, s.id]))
const toCreate = Object.values(SUBJECTS).filter(([name]) => !subjById.has(name))
if (toCreate.length) {
  const created = ok(await sb.from('subjects').insert(
    toCreate.map(([name, code]) => ({ tenant_id: tenantId, name, code }))
  ).select('id,name'), 'insert subjects')
  created.forEach((s) => subjById.set(s.name, s.id))
}
console.log(`→ disciplinas: ${toCreate.length} criadas, ${Object.keys(SUBJECTS).length} em uso`)

// 2. professores (dedup por nome; "Lucas" → "Lucas Ribeiro")
let existingTeachers = ok(await sb.from('teachers').select('id,name,created_at').eq('tenant_id', tenantId), 'teachers')
const lucas = existingTeachers.find((t) => t.name === 'Lucas')
if (lucas) { ok(await sb.from('teachers').update({ name: 'Lucas Ribeiro' }).eq('id', lucas.id), 'rename Lucas'); lucas.name = 'Lucas Ribeiro' }
const byName = new Map()
const dupes = []
for (const t of [...existingTeachers].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  if (byName.has(t.name)) dupes.push(t.id); else byName.set(t.name, t.id)
}
const wanted = new Set(Object.values(TEACHERS))
const missing = [...wanted].filter((n) => !byName.has(n))
if (missing.length) {
  const created = ok(await sb.from('teachers').insert(
    missing.map((name) => ({ tenant_id: tenantId, name }))
  ).select('id,name'), 'insert teachers')
  created.forEach((t) => byName.set(t.name, t.id))
}
console.log(`→ professores: ${missing.length} criados, ${dupes.length} duplicados a remover`)

// 3. limpeza da Unidade I
const oldGroups = ok(await sb.from('class_groups').select('id').eq('school_unit_id', unitId), 'old class_groups')
const oldGroupIds = oldGroups.map((g) => g.id)
if (oldGroupIds.length) {
  const oldCs = ok(await sb.from('class_subjects').select('id').in('class_group_id', oldGroupIds), 'old class_subjects')
  const oldCsIds = oldCs.map((c) => c.id)
  if (oldCsIds.length) {
    const oldTa = ok(await sb.from('teaching_assignments').select('id').in('class_subject_id', oldCsIds), 'old ta')
    if (oldTa.length) ok(await sb.from('schedule_entries').delete().in('teaching_assignment_id', oldTa.map((t) => t.id)), 'del entries')
    ok(await sb.from('teaching_assignments').delete().in('class_subject_id', oldCsIds), 'del ta')
    ok(await sb.from('class_subjects').delete().in('id', oldCsIds), 'del cs')
  }
}
const oldGrids = ok(await sb.from('time_grids').select('id').eq('school_unit_id', unitId), 'old grids')
if (oldGrids.length) {
  ok(await sb.from('time_slots').delete().in('time_grid_id', oldGrids.map((g) => g.id)), 'del slots')
  ok(await sb.from('time_grids').delete().in('id', oldGrids.map((g) => g.id)), 'del grids')
}
if (oldGroupIds.length) ok(await sb.from('class_groups').delete().in('id', oldGroupIds), 'del groups')
// horários antigos do tenant (só os sem entradas restantes: testes falhos + baseline anterior)
const oldSched = ok(await sb.from('generated_schedules').select('id,name,status').eq('tenant_id', tenantId), 'old sched')
if (oldSched.length) {
  ok(await sb.from('schedule_entries').delete().in('generated_schedule_id', oldSched.map((s) => s.id)), 'del old entries')
  ok(await sb.from('generated_schedules').delete().in('id', oldSched.map((s) => s.id)), 'del old sched')
}
if (dupes.length) ok(await sb.from('teachers').delete().in('id', dupes), 'del dup teachers')
// "Christiane" era grafia duplicada de "Cristiane" (mesma pessoa, confirmado
// pelo usuário) — depois da limpeza acima ela não tem mais nenhuma atribuição.
const christiane = existingTeachers.find((t) => t.name === 'Christiane')
if (christiane) {
  const stillUsed = ok(await sb.from('teaching_assignments').select('id').eq('teacher_id', christiane.id).limit(1), 'check christiane')
  if (stillUsed.length) die(`Teacher "Christiane" (${christiane.id}) ainda tem atribuições — mesclagem abortada`)
  ok(await sb.from('teachers').delete().eq('id', christiane.id), 'del christiane')
  byName.delete('Christiane')
  console.log('→ mesclado: "Christiane" removida, atribuições recriadas em "Cristiane"')
}
console.log(`→ limpeza: ${oldGroupIds.length} turmas, ${oldGrids.length} grades, ${oldSched.length} horários removidos`)

// 4. turmas + grades + slots
const groupIdByPdf = new Map()
const slotIdByTurmaDaySlot = new Map() // `${pdfTurma}|${day}|${slotOrder}` → id
for (const t of TURMAS) {
  const cg = ok(await sb.from('class_groups').insert({
    school_unit_id: unitId, tenant_id: tenantId, name: t.name, shift: 'MORNING', year: YEAR,
  }).select('id').single(), `insert turma ${t.name}`)
  groupIdByPdf.set(t.pdf, cg.id)

  const grid = ok(await sb.from('time_grids').insert({
    school_unit_id: unitId, tenant_id: tenantId, class_group_id: cg.id,
    name: `Grade ${t.name} — 2026/2`, shift: 'MORNING',
    days_of_week: Object.keys(GRIDS[t.etapa].days).map(Number),
    start_time: GRIDS[t.etapa].start, active: true,
  }).select('id').single(), `insert grade ${t.name}`)

  const slots = buildSlots(t.etapa).map((s) => ({ ...s, time_grid_id: grid.id }))
  const inserted = ok(await sb.from('time_slots').insert(slots).select('id,day_of_week,slot_order'), `insert slots ${t.name}`)
  inserted.forEach((s) => slotIdByTurmaDaySlot.set(`${t.pdf}|${s.day_of_week}|${s.slot_order}`, s.id))
}
console.log(`→ turmas: ${TURMAS.length} · grades: ${TURMAS.length} · slots: ${slotIdByTurmaDaySlot.size}`)

// mapa início → slot_order, por etapa/dia (derivado das grades)
const slotOrderByStart = {}
for (const etapa of Object.keys(GRIDS)) {
  slotOrderByStart[etapa] = {}
  for (const s of buildSlots(etapa)) {
    slotOrderByStart[etapa][`${s.day_of_week}|${s.start_time}`] = s.slot_order
  }
}

// 5. class_subjects + teaching_assignments
const weekly = new Map() // `${turma}|${subjectKey}` → { count, teacherKey, groupKey }
for (const r of aulas) {
  for (const { subjectKey, teacherKey, groupKey } of resolveAll(r)) {
    const k = `${r.turma}|${subjectKey}`
    const cur = weekly.get(k) ?? { count: 0, teacherKey, groupKey, turma: r.turma, subjectKey }
    cur.count += 1
    weekly.set(k, cur)
  }
}
const csRows = [...weekly.values()].map((w) => ({
  class_group_id: groupIdByPdf.get(w.turma),
  subject_id: subjById.get(SUBJECTS[w.subjectKey][0]),
  weekly_lessons: w.count,
  allow_double_lesson: true,
  ...(GROUP_COL ? { group_key: w.groupKey } : {}),
}))
const csInserted = ok(await sb.from('class_subjects').insert(csRows).select('id,class_group_id,subject_id'), 'insert class_subjects')
const csIdByKey = new Map()
for (const w of weekly.values()) {
  const gid = groupIdByPdf.get(w.turma), sid = subjById.get(SUBJECTS[w.subjectKey][0])
  const row = csInserted.find((c) => c.class_group_id === gid && c.subject_id === sid)
  csIdByKey.set(`${w.turma}|${w.subjectKey}`, row.id)
}
const taRows = [...weekly.values()].map((w) => ({
  teacher_id: byName.get(TEACHERS[w.teacherKey]),
  class_subject_id: csIdByKey.get(`${w.turma}|${w.subjectKey}`),
}))
const taInserted = ok(await sb.from('teaching_assignments').insert(taRows).select('id,class_subject_id'), 'insert teaching_assignments')
const taIdByCs = new Map(taInserted.map((t) => [t.class_subject_id, t.id]))
console.log(`→ class_subjects: ${csInserted.length} · teaching_assignments: ${taInserted.length}`)

// 6. horário vigente como baseline
const profile = ok(await sb.from('profiles').select('id').eq('tenant_id', tenantId).eq('role', 'ADMIN').limit(1), 'profile')
const sched = ok(await sb.from('generated_schedules').insert({
  tenant_id: tenantId, name: BASELINE_NAME, status: 'COMPLETED', is_baseline: true, baseline_weight: 0.7,
  created_by: profile[0]?.id ?? null,
  config_snapshot: {
    source: 'HORÁRIO 2026 - 2° semestre.pdf',
    imported_from: 'data/horario-unidade1-2026-2sem.csv',
    school_unit_code: UNIT_CODE,
    note: 'Transcrição do horário oficial vigente. Aulas agrupadas marcadas em class_subjects.group_key.',
  },
}).select('id').single(), 'insert schedule')

const entries = []
const unmatched = []
for (const r of aulas) {
  const day = DAYNUM[r.dia]
  const etapa = r.etapa
  const slotOrder = slotOrderByStart[etapa][`${day}|${r.inicio}`]
  const slotId = slotIdByTurmaDaySlot.get(`${r.turma}|${day}|${slotOrder}`)
  for (const { subjectKey } of resolveAll(r)) {
    const taId = taIdByCs.get(csIdByKey.get(`${r.turma}|${subjectKey}`))
    if (!slotId || !taId) { unmatched.push({ ...r, subjectKey }); continue }
    entries.push({ generated_schedule_id: sched.id, teaching_assignment_id: taId, day_of_week: day, time_slot_id: slotId, locked: true })
  }
}
if (unmatched.length) { console.error('✗ células sem slot/atribuição:', unmatched.slice(0, 5)); die(`${unmatched.length} células não mapeadas`) }
for (let i = 0; i < entries.length; i += 200) {
  ok(await sb.from('schedule_entries').insert(entries.slice(i, i + 200)), 'insert entries')
}
console.log(`→ horário-base "${BASELINE_NAME}": ${entries.length} aulas alocadas`)
console.log('✓ concluído')
