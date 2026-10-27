## [002-frontend-auth] Integrated frontend authentication with the API
- Codebase/domain discoveries: task-001 exposes CSRF bootstrap, session restoration, registration, login, and logout under `/api/auth`; the browser session is cookie-based and unsafe methods require the matching CSRF header.
- Wrong assumptions and corrections: the previous auth flow stored account passwords and session identity in localStorage; production registration requires a 12-character minimum, not the UI's previous 8-character minimum.
- Debugging dead-ends and what actually worked: the first token-refresh test retained mutable `fetch` option references, so the first request appeared to use the refreshed token; cloning headers for retry keeps each request's token stable.
- Techniques/patterns worth reusing: keep CSRF tokens in memory, include browser credentials on API requests, defer protected-route redirects until session bootstrap resolves, and retain existing local activity helpers until their own API integration scope.
- Learnings consumed: []

## [002-frontend-workouts] Connected workout records and completion to the API
- Codebase/domain discoveries: workout history and exercise catalogue endpoints return paginated `{ items, total }`; workout creation requires `Idempotency-Key`, and seeded movement IDs match the IDs used by guided plans.
- Wrong assumptions and corrections: workout records from the API contain server fields and nested sets, so edit submissions must be reduced to the strict writable schema rather than spreading the returned row.
- Debugging dead-ends and what actually worked: completion checks against localStorage were not reliable across devices; server history keyed by the UUID `sessionId` now restores completion, and the same UUID makes POST retries idempotent.
- Techniques/patterns worth reusing: aggregate API pagination behind an array-returning list method; encode performed sets with a single reps-or-duration field; persist names even when an exercise catalogue ID is unavailable.
- Learnings consumed: [frontend/auth-cookie-session]

## [002-frontend-meals-metrics] Connected meal and weight records to activity APIs
- Codebase/domain discoveries: existing Diet, Fitness, and Analytics screens already consume `meals` and `metrics`; the meal routes are `/api/nutrition`, and weight measurements use `/api/progress` with serialized `weight` and date-only fields.
- Wrong assumptions and corrections: no page-level rewrite was required; swapping the service exports kept current date defaults, filtering, ordering, and empty states intact.
- Debugging dead-ends and what actually worked: API mutation creates require `Idempotency-Key`; using the shared request client also supplies the existing cookie/CSRF handling without changing callers.
- Techniques/patterns worth reusing: group endpoint-compatible CRUD collections around shared pagination and mutation mechanics; pass ISO date-only strings through unchanged.
- Learnings consumed: [frontend/auth-cookie-session, frontend/workout-idempotent-records]

## [002-frontend-game-progression] Connected dashboard progression to persisted game state
- Codebase/domain discoveries: `/api/game` returns XP, streak, activity counts, badge IDs, and `chatToday`; registration/activity creates return updated game state, while `/api/game/rewards` accepts only the chat reward type.
- Wrong assumptions and corrections: local `vital_game` and `vital_chat_day` values were previously presentation/progression authority; the existing server already owns rewards and offers state snapshots, so no generic reward route was needed.
- Debugging dead-ends and what actually worked: Prisma build config requires `DATABASE_URL` even for client generation; an ephemeral URL without credentials allowed generation/typecheck/build without database access.
- Techniques/patterns worth reusing: hydrate account-scoped progress after auth readiness, apply game state returned from each persisted mutation, and only show a reward notification when canonical XP increased. Keep local session markers strictly as UI hints.
- Learnings consumed: [frontend/activity-api-collections, frontend/auth-cookie-session, frontend/workout-idempotent-records]
