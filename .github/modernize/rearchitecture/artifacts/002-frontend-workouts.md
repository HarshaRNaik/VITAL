# Task 002 — Workout and Exercise API Integration

## Summary

Connected workout history, manual workout logging/editing/deletion, performed exercise sets, and workout completion restoration to the existing API contracts. The guided workout timer, navigation, workout plans, and animation components remain unchanged in behavior.

## Deliverables

- [Implementation and verification results](./002-frontend-workouts-results.md) — API mappings, changed files, test/build evidence, and remaining gaps.
- [Structured batch report](./002-frontend-workouts-batch-report.yaml) — machine-readable task traceability and validation.
- [Implementation checkpoint](./checkpoints/tasks-to-impl.yaml) — task-002 workout integration traceability added.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/001-backend.md` — task-001 API/data-layer contract index.
- `.github/modernize/rearchitecture/artifacts/001-backend-results.md` — workout persistence, performed-set, idempotency, validation, and safety evidence.
- `.github/modernize/rearchitecture/artifacts/002-frontend.md` — API client, auth cookie/CSRF, and prior frontend integration boundaries.
- `.github/modernize/rearchitecture/artifacts/002-frontend-results.md` — prior frontend test/build results and local activity/game-state boundary.
- `server/src/routes/activity.ts`, `server/src/routes/users.ts`, `server/src/validation.ts`, and `server/src/seed.ts` — direct source-of-truth endpoint, payload, and exercise identifier contracts.

## Evidence Mapping

- `activity.ts#GET/POST/PATCH/DELETE /workouts` + `validation.ts#workoutSchema` → `src/services/api.js` and `src/pages/Fitness.jsx`; `src/services/api.test.js` verifies pagination, CSRF, idempotency header, body serialization, update, and delete request contracts.
- `activity.ts#POST /workouts performedSets` + `seed.ts#seedExerciseCatalog` → `src/pages/WorkoutPlayer.jsx` sends completed set sequence/name/rep-or-duration data and links only catalogued movement IDs; unmapped movements remain valid name-only sets.
- `activity.ts#GET /workouts` → `WorkoutPlayer.jsx` restores completed state by persisted `sessionId`; duplicate completion submits are protected by the backend idempotency contract.
- User requirement to preserve workout/timer behavior and GIF assets → existing timer/plan/player flow retained; 9 source GIFs match their built copies byte-for-byte.

## Test Results

- `npm test`: 20 passed, 0 failed, 0 skipped.
- `npx vite build`: passed, exit code 0.
- Focused ESLint on changed source/test files: passed, exit code 0.
- GIF verification: 9 source and 9 built GIFs; SHA-256 mismatches: 0.

## Remaining Gaps

- No live API/database run or migration/seed was performed. Exercise references are linked when the API catalog contains the corresponding seeded ID; otherwise completed sets are still saved by name, with a visible warning.
- The existing `GameContext` remains browser-local for XP display. The workout endpoint also persists its server-side reward; whole-app game-state synchronization remains a separate integration task.
- Meals and progress metrics remain local, as in the prior bounded frontend scope.
- Vite still reports the existing oversized JavaScript chunk warning.
