-- Gestão de usuários + histórico de alterações (audit log).
--
-- 1. Usuário desativado (profiles.active = false) perde o acesso: auth_tenant_id()
--    passa a ignorá-lo, então todas as políticas de RLS deixam de enxergar dados.
-- 2. Só ADMIN cria/edita perfis (antes qualquer usuário podia mudar o próprio papel).
-- 3. audit_log: uma linha por registro criado/alterado/excluído em qualquer tabela
--    do sistema, com quem fez e o antes/depois. Gravado por trigger, então nenhuma
--    tela consegue "esquecer" de registrar. Só ADMIN lê; ninguém edita ou apaga.

-- ---------------------------------------------------------------------------
-- 1. Helpers de sessão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND active AND role = 'ADMIN'
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. profiles: só ADMIN cria e edita
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;

CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id() AND auth_is_admin());

CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id() AND auth_is_admin())
  WITH CHECK (tenant_id = auth_tenant_id() AND auth_is_admin());

-- ---------------------------------------------------------------------------
-- 3. audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  -- Sem FK (como deleted_by, migration 004): o histórico sobrevive ao usuário.
  actor_id       uuid,
  actor_name     text,
  actor_email    text,
  action         text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text        NOT NULL,
  record_id      uuid,
  record_label   text,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time  ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time   ON audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record       ON audit_log (table_name, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id() AND auth_is_admin());

-- Somente leitura para clientes: as linhas entram apenas pelo trigger.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trigger de auditoria
-- ---------------------------------------------------------------------------
-- Quem fez: o usuário logado (auth.uid()). As rotas de API que gravam com a
-- service-role key informam o usuário no cabeçalho x-actor-id; o cabeçalho só é
-- aceito quando a requisição veio de fato com a service-role key. Alterações
-- feitas direto no banco (SQL, migrações) ficam com actor_id nulo = "Sistema".
CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_actor   uuid;
  v_claims  jsonb;
  v_tenant  uuid;
  v_label   text;
  v_name    text;
  v_email   text;
  -- Colunas grandes que não ajudam a entender a alteração.
  v_omit    text[] := ARRAY['config_snapshot', 'violations'];
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := coalesce(v_new, v_old);

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed
      FROM jsonb_each(v_new) n
     WHERE n.key <> 'updated_at'
       AND n.value IS DISTINCT FROM v_old -> n.key;

    -- Nada mudou de fato (ex.: só updated_at): não polui o histórico.
    IF v_changed IS NULL THEN
      RETURN NULL;
    END IF;

    -- Em alterações guarda só o antes/depois do que mudou.
    SELECT jsonb_object_agg(key, v_old -> key), jsonb_object_agg(key, v_new -> key)
      INTO v_old, v_new
      FROM unnest(v_changed) AS key;
  END IF;

  v_old := v_old - v_omit;
  v_new := v_new - v_omit;

  -- Autor
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    BEGIN
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
      IF v_claims ->> 'role' = 'service_role' THEN
        v_actor := nullif(
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id',
          ''
        )::uuid;
      END IF;
    EXCEPTION WHEN others THEN
      v_actor := NULL;
    END;
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT name, email INTO v_name, v_email FROM profiles WHERE id = v_actor;
  END IF;

  -- Tenant
  v_tenant := CASE TG_TABLE_NAME
    WHEN 'tenants' THEN (v_row ->> 'id')::uuid
    ELSE (v_row ->> 'tenant_id')::uuid
  END;

  IF v_tenant IS NULL THEN
    v_tenant := CASE TG_TABLE_NAME
      WHEN 'class_subjects' THEN
        (SELECT tenant_id FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid)
      WHEN 'teaching_assignments' THEN
        (SELECT tenant_id FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid)
      WHEN 'time_slots' THEN
        (SELECT tenant_id FROM time_grids WHERE id = (v_row ->> 'time_grid_id')::uuid)
    END;
  END IF;

  IF v_tenant IS NULL AND v_actor IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM profiles WHERE id = v_actor;
  END IF;

  -- Nome legível do registro (gravado agora: o registro pode deixar de existir).
  v_label := CASE TG_TABLE_NAME
    WHEN 'class_subjects' THEN concat_ws(' · ',
      (SELECT name FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid),
      (SELECT name FROM subjects     WHERE id = (v_row ->> 'subject_id')::uuid))
    WHEN 'teaching_assignments' THEN concat_ws(' · ',
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      (SELECT concat_ws(' · ', cg.name, s.name)
         FROM class_subjects cs
         JOIN class_groups cg ON cg.id = cs.class_group_id
         JOIN subjects s      ON s.id  = cs.subject_id
        WHERE cs.id = (v_row ->> 'class_subject_id')::uuid))
    WHEN 'time_slots' THEN concat_ws(' · ',
      (SELECT name FROM time_grids WHERE id = (v_row ->> 'time_grid_id')::uuid),
      nullif(v_row ->> 'label', ''),
      left(v_row ->> 'start_time', 5) || '–' || left(v_row ->> 'end_time', 5))
    WHEN 'teacher_constraints' THEN concat_ws(' · ',
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      coalesce(nullif(v_row ->> 'description', ''), v_row ->> 'type'))
    WHEN 'global_rules' THEN
      coalesce(nullif(v_row ->> 'description', ''), v_row ->> 'type')
    ELSE v_row ->> 'name'
  END;

  INSERT INTO audit_log (
    tenant_id, actor_id, actor_name, actor_email, action, table_name,
    record_id, record_label, changed_fields, old_data, new_data
  ) VALUES (
    v_tenant, v_actor, v_name, v_email, TG_OP, TG_TABLE_NAME,
    (v_row ->> 'id')::uuid, nullif(v_label, ''), v_changed, v_old, v_new
  );

  RETURN NULL;
END;
$$;

-- schedule_entries fica de fora: cada horário gerado/salvo grava centenas de aulas
-- de uma vez, e a criação/edição/exclusão do horário já é registrada em
-- generated_schedules.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'profiles', 'school_units', 'subjects', 'class_groups',
    'class_subjects', 'teachers', 'teaching_assignments', 'time_grids',
    'time_slots', 'teacher_constraints', 'global_rules', 'generated_schedules'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
      t || '_audit', t
    );
  END LOOP;
END;
$$;
