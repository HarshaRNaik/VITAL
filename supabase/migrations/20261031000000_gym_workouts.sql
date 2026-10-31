create table if not exists public.gym_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar(120) not null,
  status varchar(20) not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED')),
  unit varchar(2) not null default 'kg' check (unit in ('kg', 'lb')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds integer not null default 0
    check (duration_seconds between 0 and 86400),
  exercises jsonb not null default '[]'::jsonb
    check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'IN_PROGRESS' and finished_at is null)
    or (status = 'COMPLETED' and finished_at is not null))
);

create index if not exists gym_workouts_user_started_idx
  on public.gym_workouts(user_id, started_at desc);
create index if not exists gym_workouts_user_status_idx
  on public.gym_workouts(user_id, status);

create table if not exists public.gym_workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar(120) not null check (length(btrim(name)) > 0),
  exercises jsonb not null
    check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists gym_workout_templates_user_updated_idx
  on public.gym_workout_templates(user_id, updated_at desc);

drop trigger if exists gym_workouts_set_updated_at on public.gym_workouts;
create trigger gym_workouts_set_updated_at
  before update on public.gym_workouts
  for each row execute function public.set_updated_at();

drop trigger if exists gym_workout_templates_set_updated_at on public.gym_workout_templates;
create trigger gym_workout_templates_set_updated_at
  before update on public.gym_workout_templates
  for each row execute function public.set_updated_at();

alter table public.gym_workouts enable row level security;
create policy gym_workouts_read_own on public.gym_workouts
  for select to authenticated using ((select auth.uid()) = user_id);

alter table public.gym_workout_templates enable row level security;
create policy gym_workout_templates_read_own on public.gym_workout_templates
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.gym_workouts from anon, authenticated;
grant select on public.gym_workouts to authenticated;
revoke all on public.gym_workout_templates from anon, authenticated;
grant select on public.gym_workout_templates to authenticated;

create or replace function public.save_gym_workout_template(p_template_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_template_id uuid := coalesce(p_template_id, gen_random_uuid());
  v_template public.gym_workout_templates%rowtype;
  v_exercise jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(p_item) <> 'object'
    or not (p_item ?& array['name', 'exercises'])
    or p_item - array['name', 'exercises'] <> '{}'::jsonb
    or nullif(btrim(p_item ->> 'name'), '') is null
    or length(p_item ->> 'name') > 120
    or jsonb_typeof(p_item -> 'exercises') <> 'array'
    or jsonb_array_length(p_item -> 'exercises') not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid gym workout template';
  end if;

  for v_exercise in select value from jsonb_array_elements(p_item -> 'exercises')
  loop
    if jsonb_typeof(v_exercise) <> 'object'
      or not (v_exercise ?& array['exercise_id', 'sets', 'reps', 'rest_seconds'])
      or v_exercise - array['exercise_id', 'sets', 'reps', 'rest_seconds'] <> '{}'::jsonb
      or coalesce(v_exercise ->> 'exercise_id', '') !~ '^[A-Za-z0-9_-]{1,100}$'
      or coalesce(jsonb_typeof(v_exercise -> 'sets'), '') <> 'number'
      or (v_exercise ->> 'sets')::numeric not between 1 and 30
      or (v_exercise ->> 'sets')::numeric <> trunc((v_exercise ->> 'sets')::numeric)
      or coalesce(jsonb_typeof(v_exercise -> 'reps'), '') <> 'number'
      or (v_exercise ->> 'reps')::numeric not between 1 and 1000
      or (v_exercise ->> 'reps')::numeric <> trunc((v_exercise ->> 'reps')::numeric)
      or coalesce(jsonb_typeof(v_exercise -> 'rest_seconds'), '') <> 'number'
      or (v_exercise ->> 'rest_seconds')::numeric not between 0 and 3600
      or (v_exercise ->> 'rest_seconds')::numeric <> trunc((v_exercise ->> 'rest_seconds')::numeric) then
      raise exception using errcode = '22023', message = 'Invalid gym workout template exercise';
    end if;
  end loop;

  if p_template_id is null then
    select * into v_template from public.gym_workout_templates
    where user_id = v_user_id and name = btrim(p_item ->> 'name') for update;
  else
    select * into v_template from public.gym_workout_templates
    where id = p_template_id and user_id = v_user_id for update;
  end if;
  if found then
    update public.gym_workout_templates
    set name = btrim(p_item ->> 'name'), exercises = p_item -> 'exercises'
    where id = v_template.id returning * into v_template;
  else
    insert into public.gym_workout_templates (id, user_id, name, exercises)
    values (v_template_id, v_user_id, btrim(p_item ->> 'name'), p_item -> 'exercises')
    returning * into v_template;
  end if;
  return to_jsonb(v_template);
end;
$$;

create or replace function public.delete_gym_workout_template(p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  delete from public.gym_workout_templates
  where id = p_template_id and user_id = v_user_id
  returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

create or replace function public.cancel_gym_workout(p_workout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  delete from public.gym_workouts
  where id = p_workout_id and user_id = v_user_id and status = 'IN_PROGRESS'
  returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

create or replace function public.save_gym_workout(p_workout_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.gym_workouts%rowtype;
  v_exercise jsonb;
  v_set jsonb;
  v_game jsonb;
  v_duplicate boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_workout_id is null or jsonb_typeof(p_item) <> 'object'
    or not (p_item ?& array['name', 'status', 'unit', 'started_at', 'duration_seconds', 'exercises'])
    or p_item - array['name', 'status', 'unit', 'started_at', 'duration_seconds', 'exercises'] <> '{}'::jsonb
    or nullif(btrim(p_item ->> 'name'), '') is null or length(p_item ->> 'name') > 120
    or coalesce(p_item ->> 'status', '') not in ('IN_PROGRESS', 'COMPLETED')
    or coalesce(p_item ->> 'unit', '') not in ('kg', 'lb')
    or coalesce(jsonb_typeof(p_item -> 'started_at'), '') <> 'string'
    or jsonb_typeof(p_item -> 'exercises') <> 'array'
    or jsonb_array_length(p_item -> 'exercises') > 100 then
    raise exception using errcode = '22023', message = 'Invalid gym workout';
  end if;
  if jsonb_typeof(p_item -> 'duration_seconds') <> 'number'
    or (p_item ->> 'duration_seconds')::numeric not between 0 and 86400
    or (p_item ->> 'duration_seconds')::numeric <> trunc((p_item ->> 'duration_seconds')::numeric) then
    raise exception using errcode = '22023', message = 'Invalid gym workout duration';
  end if;

  for v_exercise in select value from jsonb_array_elements(p_item -> 'exercises')
  loop
    if jsonb_typeof(v_exercise) <> 'object'
      or not (v_exercise ?& array['exercise_id', 'exercise_name', 'focus', 'equipment', 'sequence', 'notes', 'sets'])
      or v_exercise - array['exercise_id', 'exercise_name', 'focus', 'equipment', 'sequence', 'notes', 'sets'] <> '{}'::jsonb
      or coalesce(v_exercise ->> 'exercise_id', '') !~ '^[A-Za-z0-9_-]{1,100}$'
      or nullif(btrim(v_exercise ->> 'exercise_name'), '') is null
      or length(v_exercise ->> 'exercise_name') > 120
      or coalesce(jsonb_typeof(v_exercise -> 'focus'), '') <> 'string'
      or length(v_exercise ->> 'focus') > 120
      or coalesce(jsonb_typeof(v_exercise -> 'equipment'), '') <> 'string'
      or length(v_exercise ->> 'equipment') > 80
      or coalesce(jsonb_typeof(v_exercise -> 'sequence'), '') <> 'number'
      or (v_exercise ->> 'sequence')::numeric not between 0 and 100
      or (v_exercise ->> 'sequence')::numeric <> trunc((v_exercise ->> 'sequence')::numeric)
      or coalesce(jsonb_typeof(v_exercise -> 'notes'), '') <> 'string'
      or jsonb_typeof(v_exercise -> 'sets') <> 'array'
      or jsonb_array_length(v_exercise -> 'sets') > 100
      or (v_exercise ? 'notes' and length(v_exercise ->> 'notes') > 500) then
      raise exception using errcode = '22023', message = 'Invalid gym workout exercise';
    end if;
    for v_set in select value from jsonb_array_elements(v_exercise -> 'sets')
    loop
      if jsonb_typeof(v_set) <> 'object'
        or not (v_set ?& array['set_number', 'weight_kg', 'reps', 'rpe', 'set_type', 'completed', 'notes'])
        or v_set - array['set_number', 'weight_kg', 'reps', 'rpe', 'set_type', 'completed', 'notes'] <> '{}'::jsonb
        or jsonb_typeof(v_set -> 'set_number') <> 'number'
        or (v_set ->> 'set_number')::numeric not between 1 and 100
        or (v_set ->> 'set_number')::numeric <> trunc((v_set ->> 'set_number')::numeric)
        or jsonb_typeof(v_set -> 'completed') <> 'boolean'
        or coalesce(v_set ->> 'set_type', '') not in ('WARM_UP', 'WORKING', 'DROP', 'FAILURE', 'REST_PAUSE')
        or coalesce(jsonb_typeof(v_set -> 'notes'), '') <> 'string'
        or length(v_set ->> 'notes') > 500
        or v_set -> 'weight_kg' is null
        or (v_set -> 'weight_kg' <> 'null'::jsonb and (
          jsonb_typeof(v_set -> 'weight_kg') <> 'number'
          or (v_set ->> 'weight_kg')::numeric not between 0 and 1000000
        ))
        or v_set -> 'reps' is null
        or (v_set -> 'reps' <> 'null'::jsonb and (
          jsonb_typeof(v_set -> 'reps') <> 'number'
          or (v_set ->> 'reps')::numeric not between 1 and 1000
          or (v_set ->> 'reps')::numeric <> trunc((v_set ->> 'reps')::numeric)
        ))
        or v_set -> 'rpe' is null
        or (v_set -> 'rpe' <> 'null'::jsonb and (
          jsonb_typeof(v_set -> 'rpe') <> 'number'
          or (v_set ->> 'rpe')::numeric not between 1 and 10
        ))
        then
        raise exception using errcode = '22023', message = 'Invalid gym workout set';
      end if;
    end loop;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(p_item -> 'exercises') as exercise(value)
    group by exercise.value ->> 'sequence'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_item -> 'exercises') as exercise(value)
    cross join lateral jsonb_array_elements(exercise.value -> 'sets') as workout_set(value)
    group by exercise.value ->> 'sequence', workout_set.value ->> 'set_number'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Gym exercise sequences and set numbers must be unique';
  end if;

  select * into v_row from public.gym_workouts
  where id = p_workout_id and user_id = v_user_id for update;
  if found and v_row.status = 'COMPLETED' then
    v_duplicate := true;
  elsif found then
    update public.gym_workouts set
      name = btrim(p_item ->> 'name'),
      status = p_item ->> 'status',
      unit = p_item ->> 'unit',
      started_at = (p_item ->> 'started_at')::timestamptz,
      finished_at = case when p_item ->> 'status' = 'COMPLETED' then now() else null end,
      duration_seconds = (p_item ->> 'duration_seconds')::integer,
      exercises = p_item -> 'exercises'
    where id = p_workout_id returning * into v_row;
  else
    if p_item ->> 'status' <> 'IN_PROGRESS' then
      raise exception using errcode = '22023', message = 'A gym workout must be started before it can be completed';
    end if;
    insert into public.gym_workouts (
      id, user_id, name, status, unit, started_at, duration_seconds, exercises
    ) values (
      p_workout_id, v_user_id, btrim(p_item ->> 'name'), 'IN_PROGRESS',
      p_item ->> 'unit', (p_item ->> 'started_at')::timestamptz,
      (p_item ->> 'duration_seconds')::integer, p_item -> 'exercises'
    ) returning * into v_row;
  end if;

  if p_item ->> 'status' = 'COMPLETED' then
    if not exists (
      select 1
      from jsonb_array_elements(v_row.exercises) as exercise(value)
      cross join lateral jsonb_array_elements(exercise.value -> 'sets') as workout_set(value)
      where workout_set.value ->> 'completed' = 'true'
        and workout_set.value ->> 'set_type' = 'WORKING'
        and nullif(workout_set.value ->> 'reps', '') is not null
        and nullif(workout_set.value ->> 'weight_kg', '') is not null
    ) then
      raise exception using errcode = '22023', message = 'Complete at least one valid working set before finishing';
    end if;
    v_game := public.grant_game_reward('workout', 'gym-workout:' || p_workout_id::text);
  end if;

  return jsonb_build_object(
    'item', to_jsonb(v_row),
    'game', v_game,
    'duplicate', v_duplicate
  );
end;
$$;

revoke all on function public.save_gym_workout(uuid, jsonb) from public, anon;
grant execute on function public.save_gym_workout(uuid, jsonb) to authenticated;
revoke all on function public.cancel_gym_workout(uuid) from public, anon;
grant execute on function public.cancel_gym_workout(uuid) to authenticated;
revoke all on function public.save_gym_workout_template(uuid, jsonb) from public, anon;
grant execute on function public.save_gym_workout_template(uuid, jsonb) to authenticated;
revoke all on function public.delete_gym_workout_template(uuid) from public, anon;
grant execute on function public.delete_gym_workout_template(uuid) to authenticated;
