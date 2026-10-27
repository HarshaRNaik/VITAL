# Auth Cookie Session

Integrate the VITAL Fitness browser client with the Express auth API using the HttpOnly session cookie and an in-memory CSRF token.

## What Happened

For VITAL-FITNESS_APP task 002, task-001 backend contracts use `GET /api/auth/session`, `GET /api/auth/csrf`, and POST register/login/logout endpoints. Mutating requests require the CSRF cookie/header pair and the browser must include credentials. Keeping the CSRF token in module memory avoids persisting it; the browser owns the HttpOnly session cookie. A stale CSRF token may be refreshed once after a `CSRF_INVALID` response.

## Takeaway

Restore the public user from `/api/auth/session` before protected-route redirects. For mutations, fetch the CSRF token if none is cached, send it in `X-CSRF-Token`, include credentials, and retry only once when the API explicitly reports `CSRF_INVALID`. Align frontend validation with backend schemas; API validation remains authoritative.

## History
- 2026-10-25 (VITAL-FITNESS_APP/002-frontend-auth): initial.
