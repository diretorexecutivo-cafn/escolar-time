-- =============================================================================
-- 004 — deleted_by sem FK para profiles
-- =============================================================================
-- Com created_by E deleted_by referenciando profiles, o embed `profiles(...)` em
-- generated_schedules fica ambíguo no PostgREST ("more than one relationship was
-- found") e quebra qualquer consulta que não nomeie a FK — inclusive versões
-- já publicadas do app. deleted_by segue guardando o id de quem apagou; o nome é
-- buscado à parte.
-- -----------------------------------------------------------------------------

ALTER TABLE generated_schedules
  DROP CONSTRAINT IF EXISTS generated_schedules_deleted_by_fkey;

COMMENT ON COLUMN generated_schedules.deleted_by IS
  'Id (profiles.id) de quem apagou. Sem FK de propósito: uma 2ª FK para profiles torna '
  'ambíguo o embed profiles(...) de created_by no PostgREST.';
