# Cloud deployment guide

## Inspected architecture

- The Vite/React application is the product frontend. Its authenticated data path is Supabase Auth plus Supabase Postgres with row-level security (RLS).
- The Express/Prisma API and its PostgreSQL schema are a retained legacy backend. The browser app does not call its cookie-authenticated routes. Do not point the legacy Prisma API at the Supabase application schema or deploy its migrations into that project.
- The Coach was previously rule-based. The new independent Coach API verifies Supabase access tokens, reads only the caller's recent records through their RLS-scoped token, calls Gemini on the server, and returns the response. The browser persists messages through the existing Supabase RPC.
- No cloud project credentials or `.env` file were present during preparation. Live authentication, persistence, Gemini, CORS, and deployment have not been verified.

## Vercel frontend

Connect the GitHub repository to Vercel with:

| Setting | Value |
| --- | --- |
| Root directory | `.` (repository root) |
| Install command | `npm ci` |
| Build command | `npm run build:frontend` |
| Output directory | `dist` |

`vercel.json` contains these settings and an SPA rewrite so refreshing React routes serves `index.html`.

Set these project environment variables for Production (and Preview if desired):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key; this is public and protected by RLS |
| `VITE_API_BASE_URL` | Render Coach API origin, for example `https://vital-coach-api.onrender.com` |

Do not set a service-role key or Gemini key in Vercel. Vite embeds `VITE_` values in the client bundle.

## Render Coach API

`render.yaml` describes the separate Coach service:

| Setting | Value |
| --- | --- |
| Root directory | `.` (repository root) |
| Build command | `npm ci && npm run build:server` |
| Start command | `npm run start:coach` |
| Health-check path | `/health` |

Set the service's environment variables in Render:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ORIGINS` | Exact comma-separated Vercel origin(s), e.g. `https://your-project.vercel.app`; include a custom domain if used. No wildcard is accepted. |
| `SUPABASE_URL` | Same project URL as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same public anon/publishable key as `VITE_SUPABASE_ANON_KEY` |
| `GEMINI_API_KEY` | Secret from Google AI Studio; store only in Render's secret environment |
| `GEMINI_MODEL` | A model identifier available to your Google project; set explicitly, no automatic paid-model fallback |
| `PORT` | Set automatically by Render; locally defaults to `4000` |

For local Coach development, set the variables above in an ignored `.env`, keep `APP_ORIGINS=http://localhost:5173`, and run `npm run dev:coach` in one terminal and `npm run dev` in another. Set `VITE_API_BASE_URL=http://localhost:4000` in the frontend environment.

The Coach request includes a bounded summary of recent workouts, meals, and weight measurements for that authenticated user. Gemini receives that summary and the current question. Avoid sending sensitive health details that are not needed for a Coach response, and review the Google API data terms and chosen model before production use.

## Supabase data and migrations

The active frontend database is Supabase Postgres; no local database files are used for user data. Apply the committed `supabase/migrations` in timestamp order to the intended Supabase project using a reviewed migration process. The latest Gym Partner migration is `20261031000000_gym_workouts.sql`. Migration application is not part of these deployment files and was not performed here.

Configure the Supabase Auth Site URL and redirect allowlist for the Vercel production domain and any Preview domain policy you choose. Keep email confirmation and project auth limits configured intentionally. Verify owner isolation with the SQL RLS tests in a non-production project before launch. Back up the project before applying schema changes.

The legacy Prisma backend has its own data model and local PostgreSQL example in `.env.example`. It is not required by Vercel or the Coach service. No database migration, data copy, or reassignment of existing accounts was performed. If you later decide to deploy that legacy API, first identify its intended PostgreSQL database and use its migrations only against that separate database.

## Deployment, validation, and rollback

1. Push the reviewed repository to GitHub without `.env` or credentials.
2. Create the Render service from `render.yaml`, set the environment values above, and deploy. Confirm `https://<render-service>/health` returns `{"status":"ok"}`.
3. Create the Vercel project from the same repository with the settings above; add Vercel environment variables and deploy.
4. In Supabase Auth, add the Vercel site/redirect URLs. Confirm sign-in, private record access, Coach conversation persistence, and user isolation.
5. From the deployed site, send a safe Coach prompt. Check the Render logs for request IDs and provider status only; never add token or prompt logging.
6. Roll back the Vercel or Render deployment to the prior successful application deploy if a smoke check fails. Do not roll back or reset the database as an application rollback. Database migrations need a separately reviewed forward-fix or restoration plan.

## Cost and free-tier limits

- Vercel Hobby is free for personal, non-commercial projects and has usage limits; commercial use requires an eligible paid plan. See [Vercel Hobby](https://vercel.com/docs/plans/hobby).
- Render Free web services spin down after 15 minutes idle, can take about a minute to wake, have ephemeral filesystems, and are explicitly intended for preview/hobby use rather than production. The Coach stores no durable user records on Render. See [Render free services](https://render.com/docs/free).
- Supabase Free includes two active projects and 500 MB database storage; inactive projects may pause. See [Supabase pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- Gemini API offers a free tier with limited models/quotas; free-tier data handling differs from paid-tier terms. API use may require a paid tier depending on model, quota, and production needs. See [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

These plans can start at $0 for a personal preview, but do not guarantee production availability or zero costs as usage and provider terms change.
