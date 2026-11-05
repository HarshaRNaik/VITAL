# Execution Plan: VITAL Fitness Production Repair and Public Experience

**Project**: VITAL Fitness

## Technical Framework

- **Language**: JavaScript/TypeScript (React JSX frontend; TypeScript server)
- **Framework**: React 19, Vite 8, Express 5
- **Build Tool**: npm
- **Data and authentication**: Supabase Auth/PostgreSQL with RLS; retained legacy Prisma API
- **Key dependencies**: React Router, Supabase JS, Google GenAI SDK, Prisma

## Overview

Repair the feasible production-facing VITAL Fitness flows, integrate the Gemini AI
Coach using the existing project architecture, and provide a professional public
landing page. Preserve authentication, user-owned data, and existing application
routes while making the root route the public landing page and retaining clear
navigation to login, registration, and the dashboard.

Work must begin by reviewing the existing worktree. Integrate with the pre-existing
changes rather than reverting or overwriting them, especially the modified coach
route/tests and the untracked Coach/health API, data, exercise assets, and Gemini
preparation scripts reported by the user. Do not treat those files as disposable.

The plan is scoped to the requested product repair and presentation work; it does
not include deployment, production configuration edits, paid Gemini requests, or
destructive database operations.

## Goals and Constraints

- Audit and repair feasible backend, AI, workout, nutrition, dashboard, and
  analytics integrations; preserve established auth, routes, and user data.
- Integrate the Gemini Coach in the existing design, with safe local/mock
  verification only; do not make paid model calls.
- Build a responsive, accessible, premium public landing page at `/`. Keep the
  existing login, registration, and dashboard navigation and route behavior.
- Keep claims limited to verified application capabilities. Demo material must be
  clearly illustrative; do not invent user statistics or use fake media URLs.
- Include SEO/performance fundamentals and honor reduced-motion preferences.
- Protect secrets and user-owned data. Do not edit `.env`, `.env.local`, production
  settings, or deployment configuration; do not run destructive database actions.
- Do not deploy, commit, or stage changes. Preserve any unrelated pre-existing
  worktree edits.
- Verify with focused tests and a production build. Report concrete changed files,
  observed behavior, validation results, external configuration blockers, and
  limitations without claiming unverified outcomes.

## Work Areas

| Area | Intended outcome |
|---|---|
| Existing product flows | Backend, AI, workout, nutrition, dashboard, and analytics paths are audited and feasible defects are repaired without breaking auth or user data. |
| Gemini Coach | Existing Coach implementation and uncommitted work are reconciled; supported functionality is verified without paid calls. |
| Public entry | Root route presents an accessible, responsive landing page and preserves existing account/app navigation. |
| Safety and verification | Security/dependency concerns are checked; focused tests and production build results are recorded. |

## Execution Order

1. Establish a worktree baseline and inspect relevant routes, tests, schemas, and
   the pre-existing modified/untracked files. Preserve unrelated work.
2. Audit and repair the existing application integrations, with tests for changed
   behavior and no destructive database actions.
3. Complete and verify the Gemini Coach integration using only mocks or other
   non-billable local checks; document any external configuration needed.
4. Implement the root landing page while retaining the existing account and
   dashboard routes and navigation.
5. Perform the scoped dependency/security check and final verification. Run
   focused relevant tests and the production build; record results and blockers.

## Acceptance Criteria

- Existing authentication, private user data ownership, and login/registration/
  dashboard routes remain functional.
- Requested production-facing integrations are reviewed; feasible defects are
  addressed, and anything blocked by unavailable external services or configuration
  is reported rather than simulated as successful.
- Gemini verification does not make paid calls or disclose credentials.
- `/` is a responsive, accessible public landing page with accurate, capability-
  only messaging, illustrative-only demo content, and preserved navigation.
- SEO/performance basics and reduced-motion behavior are addressed.
- Focused tests and the production build are attempted and their actual outcomes
  are reported. No deployment, commit, staging, environment-file edit, production
  setting edit, or destructive database operation occurs.

## External Configuration and Limitations

Gemini service credentials/model availability and hosted Supabase/Vercel behavior
may require external configuration or live services that cannot be changed or
validated under this request. Do not read or alter environment files to resolve
such blockers, and do not call a paid Gemini API. Report which behavior was
validated locally and which requires authorized configuration or production
verification. The repository is a JavaScript/TypeScript application; the
modernization task schema's built-in language routing is Java/.NET-oriented, so
this plan records the actual language and requires an appropriate JS/TS executor.

