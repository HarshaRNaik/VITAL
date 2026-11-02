begin;

select plan(33);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'rls-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"name":"RLS User A","goal":"Strength"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'rls-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"name":"RLS User B","goal":"Mobility"}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

insert into public.nutrition_logs (user_id, name, type, calories, date)
values ('00000000-0000-4000-8000-000000000101', 'Private meal', 'Lunch', 500, current_date);

insert into public.workouts (id, user_id, type, name, duration, date, session_id)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'Guided',
  'Private workout',
  20,
  current_date,
  'rls-workout-session-1'
);

insert into public.workout_sets (workout_id, exercise_name, set_number, reps)
values ('00000000-0000-4000-8000-000000000201', 'Private squat', 1, 10);

insert into public.progress_metrics (user_id, weight_kg, date)
values ('00000000-0000-4000-8000-000000000101', 70, current_date);
insert into public.workout_plans (id, user_id, name, category, difficulty)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  'Private plan',
  'Strength',
  'Beginner'
);
insert into public.workout_plan_exercises (plan_id, exercise_id, sequence, sets, reps, rest_seconds)
values ('00000000-0000-4000-8000-000000000301', 'bodyweight-squat', 1, 3, 10, 30);
insert into public.fitness_goals (user_id, name, metric, target_value, unit)
values ('00000000-0000-4000-8000-000000000101', 'Private goal', 'weight', 65, 'kg');
select public.create_assistant_conversation();
select public.save_assistant_exchange(
  (select id from public.assistant_conversations where user_id = auth.uid() limit 1),
  'rls-first-message-101',
  'Private message',
  'Private response'
);

select is(
  (select count(*) from public.nutrition_logs),
  1::bigint,
  'owner can read their nutrition history'
);
select is(
  (select count(*) from public.profiles where id = auth.uid()),
  1::bigint,
  'owner can read their profile'
);
select is((select count(*) from public.user_settings), 1::bigint, 'owner can read their settings');
select is((select count(*) from public.progress_metrics), 1::bigint, 'owner can read fitness progress');
select is((select count(*) from public.workout_plans), 1::bigint, 'owner can read workout plans');
select is((select count(*) from public.workout_plan_exercises), 1::bigint, 'owner can read plan exercises');
select is((select count(*) from public.fitness_goals), 1::bigint, 'owner can read fitness goals');
select is((select count(*) from public.assistant_conversations), 1::bigint, 'owner can read assistant conversations');
select is((select count(*) from public.assistant_messages), 2::bigint, 'owner can read assistant history');
select is((select count(*) from public.game_state), 1::bigint, 'owner can read game state');
select is((select count(*) from public.game_rewards), 2::bigint, 'owner can read game rewards');
select is(
  (select count(*) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'profiles', 'user_settings', 'workout_plans', 'workout_plan_exercises',
       'workouts', 'workout_sets', 'nutrition_logs', 'progress_metrics',
       'fitness_goals', 'game_state', 'game_rewards',
       'assistant_conversations', 'assistant_messages', 'gym_workouts',
       'gym_workout_templates'
     ])
     and c.relrowsecurity),
  15::bigint,
  'RLS is enabled on every user-owned public table, including Gym Workout data'
);
select ok(
  not has_table_privilege(current_user, 'public.assistant_conversations', 'INSERT')
  and not has_table_privilege(current_user, 'public.assistant_messages', 'INSERT')
  and not has_schema_privilege(current_user, 'private', 'USAGE'),
  'assistant writes use validated RPCs and the rate-limit schema is private'
);
select throws_ok(
  $$select public.grant_game_reward('workout', 'workout:00000000-0000-4000-8000-000000000201')$$,
  '22023',
  'Invalid workout reward key',
  'a workout cannot receive a second reward through an alternate idempotency key'
);
reset role;
update public.game_state
set total_xp = 1475
where user_id = '00000000-0000-4000-8000-000000000101';
set local role authenticated;
select public.grant_game_reward('workout', 'workout:rls-workout-session-1');
select ok(
  (select badges @> array['lvl5'] from public.game_state where user_id = auth.uid()),
  'reaching level 5 unlocks the persisted level relic'
);
do $$
declare
  conversation_id uuid;
  response jsonb;
  limited_count integer := 0;
  attempt integer;
begin
  select id into conversation_id
  from public.assistant_conversations
  where user_id = auth.uid()
  limit 1;

  for attempt in 1..12 loop
    response := public.save_assistant_exchange(
      conversation_id,
      'rls-throttle-' || lpad(attempt::text, 3, '0'),
      'Rate-limit test message',
      'Rate-limit test response'
    );
    if response ->> 'rateLimited' = 'true' then
      limited_count := limited_count + 1;
    end if;
  end loop;

  perform set_config('test.assistant_rate_limited', limited_count::text, true);
end;
$$;
select is(
  current_setting('test.assistant_rate_limited'),
  '1',
  'assistant messages are limited to 12 per user per minute'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);

select is(
  (select count(*) from public.nutrition_logs),
  0::bigint,
  'another user cannot read nutrition history'
);
select is(
  (select count(*) from public.workouts),
  0::bigint,
  'another user cannot read completed workouts'
);
select is(
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000101'),
  0::bigint,
  'another user cannot read the owner profile'
);
select is(
  (select count(*) from public.user_settings where user_id = '00000000-0000-4000-8000-000000000101'),
  0::bigint,
  'another user cannot read the owner settings'
);
select is((select count(*) from public.progress_metrics), 0::bigint, 'another user cannot read fitness progress');
select is((select count(*) from public.workout_plans), 0::bigint, 'another user cannot read workout plans');
select is((select count(*) from public.workout_plan_exercises), 0::bigint, 'another user cannot read plan exercises');
select is((select count(*) from public.fitness_goals), 0::bigint, 'another user cannot read fitness goals');
select is((select count(*) from public.assistant_conversations), 0::bigint, 'another user cannot read assistant conversations');
select is((select count(*) from public.assistant_messages), 0::bigint, 'another user cannot read assistant history');
select is(
  (select count(*) from public.game_state where user_id = '00000000-0000-4000-8000-000000000101'),
  0::bigint,
  'another user cannot read the owner game state'
);
select is(
  (select count(*) from public.game_rewards where user_id = '00000000-0000-4000-8000-000000000101'),
  0::bigint,
  'another user cannot read the owner game rewards'
);
select is(
  (select count(*) from public.workout_sets),
  0::bigint,
  'another user cannot read exercise sets'
);

update public.workouts
set name = 'Unauthorized change'
where id = '00000000-0000-4000-8000-000000000201';
delete from public.workouts
where id = '00000000-0000-4000-8000-000000000201';

select set_config('test.forged_owner_insert', 'not_checked', true);
do $$
begin
  begin
    insert into public.nutrition_logs (user_id, name, type, calories, date)
    values ('00000000-0000-4000-8000-000000000101', 'Forged meal', 'Lunch', 400, current_date);
    perform set_config('test.forged_owner_insert', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.forged_owner_insert', 'denied', true);
  end;
end;
$$;
select is(
  current_setting('test.forged_owner_insert'),
  'denied',
  'another user cannot insert a row under the owner ID'
);

reset role;
select is(
  (select name from public.workouts where id = '00000000-0000-4000-8000-000000000201'),
  'Private workout',
  'another user cannot change an owned workout'
);
select is(
  (select count(*) from public.workouts where id = '00000000-0000-4000-8000-000000000201'),
  1::bigint,
  'another user cannot delete an owned workout'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select set_config('test.forged_owner_update', 'not_checked', true);
do $$
begin
  begin
    update public.workouts
    set user_id = '00000000-0000-4000-8000-000000000102'
    where id = '00000000-0000-4000-8000-000000000201';
    perform set_config('test.forged_owner_update', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.forged_owner_update', 'denied', true);
  end;
end;
$$;
select is(
  current_setting('test.forged_owner_update'),
  'denied',
  'an owner cannot change a record ownership field'
);
reset role;

select * from finish();
rollback;
