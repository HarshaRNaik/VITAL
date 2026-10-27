# Task 002 — Meal and Body-Metrics API Integration

## Summary

Replaced the localStorage-backed meal and weight collections with authenticated API clients for the existing `/api/nutrition` and `/api/progress` contracts. The existing Diet, Fitness, and Analytics screens already call these collection exports, so their presentation, default dates, date-only filtering, and empty states remain unchanged.

## Deliverables

- [Implementation and verification report](./002-frontend-meals-metrics-results.md) — contract mapping, exact changed files, test/build evidence, and backend coverage gap.
- [Structured batch report](./002-frontend-meals-metrics-batch-report.yaml) — machine-readable implementation and verification status.
- [Updated implementation checkpoint](./checkpoints/tasks-to-impl.yaml) — task-to-code/test traceability.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/001-backend.md` — task-001 API contract index.
- `.github/modernize/rearchitecture/artifacts/001-backend-results.md` — backend activity API and validation evidence.
- `.github/modernize/rearchitecture/artifacts/002-frontend.md` — prior task-002 scope and API-client boundaries.
- `.github/modernize/rearchitecture/artifacts/checkpoints/tasks-to-impl.yaml` — prior task traceability/checkpoint.
- `server/src/routes/activity.ts` and `server/src/validation.ts` — source-of-truth nutrition/progress routes and schemas.

## Evidence Mapping

- `activity.ts#/nutrition` + `validation.ts#mealSchema` → `meals` API collection at `/api/nutrition`; focused client tests verify pagination, date-preserving request bodies, idempotency/CSRF headers, update, and delete.
- `activity.ts#/progress` + `validation.ts#metricSchema` + `serializeMetric` → `metrics` API collection at `/api/progress`; focused client tests verify the server's `weight` response field, date strings, idempotency/CSRF headers, update, and delete.
- Existing `Diet.jsx`, `Fitness.jsx`, and `Analytics.jsx` call these service exports already → no page/UI edits; existing date defaults, sort order, today-only totals, and empty-state branches remain in place.
- Backend contract source defines every route used by the frontend; it supports weight/date only, and test coverage is incomplete for metrics and meal read/update/delete behavior (details in the results report).

## Test Results

- Command: `npm test`
- Passed: 22
- Failed: 0
- Skipped: 0
- Failure details: none.
- Frontend build: `npx vite build` — passed, exit code 0; existing large-chunk warning remains.
- Focused lint: `npx eslint src/services/api.js src/services/api.test.js` — passed, exit code 0.
