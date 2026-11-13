-- Vigência das grades horárias (ex.: "2026/2"). Funciona como uma pasta: a tela de
-- grades agrupa por ela e a geração de horário escolhe qual vigência usar. Uma turma
-- pode ter uma grade por vigência.

ALTER TABLE time_grids ADD COLUMN IF NOT EXISTS vigencia text;

-- As grades importadas trazem a vigência no fim do nome ("Grade 1º Ano — 2026/2").
UPDATE time_grids
SET vigencia = substring(name from '(\d{4}/\d+)\s*$')
WHERE vigencia IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_grids_vigencia ON time_grids (tenant_id, vigencia);
