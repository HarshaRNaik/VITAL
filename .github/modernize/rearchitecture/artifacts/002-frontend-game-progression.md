# Task 002 — Dashboard and Game Progression Integration

## Summary

Replaced browser-local game XP, streak, badge, and daily-chat authority with the existing authenticated game API, while continuing to use server-returned game state from registration and supported activity creates. The dashboard's coach mission now reflects persistent `chatToday` state. Analytics calculations and screens were left unchanged because their collection clients were already migrated to persistent APIs by the preceding meals/metrics batch.

## Deliverables

- [Implementation and verification results](./002-frontend-game-progression-results.md) — exact authored/generated files, contract mapping, tests, and limitations.
- [Structured batch report](./002-frontend-game-progression-batch-report.yaml) — task traceability and machine-readable results.
- [Updated implementation checkpoint](./checkpoints/tasks-to-impl.yaml) — task-to-code/test traceability.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/001-backend-results.md` — authenticated activity routes, game response fields, and no-live-database boundary.
- `.github/modernize/rearchitecture/artifacts/002-frontend.md` — existing API client/auth-cookie/CSRF conventions.
- `.github/modernize/rearchitecture/artifacts/002-frontend-workouts-results.md` — workout idempotency and persisted reward behavior.
- `.github/modernize/rearchitecture/artifacts/002-frontend-meals-metrics-results.md` — API-backed Analytics data and behavior-preservation evidence.
- `server/src/routes/activity.ts`, `server/src/routes/auth.ts`, `server/src/routes/assistant.ts`, `server/src/services/game.ts`, and `server/src/validation.ts` — source-of-truth game and reward contracts.

## Evidence Mapping

- `activity.ts#GET /game` + `game.ts#readGameState` → `src/services/api.js#gameApi.get` and `src/context/GameContext.jsx`; focused API test verifies authenticated GET behavior and the returned server shape.
- `activity.ts#POST /game/rewards` + `validation.ts#rewardSchema` → `gameApi.rewardChat` and `Assistant.jsx`; focused test verifies `type: chat`, CSRF, and credentials. The server idempotently limits the chat reward by its existing activity-date key.
- `auth.ts#POST /register` + activity create responses → Register, Diet, Fitness, and WorkoutPlayer apply server-returned game state instead of incrementing client XP. Existing duplicate workout responses do not trigger a second reward notification.
- `002-frontend-meals-metrics-results.md#Analytics data access` → Analytics and its existing date/filter/chart calculations were not changed; it already reads API-backed meals, workouts, and weight records.
- `GET /api/game#chatToday` → Hub daily coach mission, replacing its local `vital_chat_day` lookup.

## Test Results

- Command: `npm test`
- Passed: 24
- Failed: 0
- Skipped: 0
- Failure details: none.
- Build command: `npm run build` — passed (Prisma client generation, server TypeScript compilation, and Vite production build).
- Focused lint: `npx eslint` on the changed frontend files still exits 1 for the pre-existing `react-refresh/only-export-components` rule on `AuthContext.jsx`'s `useAuth` and `GameContext.jsx`'s `useGame` exports; no other diagnostics were reported.

## Limitations and Safety

- `Analytics.jsx` was not modified because its data already comes from the persistent meal/workout/progress API clients; the prior task report documents the contract and preserved UI behavior.
- The existing backend exposes GET game state and a chat-only game reward operation. Workout, meal, weight, and registration APIs return their game state. No generic arbitrary-reward route was invented; no separate exercise reward is added.
- Assistant response generation remains the existing local rule-based helper. Its chat XP uses the existing server reward contract; persistent assistant conversation storage was not integrated in this bounded task.
- The local completed-workout-session list remains only as a UI resume hint. XP, streaks, counts, badges, and chat mission completion are server-backed.
- `npm run build` first failed because Prisma configuration requires `DATABASE_URL`; it then passed with an ephemeral `postgresql://localhost/vital` value containing no credentials. The command only generated the Prisma client, compiled, and built assets; no database was contacted and no migration ran.
- No live endpoint/database verification was performed, and no real credentials or secrets were used or created.
- Vite continues to report a production JS chunk larger than 500 kB.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/001-backend-results.md` — backend game and activity contract evidence.
- `.github/modernize/rearchitecture/artifacts/002-frontend-workouts-results.md` — existing workout retry/reward semantics.
- `.github/modernize/rearchitecture/artifacts/002-frontend-meals-metrics-results.md` — existing Analytics API integration and behavior.

## Evidence Mapping

- `001-backend-results.md#activity/game routes` → `gameApi` and GameContext → `api.test.js` verifies GET and chat reward request contracts.
- `002-frontend-workouts-results.md#Idempotency` → WorkoutPlayer response handling → server duplicate responses update state without awarding a second client-side reward.
- `002-frontend-meals-metrics-results.md#Analytics data access` → Analytics unchanged → its existing API-backed collections and chart calculations remain intact.
