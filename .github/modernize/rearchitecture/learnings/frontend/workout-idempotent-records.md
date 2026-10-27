# Workout Idempotent Records

Use the existing workout session UUID as the API idempotency key and persist completed sets using the backend's performed-set contract.

## What Happened

For VITAL-FITNESS_APP task `002-frontend-workouts`, `POST /api/workouts` required an `Idempotency-Key`, while guided sessions already had a UUID `sessionId`. The backend accepts a workout `sessionId` and deduplicates by both it and the request key. Performed sets must contain a name and exactly one of repetitions or timed duration; exercise IDs are nullable when the seeded catalogue does not contain that movement.

## Takeaway

Reuse a stable UUID across retries, send it as both `sessionId` and `Idempotency-Key`, and let the server's returned workout history determine whether a session is complete. Keep list clients array-shaped for existing UI, but aggregate all paginated `{ items, total }` responses. Preserve exercise names when no catalogue relationship is available.

## History
- 2026-10-25 (VITAL-FITNESS_APP/002-frontend-workouts): initial.
