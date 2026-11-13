-- =============================================================================
-- 003 — Exclusão lógica de horários (histórico de apagados)
-- =============================================================================
-- Horários não são mais apagados fisicamente: some para o usuário, mas fica
-- registrado quem apagou, quando e por quê. As schedule_entries são mantidas,
-- então um horário apagado continua consultável por inteiro.
--
-- deleted_reason:
--   'manual'            — usuário clicou em Excluir
--   'replaced_by_edit'  — edição manual com "excluir o original"; replaced_by
--                         aponta para o novo horário
-- -----------------------------------------------------------------------------

ALTER TABLE generated_schedules
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by     uuid,  -- sem FK: ver 004
  ADD COLUMN IF NOT EXISTS deleted_reason text
    CHECK (deleted_reason IN ('manual', 'replaced_by_edit')),
  ADD COLUMN IF NOT EXISTS replaced_by    uuid REFERENCES generated_schedules(id);

COMMENT ON COLUMN generated_schedules.deleted_at IS
  'Exclusão lógica: preenchido = horário apagado (oculto da listagem, mantido no histórico).';

CREATE INDEX IF NOT EXISTS idx_generated_schedules_active
  ON generated_schedules (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Um horário apagado não pode continuar sendo o baseline.
UPDATE generated_schedules SET is_baseline = false WHERE deleted_at IS NOT NULL;
