alter table public.fitness_goals
  add column client_request_id varchar(100);

create unique index fitness_goals_user_request_idx
  on public.fitness_goals(user_id, client_request_id);

alter table public.workout_plan_exercises
  drop constraint workout_plan_exercises_sequence_check;
alter table public.workout_plan_exercises
  add constraint workout_plan_exercises_sequence_check check (sequence >= 0) not valid;

alter table public.workouts
  add constraint workouts_input_bounds_check check (
    btrim(type) <> ''
    and btrim(name) <> ''
    and duration <= 1440
    and (duration_seconds is null or duration_seconds between 1 and 86400)
    and calories <= 1000000
    and (planned_duration_minutes is null or planned_duration_minutes <= 1440)
    and (exercises_completed is null or exercises_completed <= 1000)
    and (sets_completed is null or sets_completed <= 5000)
  ) not valid;

alter table public.workout_sets
  add constraint workout_sets_input_bounds_check check (
    btrim(exercise_name) <> ''
    and (exercise_sequence is null or exercise_sequence between 0 and 100)
    and set_number <= 100
    and (reps is null or reps <= 1000)
    and (weight_kg is null or weight_kg <= 1000000)
    and (duration_seconds is null or duration_seconds between 1 and 86400)
    and rest_seconds <= 3600
    and ((reps is null) <> (duration_seconds is null))
  ) not valid;

alter table public.nutrition_logs
  add constraint nutrition_logs_input_bounds_check check (
    btrim(name) <> ''
    and btrim(type) <> ''
    and btrim(quantity_unit) <> ''
    and quantity <= 100000
    and calories > 0
    and calories <= 1000000
    and protein <= 1000000
    and carbs <= 1000000
    and fat <= 1000000
  ) not valid;

alter table public.progress_metrics
  add constraint progress_metrics_input_bounds_check check (weight_kg <= 1000) not valid;

alter table public.workout_plans
  add constraint workout_plans_input_bounds_check check (
    btrim(name) <> ''
    and btrim(category) <> ''
    and difficulty in ('Beginner', 'Intermediate', 'Advanced')
  ) not valid;

alter table public.fitness_goals
  add constraint fitness_goals_input_bounds_check check (
    btrim(name) <> ''
    and metric in ('weight', 'workouts', 'training-minutes', 'custom')
    and target_value <= 1000000
    and btrim(unit) <> ''
  ) not valid;

create or replace function public.record_nutrition_log(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.nutrition_logs%rowtype;
  v_request_id text := p_item ->> 'client_request_id';
  v_game jsonb;
  v_duplicate boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_item) <> 'object'
    or p_item - array[
      'name', 'type', 'quantity', 'quantity_unit', 'calories', 'protein',
      'carbs', 'fat', 'nutrition_estimated', 'date', 'client_request_id'
    ] <> '{}'::jsonb
    or v_request_id is null or length(v_request_id) < 8 or length(v_request_id) > 100
    or nullif(btrim(p_item ->> 'name'), '') is null or length(p_item ->> 'name') > 120
    or nullif(btrim(p_item ->> 'type'), '') is null or length(p_item ->> 'type') > 40
    or length(coalesce(p_item ->> 'quantity_unit', 'serving')) > 40
    or nullif(btrim(coalesce(p_item ->> 'quantity_unit', 'serving')), '') is null then
    raise exception using errcode = '22023', message = 'Invalid nutrition log';
  end if;
  if coalesce((p_item ->> 'quantity')::numeric, 1) <= 0
    or coalesce((p_item ->> 'quantity')::numeric, 1) > 100000
    or (p_item ->> 'calories') is null
    or (p_item ->> 'calories')::numeric <= 0
    or (p_item ->> 'calories')::numeric > 1000000
    or coalesce((p_item ->> 'protein')::numeric, 0) < 0
    or coalesce((p_item ->> 'protein')::numeric, 0) > 1000000
    or coalesce((p_item ->> 'carbs')::numeric, 0) < 0
    or coalesce((p_item ->> 'carbs')::numeric, 0) > 1000000
    or coalesce((p_item ->> 'fat')::numeric, 0) < 0
    or coalesce((p_item ->> 'fat')::numeric, 0) > 1000000 then
    raise exception using errcode = '22023', message = 'Nutrition values are outside the allowed range';
  end if;
  if v_request_id !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception using errcode = '22023', message = 'Invalid activity request id';
  end if;

  begin
    insert into public.nutrition_logs (
      user_id, name, type, quantity, quantity_unit, calories, protein, carbs, fat,
      nutrition_estimated, date, client_request_id
    ) values (
      v_user_id,
      btrim(p_item ->> 'name'),
      btrim(p_item ->> 'type'),
      coalesce((p_item ->> 'quantity')::double precision, 1),
      btrim(coalesce(p_item ->> 'quantity_unit', 'serving')),
      (p_item ->> 'calories')::double precision,
      coalesce((p_item ->> 'protein')::double precision, 0),
      coalesce((p_item ->> 'carbs')::double precision, 0),
      coalesce((p_item ->> 'fat')::double precision, 0),
      coalesce((p_item ->> 'nutrition_estimated')::boolean, false),
      (p_item ->> 'date')::date,
      v_request_id
    ) returning * into v_row;
  exception when unique_violation then
    v_duplicate := true;
  end;

  if v_duplicate then
    select * into v_row from public.nutrition_logs
    where user_id = v_user_id and client_request_id = v_request_id;
    if not found then
      raise exception using errcode = '23505', message = 'Nutrition log already exists';
    end if;
  end if;
  v_game := public.grant_game_reward('meal', 'meal:' || v_row.id::text);
  return jsonb_build_object('item', to_jsonb(v_row), 'game', v_game, 'duplicate', v_duplicate);
end;
$$;

create or replace function public.record_progress_metric(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.progress_metrics%rowtype;
  v_request_id text := p_item ->> 'client_request_id';
  v_game jsonb;
  v_duplicate boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_item) <> 'object'
    or p_item - array['weight_kg', 'date', 'client_request_id'] <> '{}'::jsonb
    or v_request_id is null or v_request_id !~ '^[A-Za-z0-9_-]{8,100}$'
    or (p_item ->> 'weight_kg') is null
    or (p_item ->> 'weight_kg')::numeric <= 0
    or (p_item ->> 'weight_kg')::numeric > 1000
    or (p_item ->> 'date') is null then
    raise exception using errcode = '22023', message = 'Invalid progress metric';
  end if;

  begin
    insert into public.progress_metrics (user_id, weight_kg, date, client_request_id)
    values (v_user_id, (p_item ->> 'weight_kg')::double precision, (p_item ->> 'date')::date, v_request_id)
    returning * into v_row;
  exception when unique_violation then
    v_duplicate := true;
  end;

  if v_duplicate then
    select * into v_row from public.progress_metrics
    where user_id = v_user_id and client_request_id = v_request_id;
    if not found then
      raise exception using errcode = '23505', message = 'Progress metric already exists';
    end if;
  end if;
  v_game := public.grant_game_reward('weight', 'weight:' || v_row.id::text);
  return jsonb_build_object('item', to_jsonb(v_row), 'game', v_game, 'duplicate', v_duplicate);
end;
$$;

create or replace function public.record_completed_workout(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.workouts%rowtype;
  v_request_id text := p_item ->> 'session_id';
  v_set record;
  v_sets jsonb;
  v_game jsonb;
  v_duplicate boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_item) <> 'object'
    or p_item - array[
      'custom_plan_id', 'type', 'name', 'duration', 'duration_seconds', 'calories',
      'calories_estimated', 'date', 'plan_id', 'plan_category', 'course_session',
      'planned_duration_minutes', 'exercises_completed', 'sets_completed',
      'session_id', 'client_request_id', 'performed_sets'
    ] <> '{}'::jsonb
    or v_request_id is null or v_request_id !~ '^[A-Za-z0-9_-]{8,100}$'
    or nullif(btrim(p_item ->> 'type'), '') is null or length(p_item ->> 'type') > 40
    or nullif(btrim(p_item ->> 'name'), '') is null or length(p_item ->> 'name') > 120
    or (p_item ->> 'duration')::integer not between 1 and 1440
    or coalesce((p_item ->> 'calories')::numeric, 0) not between 0 and 1000000
    or (p_item ->> 'date') is null
    or jsonb_typeof(coalesce(p_item -> 'performed_sets', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_item -> 'performed_sets', '[]'::jsonb)) > 1000
    or (p_item ->> 'session_id') is distinct from (p_item ->> 'client_request_id') then
    raise exception using errcode = '22023', message = 'Invalid completed workout';
  end if;
  if p_item ->> 'custom_plan_id' is not null and not exists (
    select 1 from public.workout_plans
    where id = (p_item ->> 'custom_plan_id')::uuid and user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Workout plan is not owned by the caller';
  end if;

  begin
    insert into public.workouts (
      user_id, custom_plan_id, type, name, duration, duration_seconds, calories,
      calories_estimated, date, plan_id, plan_category, course_session,
      planned_duration_minutes, exercises_completed, sets_completed, session_id, client_request_id
    ) values (
      v_user_id, nullif(p_item ->> 'custom_plan_id', '')::uuid, btrim(p_item ->> 'type'),
      btrim(p_item ->> 'name'), (p_item ->> 'duration')::integer,
      nullif(p_item ->> 'duration_seconds', '')::integer,
      coalesce((p_item ->> 'calories')::double precision, 0),
      coalesce((p_item ->> 'calories_estimated')::boolean, false),
      (p_item ->> 'date')::date, p_item ->> 'plan_id', p_item ->> 'plan_category',
      p_item ->> 'course_session', nullif(p_item ->> 'planned_duration_minutes', '')::integer,
      nullif(p_item ->> 'exercises_completed', '')::integer,
      nullif(p_item ->> 'sets_completed', '')::integer, v_request_id, v_request_id
    ) returning * into v_row;
  exception when unique_violation then
    v_duplicate := true;
  end;

  if v_duplicate then
    select * into v_row from public.workouts
    where user_id = v_user_id and session_id = v_request_id;
    if not found then
      raise exception using errcode = '23505', message = 'Workout session already exists';
    end if;
  else
    for v_set in
      select value from jsonb_array_elements(coalesce(p_item -> 'performed_sets', '[]'::jsonb))
    loop
      insert into public.workout_sets (
        workout_id, exercise_id, exercise_sequence, exercise_name, set_number,
        reps, weight_kg, duration_seconds, rest_seconds
      ) values (
        v_row.id, v_set.value ->> 'exercise_id',
        nullif(v_set.value ->> 'exercise_sequence', '')::integer,
        v_set.value ->> 'exercise_name', (v_set.value ->> 'set_number')::integer,
        nullif(v_set.value ->> 'reps', '')::integer,
        nullif(v_set.value ->> 'weight_kg', '')::double precision,
        nullif(v_set.value ->> 'duration_seconds', '')::integer,
        coalesce((v_set.value ->> 'rest_seconds')::integer, 0)
      );
    end loop;
  end if;

  v_game := public.grant_game_reward('workout', 'workout:' || v_request_id);
  select coalesce(jsonb_agg(to_jsonb(s) order by s.exercise_sequence, s.set_number), '[]'::jsonb)
  into v_sets from public.workout_sets s where s.workout_id = v_row.id;
  return jsonb_build_object(
    'item', to_jsonb(v_row) || jsonb_build_object('workout_sets', v_sets),
    'game', v_game,
    'duplicate', v_duplicate
  );
end;
$$;

create or replace function public.update_completed_workout(p_workout_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.workouts%rowtype;
  v_set record;
  v_sets jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_workout_id is null or jsonb_typeof(p_item) <> 'object' or p_item = '{}'::jsonb
    or p_item - array[
      'custom_plan_id', 'type', 'name', 'duration', 'duration_seconds', 'calories',
      'calories_estimated', 'date', 'plan_id', 'plan_category', 'course_session',
      'planned_duration_minutes', 'exercises_completed', 'sets_completed', 'performed_sets'
    ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid workout update';
  end if;
  if p_item ? 'type' and (nullif(btrim(p_item ->> 'type'), '') is null or length(p_item ->> 'type') > 40)
    or p_item ? 'name' and (nullif(btrim(p_item ->> 'name'), '') is null or length(p_item ->> 'name') > 120)
    or p_item ? 'duration' and (p_item ->> 'duration')::integer not between 1 and 1440
    or p_item ? 'calories' and (p_item ->> 'calories')::numeric not between 0 and 1000000
    or p_item ? 'duration_seconds' and p_item ->> 'duration_seconds' is not null
      and (p_item ->> 'duration_seconds')::integer not between 1 and 86400
    or p_item ? 'planned_duration_minutes' and p_item ->> 'planned_duration_minutes' is not null
      and (p_item ->> 'planned_duration_minutes')::integer not between 1 and 1440
    or p_item ? 'exercises_completed' and p_item ->> 'exercises_completed' is not null
      and (p_item ->> 'exercises_completed')::integer not between 0 and 1000
    or p_item ? 'sets_completed' and p_item ->> 'sets_completed' is not null
      and (p_item ->> 'sets_completed')::integer not between 0 and 5000
    or p_item ? 'performed_sets' and (
      jsonb_typeof(p_item -> 'performed_sets') <> 'array'
      or jsonb_array_length(p_item -> 'performed_sets') > 1000
    ) then
    raise exception using errcode = '22023', message = 'Workout values are outside the allowed range';
  end if;

  select * into v_row from public.workouts
  where id = p_workout_id and user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Workout is not owned by the caller';
  end if;
  if p_item ? 'custom_plan_id' and p_item ->> 'custom_plan_id' is not null
    and not exists (
      select 1 from public.workout_plans
      where id = (p_item ->> 'custom_plan_id')::uuid and user_id = v_user_id
    ) then
    raise exception using errcode = '42501', message = 'Workout plan is not owned by the caller';
  end if;

  update public.workouts set
    custom_plan_id = case when p_item ? 'custom_plan_id' then nullif(p_item ->> 'custom_plan_id', '')::uuid else custom_plan_id end,
    type = case when p_item ? 'type' then btrim(p_item ->> 'type') else type end,
    name = case when p_item ? 'name' then btrim(p_item ->> 'name') else name end,
    duration = case when p_item ? 'duration' then (p_item ->> 'duration')::integer else duration end,
    duration_seconds = case when p_item ? 'duration_seconds' then nullif(p_item ->> 'duration_seconds', '')::integer else duration_seconds end,
    calories = case when p_item ? 'calories' then (p_item ->> 'calories')::double precision else calories end,
    calories_estimated = case when p_item ? 'calories_estimated' then (p_item ->> 'calories_estimated')::boolean else calories_estimated end,
    date = case when p_item ? 'date' then (p_item ->> 'date')::date else date end,
    plan_id = case when p_item ? 'plan_id' then p_item ->> 'plan_id' else plan_id end,
    plan_category = case when p_item ? 'plan_category' then p_item ->> 'plan_category' else plan_category end,
    course_session = case when p_item ? 'course_session' then p_item ->> 'course_session' else course_session end,
    planned_duration_minutes = case when p_item ? 'planned_duration_minutes' then nullif(p_item ->> 'planned_duration_minutes', '')::integer else planned_duration_minutes end,
    exercises_completed = case when p_item ? 'exercises_completed' then nullif(p_item ->> 'exercises_completed', '')::integer else exercises_completed end,
    sets_completed = case when p_item ? 'sets_completed' then nullif(p_item ->> 'sets_completed', '')::integer else sets_completed end
  where id = p_workout_id
  returning * into v_row;

  if p_item ? 'performed_sets' then
    delete from public.workout_sets where workout_id = p_workout_id;
    for v_set in select value from jsonb_array_elements(p_item -> 'performed_sets')
    loop
      insert into public.workout_sets (
        workout_id, exercise_id, exercise_sequence, exercise_name, set_number,
        reps, weight_kg, duration_seconds, rest_seconds
      ) values (
        p_workout_id, v_set.value ->> 'exercise_id',
        nullif(v_set.value ->> 'exercise_sequence', '')::integer,
        v_set.value ->> 'exercise_name', (v_set.value ->> 'set_number')::integer,
        nullif(v_set.value ->> 'reps', '')::integer,
        nullif(v_set.value ->> 'weight_kg', '')::double precision,
        nullif(v_set.value ->> 'duration_seconds', '')::integer,
        coalesce((v_set.value ->> 'rest_seconds')::integer, 0)
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.exercise_sequence, s.set_number), '[]'::jsonb)
  into v_sets from public.workout_sets s where s.workout_id = p_workout_id;
  return to_jsonb(v_row) || jsonb_build_object('workout_sets', v_sets);
end;
$$;

create or replace function public.save_workout_plan(p_plan_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_exercise jsonb;
  v_exercises jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_item) <> 'object'
    or p_item - array['name', 'description', 'category', 'difficulty', 'exercises'] <> '{}'::jsonb
    or nullif(btrim(p_item ->> 'name'), '') is null or length(p_item ->> 'name') > 120
    or length(coalesce(p_item ->> 'description', '')) > 1000
    or nullif(btrim(p_item ->> 'category'), '') is null or length(p_item ->> 'category') > 100
    or p_item ->> 'difficulty' not in ('Beginner', 'Intermediate', 'Advanced')
    or jsonb_typeof(p_item -> 'exercises') <> 'array'
    or jsonb_array_length(p_item -> 'exercises') not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid workout plan';
  end if;

  if p_plan_id is null then
    insert into public.workout_plans (user_id, name, description, category, difficulty)
    values (v_user_id, btrim(p_item ->> 'name'), coalesce(p_item ->> 'description', ''), btrim(p_item ->> 'category'), p_item ->> 'difficulty')
    returning * into v_plan;
  else
    select * into v_plan from public.workout_plans
    where id = p_plan_id and user_id = v_user_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'Workout plan is not owned by the caller';
    end if;
    update public.workout_plans set
      name = btrim(p_item ->> 'name'),
      description = coalesce(p_item ->> 'description', ''),
      category = btrim(p_item ->> 'category'),
      difficulty = p_item ->> 'difficulty'
    where id = p_plan_id
    returning * into v_plan;
    delete from public.workout_plan_exercises where plan_id = p_plan_id;
  end if;

  for v_exercise in select value from jsonb_array_elements(p_item -> 'exercises')
  loop
    if jsonb_typeof(v_exercise) <> 'object'
      or nullif(btrim(v_exercise ->> 'exercise_id'), '') is null
      or length(v_exercise ->> 'exercise_id') > 100
      or (v_exercise ->> 'sequence')::integer not between 0 and 100
      or (v_exercise ->> 'sets')::integer not between 1 and 100
      or v_exercise ->> 'reps' is not null and (v_exercise ->> 'reps')::integer not between 1 and 1000
      or v_exercise ->> 'duration_seconds' is not null and (v_exercise ->> 'duration_seconds')::integer not between 1 and 86400
      or coalesce((v_exercise ->> 'rest_seconds')::integer, 0) not between 0 and 3600 then
      raise exception using errcode = '22023', message = 'Invalid workout plan exercise';
    end if;
    insert into public.workout_plan_exercises (
      plan_id, exercise_id, sequence, sets, reps, duration_seconds, rest_seconds
    ) values (
      v_plan.id, btrim(v_exercise ->> 'exercise_id'), (v_exercise ->> 'sequence')::integer,
      (v_exercise ->> 'sets')::integer, nullif(v_exercise ->> 'reps', '')::integer,
      nullif(v_exercise ->> 'duration_seconds', '')::integer,
      coalesce((v_exercise ->> 'rest_seconds')::integer, 0)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence), '[]'::jsonb)
  into v_exercises from public.workout_plan_exercises e where e.plan_id = v_plan.id;
  return to_jsonb(v_plan) || jsonb_build_object('workout_plan_exercises', v_exercises);
end;
$$;

revoke all on function public.record_nutrition_log(jsonb) from public, anon;
revoke all on function public.record_progress_metric(jsonb) from public, anon;
revoke all on function public.record_completed_workout(jsonb) from public, anon;
revoke all on function public.update_completed_workout(uuid, jsonb) from public, anon;
revoke all on function public.save_workout_plan(uuid, jsonb) from public, anon;
grant execute on function public.record_nutrition_log(jsonb) to authenticated;
grant execute on function public.record_progress_metric(jsonb) to authenticated;
grant execute on function public.record_completed_workout(jsonb) to authenticated;
grant execute on function public.update_completed_workout(uuid, jsonb) to authenticated;
grant execute on function public.save_workout_plan(uuid, jsonb) to authenticated;
