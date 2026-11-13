-- Professora regente da turma. As rotinas da grade (slots ROUTINE — leitura em voz alta,
-- higienização, parquinho… no Infantil) são conduzidas pela regente da própria turma:
-- nesses horários ela está ocupada e não pode dar aula em outra turma.

ALTER TABLE class_groups
  ADD COLUMN IF NOT EXISTS homeroom_teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL;

COMMENT ON COLUMN class_groups.homeroom_teacher_id IS
  'Professora regente: conduz as rotinas (slots ROUTINE) da grade da turma e fica ocupada nesses horários.';

-- Regentes da Unidade II (ver scripts/seed-unidade2.mjs).
UPDATE class_groups cg
SET homeroom_teacher_id = t.id
FROM (VALUES
  ('Infantil III', 'Geovanna'),
  ('Infantil IV',  'Patrícia'),
  ('Infantil V',   'Mariana (Infantil V)'),
  ('1º Ano',       'Laine'),
  ('2º Ano',       'Jackeline'),
  ('3º Ano A',     'Sarah'),
  ('3º Ano B',     'Rosângela'),
  ('4º Ano',       'Lilian'),
  ('5º Ano A',     'Evani'),
  ('5º Ano B',     'Evani')
) AS r(turma, regente)
JOIN teachers t ON t.name = r.regente
JOIN school_units su ON su.code = 'U2CAFN'
WHERE cg.name = r.turma
  AND cg.school_unit_id = su.id
  AND t.tenant_id = cg.tenant_id
  AND cg.homeroom_teacher_id IS NULL;
