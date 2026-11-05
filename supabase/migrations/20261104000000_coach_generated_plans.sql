
-- ============================================================
-- VITAL FITNESS
-- Coach Generated Plans Migration
-- Preserves existing assistant rate-limit wrapper
-- ============================================================

-- 1. Add dietary preference
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS dietary_preference VARCHAR(500) NOT NULL DEFAULT '';

-- 2. Allow longer assistant messages
ALTER TABLE public.assistant_messages
  ALTER COLUMN content TYPE TEXT;

-- 3. Create workout programs
CREATE TABLE IF NOT EXISTS public.workout_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  difficulty VARCHAR(20) NOT NULL
    CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  days JSONB NOT NULL
    CHECK (
      CASE
        WHEN jsonb_typeof(days) = 'array'
        THEN jsonb_array_length(days) BETWEEN 1 AND 7
        ELSE FALSE
      END
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, draft_id)
);

-- 4. Create nutrition plans
CREATE TABLE IF NOT EXISTS public.nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  dietary_notes VARCHAR(500) NOT NULL DEFAULT '',
  days JSONB NOT NULL
    CHECK (
      CASE
        WHEN jsonb_typeof(days) = 'array'
        THEN jsonb_array_length(days) BETWEEN 1 AND 7
        ELSE FALSE
      END
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, draft_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS workout_programs_user_created_idx
  ON public.workout_programs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS nutrition_plans_user_created_idx
  ON public.nutrition_plans(user_id, created_at DESC);

-- 6. Updated-at triggers
DROP TRIGGER IF EXISTS workout_programs_updated_at
  ON public.workout_programs;

CREATE TRIGGER workout_programs_updated_at
  BEFORE UPDATE ON public.workout_programs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS nutrition_plans_updated_at
  ON public.nutrition_plans;

CREATE TRIGGER nutrition_plans_updated_at
  BEFORE UPDATE ON public.nutrition_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7. Enable Row Level Security
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;

-- 8. Ownership policies
CREATE POLICY workout_programs_own
  ON public.workout_programs
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY nutrition_plans_own
  ON public.nutrition_plans
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 9. Permissions
REVOKE ALL
  ON public.workout_programs, public.nutrition_plans
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.workout_programs, public.nutrition_plans
  TO authenticated;

-- IMPORTANT:
-- Existing public.save_assistant_exchange() is preserved.
-- Its production rate-limit wrapper is NOT replaced.
