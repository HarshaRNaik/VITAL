
BEGIN;

-- ============================================================
-- VITAL FITNESS
-- FITNESS TRACKING ENGINES
-- ============================================================

-- 1. USER SETTINGS
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS hydration_target_ml integer
    CHECK (hydration_target_ml BETWEEN 250 AND 10000),
  ADD COLUMN IF NOT EXISTS hydration_unit varchar(12)
    NOT NULL DEFAULT 'ml'
    CHECK (hydration_unit IN ('ml', 'oz')),
  ADD COLUMN IF NOT EXISTS fasting_schedule jsonb,
  ADD COLUMN IF NOT EXISTS reminder_preferences jsonb
    NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(reminder_preferences) = 'object'),
  ADD COLUMN IF NOT EXISTS daily_calorie_target integer
    CHECK (daily_calorie_target BETWEEN 1200 AND 8000),
  ADD COLUMN IF NOT EXISTS protein_target_grams integer
    CHECK (protein_target_grams BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS carbs_target_grams integer
    CHECK (carbs_target_grams BETWEEN 0 AND 2000),
  ADD COLUMN IF NOT EXISTS fat_target_grams integer
    CHECK (fat_target_grams BETWEEN 0 AND 1000);

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_macro_targets_complete;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_macro_targets_complete
  CHECK (
    (
      protein_target_grams IS NULL
      AND carbs_target_grams IS NULL
      AND fat_target_grams IS NULL
    )
    OR
    (
      protein_target_grams IS NOT NULL
      AND carbs_target_grams IS NOT NULL
      AND fat_target_grams IS NOT NULL
    )
  );

-- 2. BODY MEASUREMENTS
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_type varchar(24) NOT NULL
    CHECK (measurement_type IN
      ('height','waist','hip','chest','neck','arm','thigh')),
  value double precision NOT NULL CHECK (value > 0 AND value <= 300),
  unit varchar(4) NOT NULL CHECK (unit IN ('cm','in')),
  measured_on date NOT NULL,
  client_request_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id)
);

-- 3. ACTIVITY SESSIONS
CREATE TABLE IF NOT EXISTS public.activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type varchar(20) NOT NULL
    CHECK (activity_type IN
      ('walking','running','jogging','cycling','indoor_cardio','treadmill')),
  source varchar(12) NOT NULL CHECK (source IN ('manual','device')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL
    CHECK (duration_seconds BETWEEN 1 AND 604800),
  distance_km double precision
    CHECK (distance_km IS NULL OR distance_km BETWEEN 0 AND 100000),
  pace_seconds_per_km integer
    CHECK (pace_seconds_per_km IS NULL OR pace_seconds_per_km BETWEEN 1 AND 604800),
  speed_kph double precision
    CHECK (speed_kph IS NULL OR speed_kph BETWEEN 0 AND 1000),
  calories integer CHECK (calories IS NULL OR calories BETWEEN 0 AND 100000),
  calories_estimated boolean NOT NULL DEFAULT false,
  steps integer CHECK (steps IS NULL OR steps BETWEEN 0 AND 1000000),
  recorded_on date NOT NULL,
  client_request_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id),
  CHECK (ended_at > started_at),
  CHECK (
    (distance_km IS NULL AND pace_seconds_per_km IS NULL AND speed_kph IS NULL)
    OR
    (distance_km > 0 AND pace_seconds_per_km > 0 AND speed_kph > 0)
  )
);

-- 4. HYDRATION LOGS
CREATE TABLE IF NOT EXISTS public.hydration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ml integer NOT NULL CHECK (amount_ml BETWEEN 1 AND 10000),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  recorded_on date NOT NULL,
  client_request_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id)
);

-- 5. FITNESS HABITS
CREATE TABLE IF NOT EXISTS public.fitness_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  category varchar(24) NOT NULL
    CHECK (category IN
      ('workout','walking','hydration','stretching','nutrition',
       'recovery','meditation','custom')),
  schedule_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::smallint[]
    CHECK (
      array_position(schedule_days, null) IS NULL
      AND schedule_days <@ array[0,1,2,3,4,5,6]::smallint[]
    ),
  active boolean NOT NULL DEFAULT true,
  reminder jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(reminder) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. HABIT COMPLETIONS
CREATE TABLE IF NOT EXISTS public.habit_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.fitness_habits(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  client_request_id varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, habit_id, completed_on),
  UNIQUE (user_id, client_request_id)
);

-- 7. FASTING SESSIONS
CREATE TABLE IF NOT EXISTS public.fasting_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_hours integer NOT NULL CHECK (schedule_hours BETWEEN 1 AND 24),
  started_at timestamptz NOT NULL DEFAULT now(),
  target_ended_at timestamptz NOT NULL,
  ended_at timestamptz,
  status varchar(12) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_ended_at > started_at),
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR
    (status IN ('completed','cancelled') AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fasting_sessions_one_active_per_user
  ON public.fasting_sessions(user_id)
  WHERE status = 'active';

-- 8. FITNESS CHALLENGES
CREATE TABLE IF NOT EXISTS public.fitness_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  goal varchar(80) NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days IN (7,14,30)),
  schedule jsonb NOT NULL
    CHECK (
      CASE
        WHEN jsonb_typeof(schedule) = 'array'
        THEN jsonb_array_length(schedule) = duration_days
        ELSE false
      END
    ),
  started_on date NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled')),
  paused_at timestamptz,
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(status_history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. CHALLENGE COMPLETIONS
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL
    REFERENCES public.fitness_challenges(id) ON DELETE CASCADE,
  challenge_day integer NOT NULL CHECK (challenge_day BETWEEN 1 AND 30),
  completed_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, challenge_day)
);

-- 10. WORKOUT SESSION STATES
CREATE TABLE IF NOT EXISTS public.workout_session_states (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  status varchar(12) NOT NULL
    CHECK (status IN ('ready','running','paused','completed','cancelled')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pg_column_size(plan) + pg_column_size(state) <= 262144)
);

-- 11. INDEXES
CREATE INDEX IF NOT EXISTS body_measurements_user_date_idx
  ON public.body_measurements(user_id, measured_on DESC);

CREATE INDEX IF NOT EXISTS activity_sessions_user_date_idx
  ON public.activity_sessions(user_id, recorded_on DESC);

CREATE INDEX IF NOT EXISTS hydration_logs_user_date_idx
  ON public.hydration_logs(user_id, recorded_on DESC);

CREATE INDEX IF NOT EXISTS fitness_habits_user_active_idx
  ON public.fitness_habits(user_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS habit_completions_user_date_idx
  ON public.habit_completions(user_id, completed_on DESC);

CREATE INDEX IF NOT EXISTS fasting_sessions_user_started_idx
  ON public.fasting_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS fitness_challenges_user_started_idx
  ON public.fitness_challenges(user_id, started_on DESC);

CREATE INDEX IF NOT EXISTS challenge_completions_user_challenge_idx
  ON public.challenge_completions(user_id, challenge_id, challenge_day);

CREATE INDEX IF NOT EXISTS workout_session_states_user_updated_idx
  ON public.workout_session_states(user_id, updated_at DESC);

-- 12. UPDATED-AT TRIGGERS
DROP TRIGGER IF EXISTS fitness_habits_updated_at ON public.fitness_habits;
CREATE TRIGGER fitness_habits_updated_at
  BEFORE UPDATE ON public.fitness_habits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS fitness_challenges_updated_at ON public.fitness_challenges;
CREATE TRIGGER fitness_challenges_updated_at
  BEFORE UPDATE ON public.fitness_challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS workout_session_states_updated_at ON public.workout_session_states;
CREATE TRIGGER workout_session_states_updated_at
  BEFORE UPDATE ON public.workout_session_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. ENABLE RLS
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hydration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitness_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_session_states ENABLE ROW LEVEL SECURITY;

-- 14. SAFE POLICY CREATION
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='body_measurements' AND policyname='body_measurements_own') THEN
    CREATE POLICY body_measurements_own ON public.body_measurements FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_sessions' AND policyname='activity_sessions_own') THEN
    CREATE POLICY activity_sessions_own ON public.activity_sessions FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hydration_logs' AND policyname='hydration_logs_own') THEN
    CREATE POLICY hydration_logs_own ON public.hydration_logs FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fitness_habits' AND policyname='fitness_habits_own') THEN
    CREATE POLICY fitness_habits_own ON public.fitness_habits FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habit_completions' AND policyname='habit_completions_own') THEN
    CREATE POLICY habit_completions_own ON public.habit_completions FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.fitness_habits h WHERE h.id = habit_id AND h.user_id = (SELECT auth.uid())));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fasting_sessions' AND policyname='fasting_sessions_own') THEN
    CREATE POLICY fasting_sessions_own ON public.fasting_sessions FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fitness_challenges' AND policyname='fitness_challenges_own') THEN
    CREATE POLICY fitness_challenges_own ON public.fitness_challenges FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='challenge_completions' AND policyname='challenge_completions_own') THEN
    CREATE POLICY challenge_completions_own ON public.challenge_completions FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.fitness_challenges c WHERE c.id = challenge_id AND c.user_id = (SELECT auth.uid())));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workout_session_states' AND policyname='workout_session_states_own') THEN
    CREATE POLICY workout_session_states_own ON public.workout_session_states FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- 15. CHALLENGE STATUS FUNCTION
CREATE OR REPLACE FUNCTION public.set_fitness_challenge_status(
  p_challenge_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_challenge public.fitness_challenges%rowtype;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode='42501', message='Authentication required';
  END IF;

  IF p_status IS NULL OR p_status NOT IN
    ('active','paused','completed','cancelled') THEN
    RAISE EXCEPTION USING errcode='22023', message='Invalid challenge status';
  END IF;

  SELECT * INTO v_challenge
  FROM public.fitness_challenges
  WHERE id=p_challenge_id AND user_id=v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='42501', message='Challenge is not owned by the caller';
  END IF;

  IF v_challenge.status=p_status THEN
    RETURN to_jsonb(v_challenge);
  END IF;

  IF NOT (
    (v_challenge.status='active' AND p_status IN ('paused','completed','cancelled'))
    OR
    (v_challenge.status='paused' AND p_status IN ('active','cancelled'))
  ) THEN
    RAISE EXCEPTION USING errcode='22023', message='Invalid challenge status transition';
  END IF;

  UPDATE public.fitness_challenges
  SET status=p_status,
      paused_at=CASE
        WHEN p_status='paused' THEN v_now
        WHEN p_status='active' THEN NULL
        ELSE paused_at
      END,
      status_history=status_history || jsonb_build_array(
        jsonb_build_object('from',v_challenge.status,'to',p_status,'at',v_now)
      )
  WHERE id=p_challenge_id AND user_id=v_user_id
  RETURNING * INTO v_challenge;

  RETURN to_jsonb(v_challenge);
END;
$$;

REVOKE ALL ON FUNCTION public.set_fitness_challenge_status(uuid,text)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.set_fitness_challenge_status(uuid,text)
  TO authenticated;

-- 16. TABLE PERMISSIONS
REVOKE ALL ON
  public.body_measurements,
  public.activity_sessions,
  public.hydration_logs,
  public.fitness_habits,
  public.habit_completions,
  public.fasting_sessions,
  public.fitness_challenges,
  public.challenge_completions,
  public.workout_session_states
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.body_measurements,
  public.activity_sessions,
  public.hydration_logs,
  public.fitness_habits,
  public.habit_completions,
  public.fasting_sessions,
  public.fitness_challenges,
  public.challenge_completions,
  public.workout_session_states
TO authenticated;

COMMIT;
