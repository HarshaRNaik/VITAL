create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name varchar(100) not null default '',
  goal varchar(100) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme varchar(20) not null default 'dark',
  measurement_unit varchar(20) not null default 'metric',
  time_zone varchar(100) not null default 'UTC',
  workout_preference varchar(500) not null default '',
  email_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar(120) not null,
  description varchar(1000) not null default '',
  category varchar(100) not null,
  difficulty varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_id varchar(100) not null,
  sequence integer not null check (sequence > 0),
  sets integer not null check (sets > 0),
  reps integer check (reps > 0),
  duration_seconds integer check (duration_seconds > 0),
  rest_seconds integer not null default 0 check (rest_seconds >= 0),
  unique (plan_id, sequence)
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  custom_plan_id uuid references public.workout_plans(id) on delete set null,
  type varchar(40) not null,
  name varchar(120) not null,
  duration integer not null check (duration > 0),
  duration_seconds integer check (duration_seconds >= 0),
  calories double precision not null default 0 check (calories >= 0),
  calories_estimated boolean not null default false,
  date date not null,
  plan_id varchar(100),
  plan_category varchar(100),
  course_session varchar(100),
  planned_duration_minutes integer check (planned_duration_minutes > 0),
  exercises_completed integer check (exercises_completed >= 0),
  sets_completed integer check (sets_completed >= 0),
  session_id varchar(100),
  client_request_id varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id),
  unique (user_id, client_request_id)
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id varchar(100),
  exercise_sequence integer,
  exercise_name varchar(120) not null,
  set_number integer not null check (set_number > 0),
  reps integer check (reps > 0),
  weight_kg double precision check (weight_kg >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  rest_seconds integer not null default 0 check (rest_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (workout_id, exercise_sequence, set_number)
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar(120) not null,
  type varchar(40) not null,
  quantity double precision not null default 1 check (quantity > 0),
  quantity_unit varchar(40) not null default 'serving',
  calories double precision not null check (calories >= 0),
  protein double precision not null default 0 check (protein >= 0),
  carbs double precision not null default 0 check (carbs >= 0),
  fat double precision not null default 0 check (fat >= 0),
  nutrition_estimated boolean not null default false,
  date date not null,
  client_request_id varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create table if not exists public.progress_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg double precision not null check (weight_kg > 0),
  date date not null,
  client_request_id varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create table if not exists public.fitness_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name varchar(120) not null,
  metric varchar(40) not null,
  target_value double precision not null check (target_value > 0),
  unit varchar(40) not null,
  deadline date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_active date,
  counts jsonb not null default '{}'::jsonb,
  badges text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key varchar(160) not null,
  type varchar(40) not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(120) not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  client_request_id varchar(100),
  role varchar(20) not null check (role in ('user', 'assistant')),
  content varchar(2000) not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_request_id, role)
);

create index if not exists workout_plans_user_updated_idx on public.workout_plans(user_id, updated_at desc);
create index if not exists workouts_user_date_idx on public.workouts(user_id, date desc);
create index if not exists nutrition_logs_user_date_idx on public.nutrition_logs(user_id, date desc);
create index if not exists progress_metrics_user_date_idx on public.progress_metrics(user_id, date desc);
create index if not exists fitness_goals_user_state_idx on public.fitness_goals(user_id, completed_at, deadline);
create index if not exists assistant_conversations_user_updated_idx on public.assistant_conversations(user_id, updated_at desc);
create index if not exists assistant_messages_conversation_created_idx on public.assistant_messages(conversation_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_settings', 'workout_plans', 'workouts',
    'nutrition_logs', 'progress_metrics', 'fitness_goals',
    'game_state', 'assistant_conversations'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_name text;
  user_goal text;
begin
  user_name := left(coalesce(new.raw_user_meta_data ->> 'name', ''), 100);
  user_goal := left(coalesce(new.raw_user_meta_data ->> 'goal', ''), 100);

  insert into public.profiles (id, email, name, goal)
  values (new.id, coalesce(new.email, ''), user_name, user_goal)
  on conflict (id) do update set email = excluded.email;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.game_state (user_id, total_xp, counts, badges)
  values (new.id, 50, '{"register": 1}'::jsonb, array['welcome'])
  on conflict (user_id) do nothing;

  insert into public.game_rewards (user_id, idempotency_key, type, amount)
  values (new.id, 'register', 'register', 50)
  on conflict (user_id, idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_vital_fitness on auth.users;
create trigger on_auth_user_created_vital_fitness
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, email, name, goal)
select
  id,
  coalesce(email, ''),
  left(coalesce(raw_user_meta_data ->> 'name', ''), 100),
  left(coalesce(raw_user_meta_data ->> 'goal', ''), 100)
from auth.users
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.game_state (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.grant_game_reward(p_type text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_amount integer;
  v_inserted_id uuid;
  v_today date := current_date;
  v_previous date := current_date - 1;
  v_current public.game_state%rowtype;
  v_time_zone text;
  v_chat_today boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_type is null or p_type not in ('meal', 'workout', 'weight', 'chat')
    or p_idempotency_key is null
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 160 then
    raise exception using errcode = '22023', message = 'Invalid reward request';
  end if;

  select time_zone into v_time_zone
  from public.user_settings where user_id = v_user_id;
  begin
    v_today := (now() at time zone coalesce(nullif(v_time_zone, ''), 'UTC'))::date;
  exception when invalid_parameter_value then
    v_time_zone := 'UTC';
    v_today := current_date;
  end;
  v_previous := v_today - 1;

  if (p_type = 'chat' and p_idempotency_key <> ('chat:' || v_today::text))
    or (p_type <> 'chat' and (
      p_idempotency_key <> (p_type || ':' || split_part(p_idempotency_key, ':', 2))
    )) then
    raise exception using errcode = '22023', message = 'Invalid reward idempotency key';
  end if;

  if p_type = 'meal' and not exists (
    select 1 from public.nutrition_logs
    where user_id = v_user_id and id::text = split_part(p_idempotency_key, ':', 2)
  ) then
    raise exception using errcode = '42501', message = 'Reward requires an owned meal';
  elsif p_type = 'workout' and not exists (
    select 1 from public.workouts
    where user_id = v_user_id and (id::text = split_part(p_idempotency_key, ':', 2)
      or session_id = split_part(p_idempotency_key, ':', 2))
  ) then
    raise exception using errcode = '42501', message = 'Reward requires an owned workout';
  elsif p_type = 'weight' and not exists (
    select 1 from public.progress_metrics
    where user_id = v_user_id and id::text = split_part(p_idempotency_key, ':', 2)
  ) then
    raise exception using errcode = '42501', message = 'Reward requires an owned metric';
  elsif p_type = 'chat' and not exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where c.user_id = v_user_id and m.role = 'user'
      and m.created_at >= (v_today::timestamp at time zone coalesce(nullif(v_time_zone, ''), 'UTC'))
      and m.created_at < ((v_today + 1)::timestamp at time zone coalesce(nullif(v_time_zone, ''), 'UTC'))
  ) then
    raise exception using errcode = '42501', message = 'Reward requires an owned message';
  end if;

  v_amount := case p_type when 'meal' then 10 when 'workout' then 25 when 'weight' then 15 else 5 end;

  insert into public.game_rewards (user_id, idempotency_key, type, amount)
  values (v_user_id, p_idempotency_key, p_type, v_amount)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_inserted_id;

  insert into public.game_state (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  if v_inserted_id is not null then
    select * into v_current from public.game_state where user_id = v_user_id for update;
    update public.game_state
    set total_xp = total_xp + v_amount,
        streak = case
          when last_active = v_today then streak
          when last_active = v_previous then streak + 1
          else 1
        end,
        last_active = v_today,
        counts = jsonb_set(
          counts,
          array[p_type],
          to_jsonb(coalesce((counts ->> p_type)::integer, 0) + 1),
          true
        ),
        badges = array(
          select distinct badge
          from unnest(
            badges || case
              when p_type = 'meal' and coalesce((counts ->> 'meal')::integer, 0) + 1 >= 1 then array['first-meal']
              when p_type = 'workout' and coalesce((counts ->> 'workout')::integer, 0) + 1 >= 1 then array['first-workout']
              when p_type = 'chat' then array['chatty']
              else array[]::text[]
            end || case
              when p_type = 'meal' and coalesce((counts ->> 'meal')::integer, 0) + 1 >= 10 then array['ten-meals']
              when p_type = 'workout' and coalesce((counts ->> 'workout')::integer, 0) + 1 >= 10 then array['ten-workouts']
              else array[]::text[]
            end || case
              when (case
                when last_active = v_today then streak
                when last_active = v_previous then streak + 1
                else 1
              end) >= 3 then array['streak3']
              else array[]::text[]
            end || case
              when (case
                when last_active = v_today then streak
                when last_active = v_previous then streak + 1
                else 1
              end) >= 7 then array['streak7']
              else array[]::text[]
            end
          ) as badges(badge)
          order by badge
        ),
        updated_at = now()
    where user_id = v_user_id;
  end if;

  select * into v_current from public.game_state where user_id = v_user_id;
  select exists (
    select 1 from public.game_rewards
    where user_id = v_user_id and idempotency_key = 'chat:' || v_today::text
  ) into v_chat_today;

  return jsonb_build_object(
    'totalXP', v_current.total_xp,
    'streak', v_current.streak,
    'lastActive', v_current.last_active,
    'counts', v_current.counts,
    'badges', to_jsonb(v_current.badges),
    'chatToday', v_chat_today
  );
end;
$$;

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
  if v_request_id is null or length(v_request_id) < 8 or length(v_request_id) > 100 then
    raise exception using errcode = '22023', message = 'Invalid activity request id';
  end if;

  begin
    insert into public.nutrition_logs (
      user_id, name, type, quantity, quantity_unit, calories, protein, carbs, fat,
      nutrition_estimated, date, client_request_id
    ) values (
      v_user_id,
      p_item ->> 'name',
      p_item ->> 'type',
      coalesce((p_item ->> 'quantity')::double precision, 1),
      coalesce(p_item ->> 'quantity_unit', 'serving'),
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
  if v_request_id is null or length(v_request_id) < 8 or length(v_request_id) > 100 then
    raise exception using errcode = '22023', message = 'Invalid activity request id';
  end if;

  begin
    insert into public.progress_metrics (user_id, weight_kg, date, client_request_id)
    values (
      v_user_id,
      (p_item ->> 'weight_kg')::double precision,
      (p_item ->> 'date')::date,
      v_request_id
    ) returning * into v_row;
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
  if v_request_id is null or length(v_request_id) < 8 or length(v_request_id) > 100 then
    raise exception using errcode = '22023', message = 'Invalid workout session id';
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
      v_user_id,
      nullif(p_item ->> 'custom_plan_id', '')::uuid,
      p_item ->> 'type',
      p_item ->> 'name',
      (p_item ->> 'duration')::integer,
      nullif(p_item ->> 'duration_seconds', '')::integer,
      coalesce((p_item ->> 'calories')::double precision, 0),
      coalesce((p_item ->> 'calories_estimated')::boolean, false),
      (p_item ->> 'date')::date,
      p_item ->> 'plan_id',
      p_item ->> 'plan_category',
      p_item ->> 'course_session',
      nullif(p_item ->> 'planned_duration_minutes', '')::integer,
      nullif(p_item ->> 'exercises_completed', '')::integer,
      nullif(p_item ->> 'sets_completed', '')::integer,
      v_request_id,
      v_request_id
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
        v_row.id,
        v_set.value ->> 'exercise_id',
        nullif(v_set.value ->> 'exercise_sequence', '')::integer,
        v_set.value ->> 'exercise_name',
        (v_set.value ->> 'set_number')::integer,
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
    'item',
    to_jsonb(v_row) || jsonb_build_object('workout_sets', v_sets),
    'game',
    v_game,
    'duplicate',
    v_duplicate
  );
end;
$$;

create or replace function public.save_assistant_exchange(
  p_conversation_id uuid,
  p_request_id text,
  p_user_content text,
  p_assistant_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation public.assistant_conversations%rowtype;
  v_user_message public.assistant_messages%rowtype;
  v_assistant_message public.assistant_messages%rowtype;
  v_today date;
  v_time_zone text;
  v_game jsonb;
  v_duplicate boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 100
    or p_user_content is null or length(p_user_content) < 1 or length(p_user_content) > 500
    or p_assistant_content is null or length(p_assistant_content) > 2000 then
    raise exception using errcode = '22023', message = 'Invalid assistant exchange';
  end if;

  select * into v_conversation from public.assistant_conversations
  where id = p_conversation_id and user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Conversation is not owned by the caller';
  end if;

  select * into v_user_message from public.assistant_messages
  where conversation_id = p_conversation_id and client_request_id = p_request_id and role = 'user';
  if found then
    v_duplicate := true;
    select * into v_assistant_message from public.assistant_messages
    where conversation_id = p_conversation_id and client_request_id = p_request_id and role = 'assistant';
  else
    insert into public.assistant_messages (conversation_id, client_request_id, role, content)
    values (p_conversation_id, p_request_id, 'user', p_user_content)
    returning * into v_user_message;
    insert into public.assistant_messages (conversation_id, client_request_id, role, content)
    values (p_conversation_id, p_request_id, 'assistant', p_assistant_content)
    returning * into v_assistant_message;
    update public.assistant_conversations
    set title = case when title = 'New conversation' then left(p_user_content, 120) else title end,
        updated_at = now()
    where id = p_conversation_id;
  end if;

  select time_zone into v_time_zone from public.user_settings where user_id = v_user_id;
  begin
    v_today := (now() at time zone coalesce(nullif(v_time_zone, ''), 'UTC'))::date;
  exception when invalid_parameter_value then
    v_time_zone := 'UTC';
    v_today := current_date;
  end;
  v_game := public.grant_game_reward('chat', 'chat:' || v_today::text);

  return jsonb_build_object(
    'userMessage', to_jsonb(v_user_message),
    'assistantMessage', to_jsonb(v_assistant_message),
    'game', v_game,
    'duplicate', v_duplicate
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_plan_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.progress_metrics enable row level security;
alter table public.fitness_goals enable row level security;
alter table public.game_state enable row level security;
alter table public.game_rewards enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy settings_own on public.user_settings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_plans_own on public.workout_plans for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy plan_exercises_own on public.workout_plan_exercises for all to authenticated
using (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy workouts_own on public.workouts for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    custom_plan_id is null
    or exists (
      select 1 from public.workout_plans p
      where p.id = custom_plan_id and p.user_id = (select auth.uid())
    )
  )
);
create policy workout_sets_own on public.workout_sets for all to authenticated
using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())))
with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));
create policy nutrition_logs_own on public.nutrition_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy progress_metrics_own on public.progress_metrics for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fitness_goals_own on public.fitness_goals for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy game_state_read_own on public.game_state for select to authenticated using ((select auth.uid()) = user_id);
create policy game_rewards_read_own on public.game_rewards for select to authenticated using ((select auth.uid()) = user_id);
create policy conversations_own on public.assistant_conversations for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy messages_own on public.assistant_messages for all to authenticated
using (exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
with check (exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

revoke all on public.profiles, public.user_settings, public.workout_plans, public.workout_plan_exercises,
  public.workouts, public.workout_sets, public.nutrition_logs, public.progress_metrics,
  public.fitness_goals, public.game_state, public.game_rewards,
  public.assistant_conversations, public.assistant_messages from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_settings, public.workout_plans,
  public.workout_plan_exercises, public.workouts, public.workout_sets, public.nutrition_logs,
  public.progress_metrics, public.fitness_goals, public.assistant_conversations,
  public.assistant_messages to authenticated;
grant select on public.game_state, public.game_rewards to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.grant_game_reward(text, text) from public, anon;
grant execute on function public.grant_game_reward(text, text) to authenticated;
revoke all on function public.record_nutrition_log(jsonb) from public, anon;
revoke all on function public.record_progress_metric(jsonb) from public, anon;
revoke all on function public.record_completed_workout(jsonb) from public, anon;
revoke all on function public.save_assistant_exchange(uuid, text, text, text) from public, anon;
grant execute on function public.record_nutrition_log(jsonb) to authenticated;
grant execute on function public.record_progress_metric(jsonb) to authenticated;
grant execute on function public.record_completed_workout(jsonb) to authenticated;
grant execute on function public.save_assistant_exchange(uuid, text, text, text) to authenticated;
