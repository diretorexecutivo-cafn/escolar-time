-- =============================================================================
-- 002 — Aulas agrupadas (turmas que ocupam o mesmo tempo de aula)
-- =============================================================================
-- Educação Física e Projeto de Vida juntam 2–3 turmas sob o mesmo professor no
-- mesmo horário; Inglês do Fundamental II junta duas turmas em nivelamento com
-- duas professoras. Sem marcação, o validador enxerga isso como conflito.
--
-- Semântica: class_subjects que compartilham o mesmo group_key (não nulo) são
-- ministradas simultaneamente. Entre elas, o motor deve ignorar conflito de
-- professor e de turma, e alocá-las sempre no mesmo dia/slot.
-- -----------------------------------------------------------------------------

ALTER TABLE class_subjects
  ADD COLUMN IF NOT EXISTS group_key text;

COMMENT ON COLUMN class_subjects.group_key IS
  'Aulas agrupadas: class_subjects com o mesmo group_key ocorrem no mesmo dia/slot. '
  'Conflitos de professor e de turma entre elas devem ser ignorados pelo validador.';

CREATE INDEX IF NOT EXISTS idx_class_subjects_group_key
  ON class_subjects (group_key)
  WHERE group_key IS NOT NULL;
