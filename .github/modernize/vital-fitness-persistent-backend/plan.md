# Modernization Plan: VITAL Fitness Supabase Persistence and Authentication

**Project**: VITAL Fitness App

## Technical Framework

- **Frontend**: React 19, JavaScript/JSX, Vite
- **Backend**: Express 5, TypeScript
- **Database access**: PostgreSQL through Prisma 7 and `@prisma/adapter-pg`
- **Validation and tests**: Zod, Vitest, Supertest
- **Current auth controls**: opaque server session cookie, CSRF protection,
  rate limiting, and authenticated API routes

## Current-State Findings

- The frontend API client in `src/services/api.js` already calls Express
  endpoints for workouts, nutrition, progress, settings, workout plans,
  game state, and assistant conversations. Mutations include CSRF handling;
  selected writes also use idempotency keys.
- The server has Prisma models for profiles (`User`), settings, workout plans,
  completed workouts and sets, meals, progress metrics/goals, game state,
  and assistant conversations/messages. The routes already scope many
  operations to the authenticated server-session user.
- Authentication currently uses bcrypt credentials and an opaque
  `vital_session` cookie stored as a hash in PostgreSQL. Supabase Auth is not
  present in the dependencies or configuration.
- `src/App.jsx` redirects `/login` to `/`, and `NavBar.jsx` only shows account
  controls when a user exists. `ProtectedRoute.jsx` exists but is not used by
  the current route tree. The current UI therefore has a login-bypass/guest
  path that must remain available.
- Existing migrations, API tests, client API tests, and setup documentation
  are present. `.env.example` currently contains local placeholders only.
- No production database access, Supabase credentials, or real external
  database is available or in scope.

## Overview

Add Supabase Auth and Supabase-hosted PostgreSQL persistence for VITAL Fitness
without replacing the existing application experience. Authenticated records
will be tied to the verified Supabase identity and isolated by database
policies. Existing UI routes, workouts, exercise demonstrations/GIFs, and
guest access remain available; signing in must not become a prerequisite for
using the application.

The work will extend the current Express/Prisma/API foundation surgically,
preserve existing records through reviewed additive migrations, and verify
the API and isolation behavior using local/test-only configuration.

## Migration Impact Summary

| Area | Current State | Target State | User Impact |
|---|---|---|---|
| Identity | App-owned bcrypt accounts and sessions | Supabase Auth identity | Safe account authentication |
| User data | Existing Prisma/PostgreSQL API | Supabase PostgreSQL with RLS | Durable, isolated records |
| App access | Login is not a route gate | Login remains optional | Existing guest flow retained |
| Verification | Existing unit/API tests | Auth, persistence, RLS tests | Safer changes with evidence |

## Phases

1. **Identity and storage** — integrate Supabase Auth, link application
   profiles safely, and add owner isolation for user-owned data.
2. **API and application compatibility** — preserve current endpoint/UI
   behavior while persisting the requested data through the existing API.
3. **Security and verification** — test cross-user isolation and persistence,
   review key handling, update setup guidance, and run builds/tests.

## Scope and Safety Constraints

- Persist profiles, workout plans, completed workouts, exercise sets, fitness
  progress, nutrition logs, AI chat history, and settings. Preserve persistence
  of existing adjacent features such as goals and game state where already
  supported by the API.
- Use the authenticated Supabase user ID as the trusted ownership identity.
  Never trust a client-supplied owner ID for reads or writes. Apply RLS to
  every user-owned table; protect child records through their owning workout,
  plan, or conversation. Keep the shared exercise catalogue read-only as
  appropriate.
- Use only a least-privilege public Supabase anon key in browser configuration.
  Any privileged key, if the selected server-side design truly requires one,
  must remain server-only and must never be exposed to Vite/client code.
  Prefer request-scoped authenticated database access compatible with RLS;
  document any privileged-server exception and retain explicit ownership
  checks if that access path bypasses RLS.
- Preserve API CSRF/rate-limit protections where applicable. Maintain usable
  guest access without a required login gate, including graceful behavior for
  guest-mode writes if a persistent guest identity is needed.
- Do not alter the user-visible layout, features, exercise assets/GIFs, or
  current login bypass behavior in `src/App.jsx` and `src/components/NavBar.jsx`.
- Create reviewed, additive migrations only. Do not drop/reset existing data,
  automatically migrate on server startup, or automatically link old accounts
  based only on an unverified email address.
- Use environment-variable placeholders and concise local setup instructions.
  Do not obtain or invent credentials, connect to a production database, or
  apply migrations to a production/external database.
- Validate the API persistence/authentication contract and RLS user isolation
  where a local/test Supabase-compatible environment is available. Otherwise,
  run the isolated tests and clearly report the integration-test limitation.

## Open Questions & Questionnaire

None. The target, preserved UI behavior, credential restrictions, migration
safety, and testing scope were specified in the approved assignment.
