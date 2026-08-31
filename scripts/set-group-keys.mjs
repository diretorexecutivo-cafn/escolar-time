/**
 * Preenche class_subjects.group_key (aulas agrupadas) da Unidade I.
 * Rode DEPOIS de aplicar supabase/migrations/002_lesson_groups.sql.
 *
 * Uso pontual — se os dados já foram carregados por scripts/seed-unidade1.mjs
 * SEM a coluna group_key existir ainda. Alternativa: rodar o seed de novo
 * (idempotente) agora que a coluna existe, que já grava tudo certo de uma vez.
 *
 *   node scripts/set-group-keys.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// subject_code → { turma: group_key }
// Inglês 1/2: nivelamento entre turmas — 6º+7º se misturam por nível num
// bloco, 8º+9º no outro; cada turma manda alunos para os dois níveis, então
// as DUAS disciplinas (ING1, ING2) das QUATRO turmas compartilham o group_key
// do seu bloco (ver comentário em seed-unidade1.mjs).
const ING = { '6º Ano': 'ING-F2-A', '7º Ano': 'ING-F2-A', '8º Ano': 'ING-F2-B', '9º Ano': 'ING-F2-B' }
const GROUPS = {
  EFM: { '6º Ano': 'EFM-F2-A', '7º Ano': 'EFM-F2-A', '8º Ano': 'EFM-F2-B', '9º Ano': 'EFM-F2-B', '1ª Série': 'EFM-EM', '2ª Série': 'EFM-EM', '3ª Série': 'EFM-EM' },
  EFF: { '6º Ano': 'EFF-F2-A', '7º Ano': 'EFF-F2-A', '8º Ano': 'EFF-F2-B', '9º Ano': 'EFF-F2-B', '1ª Série': 'EFF-EM', '2ª Série': 'EFF-EM', '3ª Série': 'EFF-EM' },
  PVM: { '1ª Série': 'PVM-EM', '2ª Série': 'PVM-EM', '3ª Série': 'PVM-EM' },
  PVF: { '1ª Série': 'PVF-EM', '2ª Série': 'PVF-EM', '3ª Série': 'PVF-EM' },
  ING1: ING,
  ING2: ING,
}

const probe = await sb.from('class_subjects').select('group_key').limit(1)
if (probe.error) {
  console.error('✗ coluna group_key ausente — aplique supabase/migrations/002_lesson_groups.sql primeiro.')
  process.exit(1)
}

const { data, error } = await sb
  .from('class_subjects')
  .select('id, subjects!inner(code), class_groups!inner(name, school_units!inner(code))')
  .eq('class_groups.school_units.code', 'U1CAFN')
if (error) { console.error('✗', error.message); process.exit(1) }

let n = 0
for (const cs of data) {
  const key = GROUPS[cs.subjects.code]?.[cs.class_groups.name]
  if (!key) continue
  const r = await sb.from('class_subjects').update({ group_key: key }).eq('id', cs.id)
  if (r.error) { console.error('✗', cs.id, r.error.message); process.exit(1) }
  console.log(`  ${cs.class_groups.name.padEnd(9)} ${cs.subjects.code.padEnd(5)} → ${key}`)
  n++
}
console.log(`✓ ${n} class_subjects marcadas como aula agrupada`)
