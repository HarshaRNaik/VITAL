create or replace function public.grant_game_reward(p_type text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game jsonb;
  v_badges text[];
begin
  if p_type = 'workout' and not exists (
    select 1 from public.workouts
    where user_id = v_user_id
      and p_idempotency_key = 'workout:' || coalesce(session_id, id::text)
  ) then
    raise exception using errcode = '22023', message = 'Invalid workout reward key';
  end if;

  v_game := private.grant_game_reward_unchecked(p_type, p_idempotency_key);

  if (v_game ->> 'totalXP')::integer >= 1500 then
    update public.game_state
    set badges = array(
      select distinct badge
      from unnest(badges || array['lvl5']) as unlocked(badge)
      order by badge
    ),
    updated_at = now()
    where user_id = v_user_id
      and not ('lvl5' = any(badges));

    select badges into v_badges
    from public.game_state
    where user_id = v_user_id;

    v_game := jsonb_set(v_game, '{badges}', to_jsonb(v_badges), true);
  end if;

  return v_game;
end;
$$;

revoke all on function public.grant_game_reward(text, text) from public, anon;
grant execute on function public.grant_game_reward(text, text) to authenticated;

update public.game_state
set badges = array(
  select distinct badge
  from unnest(badges || array['lvl5']) as unlocked(badge)
  order by badge
),
updated_at = now()
where total_xp >= 1500
  and not ('lvl5' = any(badges));
