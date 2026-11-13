/**
 * Carrega no Supabase o horário vigente da Unidade II (2026 / 2º semestre):
 * Infantil III, IV, V e Fundamental I (1º ao 5º ano), a partir de
 * data/horario-unidade2-2026-2sem.csv — transcrição de
 *   "horários p build/Horário_fundamental OFICIAL.pdf"  (Fund. I)
 *   "horários p build/Horário Final_Infantil OFICIAL.xlsx" (Infantil, aba
 *    "HOR. 2026", horários conferidos com "HOR. 2026 Semanal" e
 *    "HOR. Expecíficos 2026"; a aba oculta "atualizado" foi ignorada).
 *
 * Decisões da transcrição (confirmadas com o usuário):
 *   - Tudo na Unidade II (U2CAFN).
 *   - Música: "Ana Clara" do PDF → Gabriela (substituiu Ana Clara em tudo).
 *   - Infantil III, Inglês ter/qui/sex ("Lara / Mariana") → só Mariana.
 *   - "Bárbara" (Música, 1º–4º ano) é outra pessoa, não a "Maria Barbara".
 *   - Ens. Religioso sem nome no PDF → Nathalia (aba de horários específicos).
 *   - Células sem professor (Português, Ciências… do 1º ao 4º ano e as
 *     atividades do Infantil) → regente da turma: Infantil III Geovanna,
 *     Infantil IV Patrícia, Infantil V "Mariana (Infantil V)", 1º Laine,
 *     2º Jackeline, 3º A Sarah, 3º B Rosângela, 4º Lilian, 5ºs Evani.
 *     A regente do Infantil V não é a Mariana do Inglês (choques de horário),
 *     nem a Jackeline é a "Jaqueline" de Biologia da Unidade I.
 *   - Ed. Física: Leonardo = Educação Física Masculina, Gleice = Feminina
 *     (mesmas disciplinas da Unidade I).
 *   - Rotina, Leitura em Voz Alta, Higienização e Parquinho do Infantil são
 *     rotina fixa (type ROUTINE; Intervalo fica BREAK), não aulas — o gerador
 *     não os move. As rotinas são conduzidas pela regente da turma, gravada em
 *     class_groups.homeroom_teacher_id.
 *   - "Reforço" (sexta 12:00, após o fim das aulas) não entra.
 *
 * Gleice, Eugênio e Lara já existiam (dão aula na Unidade I) e são reusados.
 *
 * Como o gerador é por tenant e o baseline é único por tenant, as aulas da
 * Unidade II são acrescentadas ao horário-base existente (que passa a cobrir
 * as duas unidades). Se não houver baseline, cria um.
 *
 * Idempotente: apaga e recria turmas, grades, disciplinas-da-turma,
 * atribuições e as aulas da Unidade II no baseline. Não toca na Unidade I.
 * ATENÇÃO: rodar scripts/seed-unidade1.mjs apaga TODOS os horários do tenant
 * (inclusive o baseline) — depois dele, rode este script de novo.
 *
 *   node scripts/seed-unidade2.mjs [--dry-run]
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')
const UNIT_CODE = 'U2CAFN'
const YEAR = 2026
const CSV = 'data/horario-unidade2-2026-2sem.csv'
const CSV_U1 = 'data/horario-unidade1-2026-2sem.csv'
const BASELINE_NAME = 'Horário vigente — Unidades I e II — 2026/2º semestre'

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

// ─── turmas (ordem de criação = ordem de exibição) ───────────────────────────
const TURMAS = [
  'Infantil III', 'Infantil IV', 'Infantil V',
  '1º Ano', '2º Ano', '3º Ano A', '3º Ano B', '4º Ano', '5º Ano A', '5º Ano B',
]

// ─── disciplinas: nome → [código, cor] (só usadas se ainda não existirem) ────
const SUBJECTS = {
  'Língua Portuguesa': ['LIN', '#A8DADC'],
  'Matemática': ['MAT', '#DC2626'],
  'Ciências': ['CIE', '#65A30D'],
  'História': ['HIS', '#E9C46A'],
  'Geografia': ['GEO', '#264653'],
  'Artes': ['ART', '#7D869C'],
  'Leitura': ['LEI', '#14B8A6'],
  'Música': ['MUS', '#B5838D'],
  'Latim': ['LAT', '#78350F'],
  'Inglês': ['ING', '#EA580C'],
  'Ensino Religioso': ['ENR', '#FDE68A'],
  'Educação Física Masculina': ['EFM', '#212F5C'],
  'Educação Física Feminina': ['EFF', '#FCA5A5'],
  'Musicalização': ['MSZ', '#E879F9'],
  'Psicomotricidade': ['PSI', '#F97316'],
  'Psicomotricidade — Regente': ['PSIR', '#FDBA74'],
  'Pensamento Lógico-Matemático': ['PLM', '#8B5CF6'],
  'Linguagem e Grafomotricidade': ['LGF', '#EAB308'],
  'Conhecimento de Mundo': ['CMU', '#22C55E'],
  'Atividades Artísticas e Motoras': ['AAM', '#EC4899'],
  'Motricidade': ['MOT', '#06B6D4'],
}

const DAYNUM = { SEGUNDA: 1, 'TERÇA': 2, QUARTA: 3, QUINTA: 4, SEXTA: 5 }
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

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

const rows = readCsv(CSV)
const aulas = rows.filter((r) => r.tipo === 'AULA')
console.log(`→ CSV: ${rows.length} células, ${aulas.length} aulas, ${TURMAS.length} turmas`)

// ─── checagens locais ────────────────────────────────────────────────────────
{
  const unknownSubj = [...new Set(aulas.map((r) => r.disciplina))].filter((d) => !SUBJECTS[d])
  if (unknownSubj.length) die(`disciplinas fora do mapa: ${unknownSubj.join(', ')}`)
  const unknownTurma = [...new Set(rows.map((r) => r.turma))].filter((t) => !TURMAS.includes(t))
  if (unknownTurma.length) die(`turmas fora do mapa: ${unknownTurma.join(', ')}`)
  // um professor por disciplina-da-turma (teaching_assignments é 1:1 com class_subjects)
  const prof = new Map()
  for (const r of aulas) {
    const k = `${r.turma}|${r.disciplina}`
    if (prof.has(k) && prof.get(k) !== r.professor) die(`${k} com dois professores: ${prof.get(k)} e ${r.professor}`)
    prof.set(k, r.professor)
  }
}

// Choques de professor. O motor considera "mesmo horário" = mesmo (dia, slot_order),
// independente do relógio; também conferimos sobreposição real de horário,
// inclusive contra a Unidade I (Gleice, Eugênio e Lara dão aula nas duas).
function teacherClashes() {
  const u1 = fs.existsSync(CSV_U1)
    ? readCsv(CSV_U1).filter((r) => r.tipo === 'AULA').flatMap((r) => {
      const profs = r.professor === 'CLARISSA E LARA' ? ['Clarissa', 'Lara'] : [r.professor]
      const nome = { GLEICE: 'Gleice', 'EUGÊNIO': 'Eugênio', LARA: 'Lara' }
      // duração das aulas da Unidade I: 50 min de manhã, 40/50 à tarde — usa 40 como mínimo
      return profs.map((p) => ({ unit: 'U1', turma: r.turma, dia: r.dia, ordem: r.ordem, professor: nome[p] ?? p, ini: toMin(r.inicio), fim: toMin(r.inicio) + 40 }))
    })
    : []
  const u2 = aulas.map((r) => ({ unit: 'U2', turma: r.turma, dia: r.dia, ordem: r.ordem, professor: r.professor, ini: toMin(r.inicio), fim: toMin(r.fim) }))
  const out = { relogio: [], slot: [] }
  const all = [...u1, ...u2]
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      // pares só da Unidade I ficam de fora: lá as aulas agrupadas (group_key) se sobrepõem de propósito
      if (a.unit === 'U1' && b.unit === 'U1') continue
      if (a.professor !== b.professor || a.dia !== b.dia || a.turma === b.turma) continue
      if (a.ini < b.fim && b.ini < a.fim) out.relogio.push(`${a.professor} ${a.dia}: ${a.unit} ${a.turma} × ${b.unit} ${b.turma}`)
      if (a.ordem === b.ordem) out.slot.push(`${a.professor} ${a.dia} slot ${a.ordem}: ${a.unit} ${a.turma} × ${b.unit} ${b.turma}`)
    }
  }
  return out
}
const clashes = teacherClashes()
console.log(`→ choques de horário real: ${clashes.relogio.length}${clashes.relogio.length ? '\n   ' + clashes.relogio.join('\n   ') : ''}`)
console.log(`→ choques por posição (dia+slot, visão do motor): ${clashes.slot.length}${clashes.slot.length ? '\n   ' + clashes.slot.join('\n   ') : ''}`)

// ─── unidade ─────────────────────────────────────────────────────────────────
const units = ok(await sb.from('school_units').select('id,tenant_id,code').eq('code', UNIT_CODE), 'school_units')
if (!units.length) die(`Unidade ${UNIT_CODE} não encontrada`)
const { id: unitId, tenant_id: tenantId } = units[0]
console.log(`→ Unidade II: ${unitId}  tenant: ${tenantId}`)

const existingSubjects = ok(await sb.from('subjects').select('id,name').eq('tenant_id', tenantId), 'subjects')
const existingTeachers = ok(await sb.from('teachers').select('id,name').eq('tenant_id', tenantId), 'teachers')
const subjToCreate = Object.keys(SUBJECTS).filter((n) => !existingSubjects.some((s) => s.name === n))
const teacherNames = [...new Set(aulas.map((r) => r.professor))]
const teachToCreate = teacherNames.filter((n) => !existingTeachers.some((t) => t.name === n))
console.log(`→ disciplinas a criar (${subjToCreate.length}): ${subjToCreate.join(', ')}`)
console.log(`→ professores reusados: ${teacherNames.filter((n) => !teachToCreate.includes(n)).join(', ')}`)
console.log(`→ professores a criar (${teachToCreate.length}): ${teachToCreate.join(', ')}`)

if (DRY) { console.log('— dry-run, nada foi gravado —'); process.exit(0) }

// 1. disciplinas
const subjByName = new Map(existingSubjects.map((s) => [s.name, s.id]))
if (subjToCreate.length) {
  const created = ok(await sb.from('subjects').insert(
    subjToCreate.map((name) => ({ tenant_id: tenantId, name, code: SUBJECTS[name][0], color: SUBJECTS[name][1] }))
  ).select('id,name'), 'insert subjects')
  created.forEach((s) => subjByName.set(s.name, s.id))
}

// 2. professores
const teacherByName = new Map(existingTeachers.map((t) => [t.name, t.id]))
if (teachToCreate.length) {
  const created = ok(await sb.from('teachers').insert(
    teachToCreate.map((name) => ({ tenant_id: tenantId, name }))
  ).select('id,name'), 'insert teachers')
  created.forEach((t) => teacherByName.set(t.name, t.id))
}

// 3. limpeza da Unidade II
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
  const oldSlots = ok(await sb.from('time_slots').select('id').in('time_grid_id', oldGrids.map((g) => g.id)), 'old slots')
  if (oldSlots.length) ok(await sb.from('schedule_entries').delete().in('time_slot_id', oldSlots.map((s) => s.id)), 'del slot entries')
  ok(await sb.from('time_slots').delete().in('time_grid_id', oldGrids.map((g) => g.id)), 'del slots')
  ok(await sb.from('time_grids').delete().in('id', oldGrids.map((g) => g.id)), 'del grids')
}
if (oldGroupIds.length) ok(await sb.from('class_groups').delete().in('id', oldGroupIds), 'del groups')
console.log(`→ limpeza: ${oldGroupIds.length} turmas, ${oldGrids.length} grades removidas`)

// Professora regente de cada turma — conduz as rotinas da grade (migração 007).
const REGENTES = {
  'Infantil III': 'Geovanna', 'Infantil IV': 'Patrícia', 'Infantil V': 'Mariana (Infantil V)',
  '1º Ano': 'Laine', '2º Ano': 'Jackeline', '3º Ano A': 'Sarah', '3º Ano B': 'Rosângela',
  '4º Ano': 'Lilian', '5º Ano A': 'Evani', '5º Ano B': 'Evani',
}

// Atividades fixas do Infantil: não são intervalo nem disciplina → slot do tipo ROUTINE.
const ROTINAS_INFANTIL = new Set(['Higienização', 'Leitura em Voz Alta', 'Parquinho', 'Rotina Diária / Mural e Bits'])

// 4. turmas + grades + slots (slots vêm direto do CSV, por turma e dia)
const groupIdByTurma = new Map()
const slotIdByKey = new Map() // `${turma}|${day}|${ordem}` → id
for (const turma of TURMAS) {
  const cg = ok(await sb.from('class_groups').insert({
    school_unit_id: unitId, tenant_id: tenantId, name: turma, shift: 'MORNING', year: YEAR,
    homeroom_teacher_id: teacherByName.get(REGENTES[turma]) ?? null,
  }).select('id').single(), `insert turma ${turma}`)
  groupIdByTurma.set(turma, cg.id)

  const cells = rows.filter((r) => r.turma === turma)
  const days = [...new Set(cells.map((r) => DAYNUM[r.dia]))].sort()
  const grid = ok(await sb.from('time_grids').insert({
    school_unit_id: unitId, tenant_id: tenantId, class_group_id: cg.id,
    name: `Grade ${turma} — 2026/2`, shift: 'MORNING',
    days_of_week: days, start_time: cells[0].inicio, active: true,
  }).select('id').single(), `insert grade ${turma}`)

  const slots = cells.map((r) => ({
    time_grid_id: grid.id,
    day_of_week: DAYNUM[r.dia],
    slot_order: Number(r.ordem),
    start_time: r.inicio,
    end_time: r.fim,
    duration_minutes: toMin(r.fim) - toMin(r.inicio),
    type: r.tipo === 'AULA' ? 'LESSON' : ROTINAS_INFANTIL.has(r.disciplina) && r.etapa === 'INFANTIL' ? 'ROUTINE' : 'BREAK',
    label: r.tipo === 'AULA' ? null : r.disciplina,
  }))
  const inserted = ok(await sb.from('time_slots').insert(slots).select('id,day_of_week,slot_order'), `insert slots ${turma}`)
  inserted.forEach((s) => slotIdByKey.set(`${turma}|${s.day_of_week}|${s.slot_order}`, s.id))
}
console.log(`→ turmas: ${TURMAS.length} · grades: ${TURMAS.length} · slots: ${slotIdByKey.size}`)

// 5. class_subjects + teaching_assignments
const weekly = new Map() // `${turma}|${disciplina}` → { count, professor }
for (const r of aulas) {
  const k = `${r.turma}|${r.disciplina}`
  const cur = weekly.get(k) ?? { count: 0, turma: r.turma, disciplina: r.disciplina, professor: r.professor }
  cur.count += 1
  weekly.set(k, cur)
}
const csInserted = ok(await sb.from('class_subjects').insert([...weekly.values()].map((w) => ({
  class_group_id: groupIdByTurma.get(w.turma),
  subject_id: subjByName.get(w.disciplina),
  weekly_lessons: w.count,
  allow_double_lesson: true,
  group_key: null,
}))).select('id,class_group_id,subject_id'), 'insert class_subjects')
const csIdByKey = new Map()
for (const w of weekly.values()) {
  const gid = groupIdByTurma.get(w.turma), sid = subjByName.get(w.disciplina)
  csIdByKey.set(`${w.turma}|${w.disciplina}`, csInserted.find((c) => c.class_group_id === gid && c.subject_id === sid).id)
}
const taInserted = ok(await sb.from('teaching_assignments').insert([...weekly.values()].map((w) => ({
  teacher_id: teacherByName.get(w.professor),
  class_subject_id: csIdByKey.get(`${w.turma}|${w.disciplina}`),
}))).select('id,class_subject_id'), 'insert teaching_assignments')
const taIdByCs = new Map(taInserted.map((t) => [t.class_subject_id, t.id]))
console.log(`→ class_subjects: ${csInserted.length} · teaching_assignments: ${taInserted.length}`)

// 6. aulas no horário-base (único por tenant)
const baselines = ok(await sb.from('generated_schedules').select('id,name,config_snapshot')
  .eq('tenant_id', tenantId).eq('is_baseline', true), 'baseline')
let sched = baselines[0]
const snapshotU2 = {
  source: ['Horário_fundamental OFICIAL.pdf', 'Horário Final_Infantil OFICIAL.xlsx'],
  imported_from: CSV,
  school_unit_code: UNIT_CODE,
}
if (sched) {
  const snap = sched.config_snapshot ?? {}
  ok(await sb.from('generated_schedules').update({
    name: BASELINE_NAME,
    config_snapshot: { ...snap, units: { ...(snap.units ?? {}), [UNIT_CODE]: snapshotU2 } },
  }).eq('id', sched.id), 'update baseline')
  console.log(`→ baseline existente "${sched.name}" → "${BASELINE_NAME}"`)
} else {
  const profile = ok(await sb.from('profiles').select('id').eq('tenant_id', tenantId).eq('role', 'ADMIN').limit(1), 'profile')
  sched = ok(await sb.from('generated_schedules').insert({
    tenant_id: tenantId, name: BASELINE_NAME, status: 'COMPLETED', is_baseline: true, baseline_weight: 0.7,
    created_by: profile[0]?.id ?? null, config_snapshot: { units: { [UNIT_CODE]: snapshotU2 } },
  }).select('id').single(), 'insert schedule')
  console.log(`→ baseline criado "${BASELINE_NAME}"`)
}

const entries = aulas.map((r) => {
  const day = DAYNUM[r.dia]
  const slotId = slotIdByKey.get(`${r.turma}|${day}|${r.ordem}`)
  const taId = taIdByCs.get(csIdByKey.get(`${r.turma}|${r.disciplina}`))
  if (!slotId || !taId) die(`célula sem slot/atribuição: ${JSON.stringify(r)}`)
  return { generated_schedule_id: sched.id, teaching_assignment_id: taId, day_of_week: day, time_slot_id: slotId, locked: true }
})
for (let i = 0; i < entries.length; i += 200) {
  ok(await sb.from('schedule_entries').insert(entries.slice(i, i + 200)), 'insert entries')
}
console.log(`→ ${entries.length} aulas da Unidade II alocadas no horário-base`)
console.log('✓ concluído')
