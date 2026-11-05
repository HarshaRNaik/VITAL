-- OPTIONAL, DESTRUCTIVE CLEANUP ONLY. Do not run automatically.
-- Review this file and take a verified backup before choosing to execute it.
-- It permanently deletes saved Coach conversations, generated workout and
-- nutrition plans, and saved dietary preferences. It does not touch workout
-- logs, nutrition logs, regular workout_plans, profiles, authentication,
-- analytics, or game reward history.

drop function if exists public.create_assistant_conversation();
drop function if exists public.save_assistant_exchange(uuid, text, text, text);
drop function if exists private.save_assistant_exchange_unlimited(uuid, text, text, text);
drop function if exists private.consume_user_rate_limit(text, integer);

drop table if exists public.assistant_messages;
drop table if exists public.assistant_conversations;
drop table if exists public.workout_programs;
drop table if exists public.nutrition_plans;
drop table if exists private.user_rate_limits;

alter table if exists public.user_settings
  drop column if exists dietary_preference;
