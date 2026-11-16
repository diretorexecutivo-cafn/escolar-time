-- Visualizador (VIEWER) passa a ser de fato somente consulta.
--
-- Até aqui as políticas de escrita só conferiam o tenant, então qualquer papel
-- criava, editava e excluía tudo. Agora INSERT/UPDATE/DELETE exigem ADMIN ou
-- COORDINATOR; a leitura (SELECT) continua aberta a todo usuário ativo do tenant.
--
-- Isso permite liberar o login com Google para todo o domínio da escola: quem
-- entra pela primeira vez ganha um perfil VIEWER (criado em /auth/callback) e o
-- administrador promove quem precisar editar.
--
-- profiles e audit_log já foram restritos na migration 008 (só ADMIN).

CREATE OR REPLACE FUNCTION auth_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND active AND role IN ('ADMIN', 'COORDINATOR')
  )
$$;

-- ---------------------------------------------------------------------------
-- tenants: só ADMIN altera os dados da escola
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenants_insert ON tenants;
DROP POLICY IF EXISTS tenants_update ON tenants;

CREATE POLICY tenants_insert ON tenants
  FOR INSERT TO authenticated
  WITH CHECK (id = auth_tenant_id() AND auth_is_admin());

CREATE POLICY tenants_update ON tenants
  FOR UPDATE TO authenticated
  USING (id = auth_tenant_id() AND auth_is_admin())
  WITH CHECK (id = auth_tenant_id() AND auth_is_admin());

-- ---------------------------------------------------------------------------
-- Tabelas com tenant_id próprio
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t    text;
  cond text := 'tenant_id = auth_tenant_id() AND auth_can_edit()';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'school_units', 'subjects', 'class_groups', 'teachers', 'time_grids',
    'teacher_constraints', 'global_rules', 'generated_schedules'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)',
      t || '_insert', t, cond);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_update', t, cond, cond);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)',
      t || '_delete', t, cond);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas que herdam o tenant da tabela-pai
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r    record;
  cond text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('class_subjects',       'class_groups',        'class_group_id'),
      ('teaching_assignments', 'teachers',            'teacher_id'),
      ('time_slots',           'time_grids',          'time_grid_id'),
      ('schedule_entries',     'generated_schedules', 'generated_schedule_id')
    ) AS v(child, parent, fk)
  LOOP
    cond := format(
      'auth_can_edit() AND EXISTS (SELECT 1 FROM %I p WHERE p.id = %I.%I AND p.tenant_id = auth_tenant_id())',
      r.parent, r.child, r.fk);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.child || '_insert', r.child);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.child || '_update', r.child);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.child || '_delete', r.child);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)',
      r.child || '_insert', r.child, cond);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      r.child || '_update', r.child, cond, cond);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)',
      r.child || '_delete', r.child, cond);
  END LOOP;
END;
$$;
