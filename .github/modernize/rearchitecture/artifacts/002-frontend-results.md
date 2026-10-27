# Task 002 — Frontend Auth/API Client Results

**Generated:** 2026-10-25T00:48:42Z  
**Workspace:** `C:\projects\VITAL-FITNESS_APP`  
**Scope:** First bounded frontend API-client and registration/login/session portion of task 002.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/001-backend.md` — task-001 backend contract index.
- `.github/modernize/rearchitecture/artifacts/001-backend-results.md` — auth contract behavior, test evidence, and no-real-DB safety boundary.
- `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`, `server/src/middleware/csrf.ts`, `server/src/app.ts`, and `server/src/validation.ts` — direct contract verification.

## Evidence Mapping

- `auth.ts#/csrf,/session,/register,/login,/logout` → `src/services/api.js` API wrappers; client tests in `src/services/api.test.js`.
- `csrf.ts#csrfProtection` → session-cookie credentials and `X-CSRF-Token` header handling in `src/services/api.js`; CSRF-refresh behavior verified in the fifth client test.
- `validation.ts#registerSchema` → registration form enforces the server's 12-character minimum; `npm test` confirms all current tests pass.
- User requirement to preserve current UI and GIF assets → login/register forms and navigation remain in place; all nine `public/exercises/*.gif` assets compare byte-for-byte to the generated `dist/exercises` files.

## Implementation

The frontend now treats the API cookie as the authentication source:

- Session restoration calls `GET /api/auth/session`. Protected routes wait for the result before redirecting.
- Registration and login submit asynchronously, retain the existing form layouts and success navigation, and show API error messages.
- Logout calls the API and preserves the signed-in UI if server logout fails, showing an inline alert.
- Mutating auth requests first obtain a CSRF token, include credentials, and send `X-CSRF-Token`. A `CSRF_INVALID` response refreshes the token and retries once.
- CSRF token state remains in module memory; the HttpOnly session cookie remains managed by the browser.
- Existing local activity collections and mock assistant helpers remain intact.

## API Contract Assumptions

Verified against the task-001 server source:

| Request | Request/response behavior used |
|---|---|
| `GET /api/auth/csrf` | Returns `{ csrfToken }` and sets the readable `vital_csrf` cookie. |
| `GET /api/auth/session` | Returns `{ user }`; unauthenticated or expired sessions resolve to `{ user: null }`. |
| `POST /api/auth/register` | JSON `{ name, email, password, goal }`; successful response is HTTP 201 with `{ user, game, csrfToken }`; duplicate email is HTTP 409. |
| `POST /api/auth/login` | JSON `{ email, password }`; success returns `{ user, csrfToken }`; invalid credentials return HTTP 401. |
| `POST /api/auth/logout` | Requires current session and CSRF; success returns `{ ok: true, csrfToken }` and clears the session cookie. |

Other assumptions:

- `user` is the public object `{ id, email, name, goal }`; password material is not stored client-side.
- Server errors use `{ error: { code, message, details? } }`.
- The API is same-origin at `/api` by default. Vite proxies that prefix to `http://localhost:4000`; `VITE_API_BASE_URL` can supply a deployed API origin.
- Browser fetches use `credentials: 'include'`; the server's `vital_session` cookie is HttpOnly, SameSite=Lax, and scoped to `/api`.
- The backend accepts passwords from 12 to 72 UTF-8 bytes. The frontend checks the minimum; server validation enforces the byte maximum and remaining schema limits.

## Exact Authored Files Changed

| File | Change |
|---|---|
| `src/services/api.js` | Added auth API client, credentials, CSRF acquisition/retry, and API error handling; retained local workout/meal/metric collections and mock assistant helper. |
| `src/context/AuthContext.jsx` | Added API-backed session bootstrap and async registration/login/logout; removed local account/password authentication. |
| `src/pages/Login.jsx` | Wired asynchronous API login, pending state, and server error display. |
| `src/pages/Register.jsx` | Wired asynchronous API registration, pending state, and backend-compatible password minimum. |
| `src/components/ProtectedRoute.jsx` | Defers redirect until API session restoration completes. |
| `src/components/NavBar.jsx` | Wires server logout and presents logout errors. |
| `src/services/api.test.js` | Added four unit tests for session, registration, login error mapping, and CSRF-protected logout/token refresh. |
| `.github/modernize/rearchitecture/artifacts/002-frontend.md` | Added artifact index and task summary. |
| `.github/modernize/rearchitecture/artifacts/002-frontend-results.md` | Added detailed implementation and verification evidence. |
| `.github/modernize/rearchitecture/artifacts/002-frontend-batch-report.yaml` | Added structured batch result. |
| `.github/modernize/rearchitecture/artifacts/checkpoints/tasks-to-impl.yaml` | Preserved task-001 traceability and added the bounded task-002 mapping. |
| `.github/modernize/rearchitecture/team/frontend/log.md` | Recorded frontend findings and consumed learnings. |
| `.github/modernize/rearchitecture/learnings/frontend/auth-cookie-session.md` | Recorded the reusable cookie/CSRF integration approach. |

### Build side effects

`npx vite build` refreshed `dist/index.html`, `dist/assets/index-D3yTk7LP.css`, and `dist/assets/index-B2jL6QAA.js`. The nine `public/exercises/*.gif` source files were not modified; the build output has the same nine assets and SHA-256 comparison passed. There is no Git metadata, so no repository diff could be used to compare generated-file baselines.

## Test Results

- Command: `npm test`
- Passed: 18
- Failed: 0
- Skipped: 0
- Failure details: none. This includes five new API client tests and the 13 existing backend/unit tests; backend tests use Prisma test doubles.
- Build command: `npx vite build`
- Result: passed, exit code 0; Vite reported the existing >500 kB JavaScript chunk warning.
- Focused lint command: `npx eslint src/services/api.js src/services/api.test.js src/context/AuthContext.jsx src/pages/Login.jsx src/pages/Register.jsx src/components/ProtectedRoute.jsx src/components/NavBar.jsx`
- Lint result: exit code 1 due to one `react-refresh/only-export-components` error on the existing `useAuth` hook export in `src/context/AuthContext.jsx`; other selected files had no reported errors.
- GIF verification: nine source GIFs found under `public/exercises`; all nine compare byte-for-byte with their built `dist/exercises` copies.

## Safety and Remaining Integration Gaps

- No real DB connection, migration, credential, or secret was used or created.
- The task-001 backend evidence used mocked Prisma delegates; API behavior against an actually running database-backed service remains unverified.
- Activity collections, workout/nutrition/progress pages, assistant responses, and game/XP state remain local or mock-backed and are outside this auth-only bounded slice.
- Legacy `vital_users` and `vital_session` browser-storage entries are no longer read, migrated, or deleted; any old locally stored account data remains untouched until a separate cleanup/migration decision.
- All nine referenced animation GIFs are present under `public/exercises` and preserved byte-for-byte in the build output.
- Context docs (`context.md`, `board.md`, `decisions.md`) and frontend log/inbox did not exist at task start; coordinator-owned board/decision files were not created.
