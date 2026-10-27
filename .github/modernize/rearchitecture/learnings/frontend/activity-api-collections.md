# Activity API Collections

Use shared API-backed list/create/update/delete collection wrappers for existing meal and body-weight screens, preserving date-only strings and adding the backend's required idempotency header.

## What Happened

For VITAL-FITNESS_APP task `002-frontend-meals-metrics`, `Diet.jsx`, `Fitness.jsx`, and `Analytics.jsx` already called `meals` and `metrics` from the API module, but those exports used localStorage. Replacing the exports with wrappers for `/api/nutrition` and `/api/progress` connected those screens without changing their UI, date defaults, filtering, or empty states. Both APIs return paginated `{ items, total }`; POST requires `Idempotency-Key`, and progress responses expose `weight` rather than the database's `weightKg`.

## Takeaway

For collections whose existing views already consume a common `{ list, add, update, remove }` interface, migrate the shared service module rather than rewriting the views. Reuse the authenticated request helper, paginate through `listAll`, send a fresh UUID idempotency key on creates, and keep `YYYY-MM-DD` values as strings.

## History

- 2026-10-25 (VITAL-FITNESS_APP/002-frontend-meals-metrics): initial.
