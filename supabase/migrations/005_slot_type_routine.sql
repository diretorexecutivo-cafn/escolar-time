-- Novo tipo de slot: ROUTINE (rotina) — atividade fixa da grade que não é intervalo
-- nem disciplina (ex.: leitura em voz alta, higienização, parquinho no Infantil).
-- Fica fora da alocação, como o intervalo, mas é exibida com o próprio rótulo.

ALTER TABLE time_slots DROP CONSTRAINT IF EXISTS time_slots_type_check;
ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_type_check CHECK (type IN ('LESSON', 'BREAK', 'ROUTINE'));

-- Os slots do Infantil que a importação da Unidade II gravou como intervalo rotulado
-- (BREAK) mas que não são intervalo passam a ser rotina. "Intervalo" e
-- "Intervalo / Parquinho" continuam como intervalo.
UPDATE time_slots ts
SET type = 'ROUTINE'
FROM time_grids tg
JOIN class_groups cg ON cg.id = tg.class_group_id
WHERE ts.time_grid_id = tg.id
  AND ts.type = 'BREAK'
  AND cg.name LIKE 'Infantil%'
  AND ts.label IN ('Higienização', 'Leitura em Voz Alta', 'Parquinho', 'Rotina Diária / Mural e Bits');
