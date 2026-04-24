-- =============================================================================
-- EscolarTime — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  email      text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('ADMIN', 'COORDINATOR', 'VIEWER')),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. school_units
-- ---------------------------------------------------------------------------
CREATE TABLE school_units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  code       text        NOT NULL,
  address    text,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TRIGGER school_units_updated_at
  BEFORE UPDATE ON school_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. subjects
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  code       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#048BA8',
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER subjects_updated_at
  BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. class_groups
-- ---------------------------------------------------------------------------
CREATE TABLE class_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_unit_id uuid        NOT NULL REFERENCES school_units(id),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  name           text        NOT NULL,
  shift          text        CHECK (shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  year           int         NOT NULL,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER class_groups_updated_at
  BEFORE UPDATE ON class_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. class_subjects
-- ---------------------------------------------------------------------------
CREATE TABLE class_subjects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id      uuid NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  subject_id          uuid NOT NULL REFERENCES subjects(id),
  weekly_lessons      int  NOT NULL,
  allow_double_lesson boolean NOT NULL DEFAULT false,
  max_double_lessons  int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_group_id, subject_id)
);

CREATE TRIGGER class_subjects_updated_at
  BEFORE UPDATE ON class_subjects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. teachers
-- ---------------------------------------------------------------------------
CREATE TABLE teachers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id),
  name               text        NOT NULL,
  email              text,
  phone              text,
  max_daily_lessons  int,
  max_weekly_lessons int,
  active             boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. teaching_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE teaching_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       uuid NOT NULL REFERENCES teachers(id),
  class_subject_id uuid NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_subject_id)
);

CREATE TRIGGER teaching_assignments_updated_at
  BEFORE UPDATE ON teaching_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. time_grids
-- ---------------------------------------------------------------------------
CREATE TABLE time_grids (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_unit_id uuid        NOT NULL REFERENCES school_units(id),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  name           text        NOT NULL,
  shift          text        CHECK (shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  days_of_week   int[]       NOT NULL,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER time_grids_updated_at
  BEFORE UPDATE ON time_grids
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. time_slots
-- ---------------------------------------------------------------------------
CREATE TABLE time_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_grid_id uuid NOT NULL REFERENCES time_grids(id) ON DELETE CASCADE,
  slot_order   int  NOT NULL,
  start_time   text NOT NULL,
  end_time     text NOT NULL,
  type         text CHECK (type IN ('LESSON', 'BREAK')),
  label        text,
  UNIQUE (time_grid_id, slot_order)
);

-- ---------------------------------------------------------------------------
-- 11. teacher_constraints
-- ---------------------------------------------------------------------------
CREATE TABLE teacher_constraints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     uuid        NOT NULL REFERENCES teachers(id),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  type           text        NOT NULL,
  priority       text        CHECK (priority IN ('MANDATORY', 'PREFERRED')),
  days_of_week   int[],
  school_unit_id uuid        REFERENCES school_units(id),
  subject_id     uuid        REFERENCES subjects(id),
  time_from      text,
  time_to        text,
  slot_order     int,
  min_gap_slots  int,
  value          jsonb,
  description    text,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER teacher_constraints_updated_at
  BEFORE UPDATE ON teacher_constraints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. global_rules
-- ---------------------------------------------------------------------------
CREATE TABLE global_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  type        text        NOT NULL,
  priority    text        CHECK (priority IN ('MANDATORY', 'PREFERRED')),
  weight      float       NOT NULL DEFAULT 1.0,
  params      jsonb,
  description text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER global_rules_updated_at
  BEFORE UPDATE ON global_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. generated_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE generated_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  name             text        NOT NULL,
  config_snapshot  jsonb,
  status           text        CHECK (status IN ('GENERATING', 'COMPLETED', 'FAILED')),
  score            float,
  violations       jsonb,
  is_baseline      boolean     NOT NULL DEFAULT false,
  baseline_weight  float       NOT NULL DEFAULT 0.7,
  created_by       uuid        REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER generated_schedules_updated_at
  BEFORE UPDATE ON generated_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 14. schedule_entries
-- ---------------------------------------------------------------------------
CREATE TABLE schedule_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_schedule_id   uuid    NOT NULL REFERENCES generated_schedules(id) ON DELETE CASCADE,
  teaching_assignment_id  uuid    NOT NULL REFERENCES teaching_assignments(id),
  day_of_week             int     NOT NULL,
  time_slot_id            uuid    NOT NULL REFERENCES time_slots(id),
  locked                  boolean NOT NULL DEFAULT false,
  UNIQUE (generated_schedule_id, teaching_assignment_id, day_of_week, time_slot_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_profiles_tenant_id              ON profiles (tenant_id);
CREATE INDEX idx_school_units_tenant_id          ON school_units (tenant_id);
CREATE INDEX idx_subjects_tenant_id              ON subjects (tenant_id);
CREATE INDEX idx_class_groups_tenant_id          ON class_groups (tenant_id);
CREATE INDEX idx_class_groups_school_unit_id     ON class_groups (school_unit_id);
CREATE INDEX idx_class_subjects_class_group_id   ON class_subjects (class_group_id);
CREATE INDEX idx_teachers_tenant_id              ON teachers (tenant_id);
CREATE INDEX idx_teaching_assignments_teacher_id ON teaching_assignments (teacher_id);
CREATE INDEX idx_time_grids_tenant_id            ON time_grids (tenant_id);
CREATE INDEX idx_time_grids_school_unit_id       ON time_grids (school_unit_id);
CREATE INDEX idx_time_slots_time_grid_id         ON time_slots (time_grid_id);
CREATE INDEX idx_teacher_constraints_tenant_id   ON teacher_constraints (tenant_id);
CREATE INDEX idx_teacher_constraints_teacher_id  ON teacher_constraints (teacher_id);
CREATE INDEX idx_global_rules_tenant_id          ON global_rules (tenant_id);
CREATE INDEX idx_generated_schedules_tenant_id   ON generated_schedules (tenant_id);
CREATE INDEX idx_schedule_entries_schedule_id    ON schedule_entries (generated_schedule_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_units          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_grids            ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_constraints   ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries      ENABLE ROW LEVEL SECURITY;

-- Helper: retorna o tenant_id do usuário autenticado
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- tenants: usuário só vê seu próprio tenant
-- ---------------------------------------------------------------------------
CREATE POLICY tenants_select ON tenants
  FOR SELECT TO authenticated
  USING (id = auth_tenant_id());

CREATE POLICY tenants_insert ON tenants
  FOR INSERT TO authenticated
  WITH CHECK (id = auth_tenant_id());

CREATE POLICY tenants_update ON tenants
  FOR UPDATE TO authenticated
  USING (id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- school_units
-- ---------------------------------------------------------------------------
CREATE POLICY school_units_select ON school_units
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY school_units_insert ON school_units
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY school_units_update ON school_units
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY school_units_delete ON school_units
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
CREATE POLICY subjects_select ON subjects
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY subjects_insert ON subjects
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY subjects_update ON subjects
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY subjects_delete ON subjects
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- class_groups
-- ---------------------------------------------------------------------------
CREATE POLICY class_groups_select ON class_groups
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY class_groups_insert ON class_groups
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY class_groups_update ON class_groups
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY class_groups_delete ON class_groups
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- class_subjects (sem tenant_id direto — join via class_groups)
-- ---------------------------------------------------------------------------
CREATE POLICY class_subjects_select ON class_subjects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_groups cg
      WHERE cg.id = class_group_id
        AND cg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY class_subjects_insert ON class_subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM class_groups cg
      WHERE cg.id = class_group_id
        AND cg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY class_subjects_update ON class_subjects
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_groups cg
      WHERE cg.id = class_group_id
        AND cg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY class_subjects_delete ON class_subjects
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_groups cg
      WHERE cg.id = class_group_id
        AND cg.tenant_id = auth_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- teachers
-- ---------------------------------------------------------------------------
CREATE POLICY teachers_select ON teachers
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY teachers_insert ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY teachers_update ON teachers
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY teachers_delete ON teachers
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- teaching_assignments (join via teachers)
-- ---------------------------------------------------------------------------
CREATE POLICY teaching_assignments_select ON teaching_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY teaching_assignments_insert ON teaching_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY teaching_assignments_update ON teaching_assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY teaching_assignments_delete ON teaching_assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.tenant_id = auth_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- time_grids
-- ---------------------------------------------------------------------------
CREATE POLICY time_grids_select ON time_grids
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY time_grids_insert ON time_grids
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY time_grids_update ON time_grids
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY time_grids_delete ON time_grids
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- time_slots (join via time_grids)
-- ---------------------------------------------------------------------------
CREATE POLICY time_slots_select ON time_slots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM time_grids tg
      WHERE tg.id = time_grid_id
        AND tg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY time_slots_insert ON time_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM time_grids tg
      WHERE tg.id = time_grid_id
        AND tg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY time_slots_update ON time_slots
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM time_grids tg
      WHERE tg.id = time_grid_id
        AND tg.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY time_slots_delete ON time_slots
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM time_grids tg
      WHERE tg.id = time_grid_id
        AND tg.tenant_id = auth_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- teacher_constraints
-- ---------------------------------------------------------------------------
CREATE POLICY teacher_constraints_select ON teacher_constraints
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY teacher_constraints_insert ON teacher_constraints
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY teacher_constraints_update ON teacher_constraints
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY teacher_constraints_delete ON teacher_constraints
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- global_rules
-- ---------------------------------------------------------------------------
CREATE POLICY global_rules_select ON global_rules
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY global_rules_insert ON global_rules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY global_rules_update ON global_rules
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY global_rules_delete ON global_rules
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- generated_schedules
-- ---------------------------------------------------------------------------
CREATE POLICY generated_schedules_select ON generated_schedules
  FOR SELECT TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY generated_schedules_insert ON generated_schedules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY generated_schedules_update ON generated_schedules
  FOR UPDATE TO authenticated
  USING (tenant_id = auth_tenant_id());

CREATE POLICY generated_schedules_delete ON generated_schedules
  FOR DELETE TO authenticated
  USING (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- schedule_entries (join via generated_schedules)
-- ---------------------------------------------------------------------------
CREATE POLICY schedule_entries_select ON schedule_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM generated_schedules gs
      WHERE gs.id = generated_schedule_id
        AND gs.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY schedule_entries_insert ON schedule_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM generated_schedules gs
      WHERE gs.id = generated_schedule_id
        AND gs.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY schedule_entries_update ON schedule_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM generated_schedules gs
      WHERE gs.id = generated_schedule_id
        AND gs.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY schedule_entries_delete ON schedule_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM generated_schedules gs
      WHERE gs.id = generated_schedule_id
        AND gs.tenant_id = auth_tenant_id()
    )
  );

-- =============================================================================
-- Seed: tenant padrão de desenvolvimento
-- =============================================================================

INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Tenant Dev', 'dev')
ON CONFLICT (id) DO NOTHING;
