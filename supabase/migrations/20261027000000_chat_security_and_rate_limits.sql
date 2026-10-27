create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.user_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation varchar(40) not null,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, operation)
);

alter table private.user_rate_limits enable row level security;
revoke all on private.user_rate_limits from public, anon, authenticated;

create or replace function private.consume_user_rate_limit(p_operation text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_count integer;
begin
  if v_user_id is null or p_operation is null or p_limit < 1 or p_limit > 100 then
    return false;
  end if;

  insert into private.user_rate_limits (user_id, operation, window_start, request_count)
  values (v_user_id, p_operation, v_window, 1)
  on conflict (user_id, operation) do update
  set window_start = case
        when private.user_rate_limits.window_start = v_window
          then private.user_rate_limits.window_start
        else v_window
      end,
      request_count = case
        when private.user_rate_limits.window_start = v_window
          then private.user_rate_limits.request_count + 1
        else 1
      end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;
revoke all on function private.consume_user_rate_limit(text, integer) from public, anon, authenticated;

alter function public.grant_game_reward(text, text) set schema private;
alter function private.grant_game_reward(text, text) rename to grant_game_reward_unchecked;
revoke all on function private.grant_game_reward_unchecked(text, text) from public, anon, authenticated;

create or replace function public.grant_game_reward(p_type text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resource_key text := split_part(p_idempotency_key, ':', 2);
begin
  if p_type = 'workout' and not exists (
    select 1 from public.workouts
    where user_id = v_user_id
      and p_idempotency_key = 'workout:' || coalesce(session_id, id::text)
  ) then
    raise exception using errcode = '22023', message = 'Invalid workout reward key';
  end if;

  return private.grant_game_reward_unchecked(p_type, p_idempotency_key);
end;
$$;
revoke all on function public.grant_game_reward(text, text) from public, anon;
grant execute on function public.grant_game_reward(text, text) to authenticated;

alter function public.save_assistant_exchange(uuid, text, text, text) set schema private;
alter function private.save_assistant_exchange(uuid, text, text, text) rename to save_assistant_exchange_unlimited;
revoke all on function private.save_assistant_exchange_unlimited(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.create_assistant_conversation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation public.assistant_conversations%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not private.consume_user_rate_limit('assistant_conversation', 10) then
    return jsonb_build_object('rateLimited', true);
  end if;

  insert into public.assistant_conversations (user_id, title)
  values (v_user_id, 'New conversation')
  returning * into v_conversation;
  return to_jsonb(v_conversation);
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
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not private.consume_user_rate_limit('assistant_message', 12) then
    return jsonb_build_object('rateLimited', true);
  end if;

  return private.save_assistant_exchange_unlimited(
    p_conversation_id,
    p_request_id,
    p_user_content,
    p_assistant_content
  );
end;
$$;

revoke all on function public.create_assistant_conversation() from public, anon;
revoke all on function public.save_assistant_exchange(uuid, text, text, text) from public, anon;
grant execute on function public.create_assistant_conversation() to authenticated;
grant execute on function public.save_assistant_exchange(uuid, text, text, text) to authenticated;

revoke insert, update, delete on public.assistant_conversations, public.assistant_messages from authenticated;
grant select on public.assistant_conversations, public.assistant_messages to authenticated;
