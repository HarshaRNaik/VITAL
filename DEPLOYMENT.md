# Cloud deployment guide

## Inspected architecture

- The Vite/React application is the product frontend. Its authenticated data path is Supabase Auth plus Supabase Postgres with row-level security (RLS).
- The Express/Prisma API and its PostgreSQL schema are a retained legacy backend. The browser app does not call its cookie-authenticated routes. That API still contains a separate bcrypt/password and cookie-session login; do not expose `start:server` publicly until it is migrated to Supabase token verification or intentionally retired. Do not point its Prisma API at the Supabase application schema or deploy its migrations into that project.
- The Coach was previously rule-based. The new independent Coach API verifies Supabase access tokens, reads only the caller's recent records through their RLS-scoped token, calls Gemini on the server, and returns the response. The browser persists messages through the existing Supabase RPC.
- The local `.env` is ignored by Git and its values are not included in this guide. Live authentication, email delivery, persistence, Gemini, CORS, and deployment still require verification against the configured provider projects.

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
| `VITE_API_BASE_URL` | Local only: `http://localhost:4000`. Production Coach calls use the Vercel same-origin API path. |

Vite embeds `VITE_` values in the client bundle. Do not set a service-role key or Gemini key in any `VITE_` variable.

## Vercel Coach Function

The root `api/[...path].ts` Vercel Function forwards `/api/*` requests to the existing Coach Express app. The Vite build still outputs `dist`; Vercel deploys the function from the root `api/` directory alongside the static output. Production frontend code always uses same-origin `/api/coach/reply`, even if a stale production `VITE_API_BASE_URL` is present. For Git-based deployments, make sure the API entry point, Coach server modules, and Vercel configuration are included in the deployed revision; untracked local files are not part of a Git deployment.

Keep the Vercel project root at `.`, install with `npm ci`, build with `npm run build:frontend`, and serve `dist`. `vercel.json` sets the Coach Function maximum duration to 60 seconds and retains the SPA rewrite.

Set these server-side variables in the Vercel project for Production (and Preview when testing):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ORIGINS` | `https://vital-cyan-beta.vercel.app` (exact origin; used for cross-origin requests) |
| `SUPABASE_URL` | Same project URL as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same public anon/publishable key as `VITE_SUPABASE_ANON_KEY` |
| `GEMINI_API_KEY` | Google AI Studio key; secret, server-side only |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `GEMINI_FILE_SEARCH_STORE` | Existing `fileSearchStores/...` resource name; obtain the exact value from the current configuration, do not create another store |

The endpoint requires the Gemini key, model and existing File Search store. The server validates the caller's Supabase token and reads only that user's RLS-protected context. `/api/health` reports backend, Supabase configuration, Gemini model API reachability, and File Search store reachability without returning secrets. `/api/health/deep` also performs a small live generation request with File Search; use it for manual smoke checks, not frequent monitoring. `render.yaml` remains a repository template only; its presence does not indicate an active service.

Run `node scripts/evaluate_gemini_file_search.mjs` to exercise the 25-question retrieval set against the configured existing store. It does not create or modify a store. Gemini provider outages stop the run early; successful runs check expected dataset facts and source citations.

For local development, retain `VITE_API_BASE_URL=http://localhost:4000`, run `npm run dev:coach`, and run `npm run dev` in separate terminals. Local health is `http://localhost:4000/health`; Vite also proxies `/api/health` to the Coach process.

## Email OTP and password authentication

The frontend uses Supabase Auth's built-in six-digit email OTP. New email addresses are created by Supabase when the OTP is requested; the existing `on_auth_user_created_vital_fitness` trigger creates their profile, settings, and initial game state. Returning email users use the same `signInWithOtp` and `verifyOtp` flow. No application OTP store or database migration is used.

1. In the Supabase Dashboard, open **Authentication → Sign In / Providers → Auth Providers → Email**. Enable Email if needed. Keep phone authentication disabled. Email OTP is an email sign-in method and uses the same provider configuration as email/password.
2. Open **Authentication → Email Templates → Magic Link**. Set a clear subject such as `Your VITAL FITNESS sign-in code`, and use a template body that includes `{{ .Token }}` as the actual code, for example:

   ```html
   <h2>Your VITAL FITNESS sign-in code</h2>
   <p>Enter this six-digit code in the app:</p>
   <p style="font-size: 28px; font-weight: 700; letter-spacing: 8px">{{ .Token }}</p>
   <p>If you did not request this code, you can ignore this email.</p>
   ```

   The app calls `verifyOtp` with `type: 'email'`. The project’s Email OTP expiration setting also controls OTP validity. Supabase's default resend interval is 60 seconds; the UI uses a 60-second resend countdown. Adjust provider rate limits deliberately if you change the interval. Changing the Magic Link template to a code affects passwordless emails that previously relied on clickable magic links, so review the template and test every email sign-in flow after saving.
3. If password registration is retained, open the Email provider settings and enable **Confirm email**. This makes new password accounts verify their email before they receive an authenticated session. Keep the app’s email confirmation and password recovery templates configured, and test resend confirmation and password reset links.
4. Add the redirect URLs in **Authentication → URL Configuration**: `http://localhost:5173/login` for local auth and `https://vital-cyan-beta.vercel.app/login` for production auth. Set the hosted project's Site URL to `https://vital-cyan-beta.vercel.app`. Add only the Vercel preview URL pattern your team needs. The OTP code entry itself stays in the app and does not require a custom verification endpoint.
5. Supabase's default email sender is for evaluation: current Supabase guidance limits it to authorized team addresses and two messages per hour, with no delivery SLA. For real users, configure a dedicated SMTP provider in **Authentication → Settings → SMTP Settings** (menu wording may vary by Dashboard version). Verify the sender domain with the email provider, configure SPF/DKIM/DMARC as they instruct, then enter the SMTP host, port, username, password, sender name, and sender email in Supabase. Keep SMTP credentials in Supabase's dashboard, never in Vite or this repository. Set an appropriate Auth email rate limit and test inbox, spam, and delivery behavior before launch.
6. Test with a new address and a returning address: request code, paste/type the six digits, try a wrong/expired code, resend after the countdown, refresh after successful sign-in, and log out. Google OAuth remains separately configured under the Google steps below. No Google security code is requested for email OTP.

The Coach request includes bounded recent workouts, meals, and weight measurements, the caller's fitness goal and preferences, active goals, and at most six messages from that caller's most recent saved Coach conversation. Each read uses the caller's Supabase access token and RLS; no service-role key is used. Gemini receives this context and the current question. Avoid sending sensitive health details that are not needed for a Coach response, and review the Google API data terms and chosen model before production use.

## Google sign-in configuration

The application uses Supabase Auth's Google provider. There are no Google OAuth secrets in Vite variables or source code.

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen with the app name, support email, and the appropriate audience. Add authorized domains for the Supabase project domain and your production app domain when requested.
2. Create an OAuth client with application type **Web application**. Add the Supabase Auth callback URI shown on the Supabase Google provider setup page to **Authorized redirect URIs**. It has the form `https://<project-ref>.supabase.co/auth/v1/callback` (use the exact URL shown for your project). Add any custom Supabase Auth domain callback only if that is the callback Supabase shows.
3. Copy the Google client ID and client secret into the Supabase Dashboard under **Authentication → Providers → Google**. Save and enable the provider. Keep the client secret in Supabase only; never place it in `.env`, Vercel, or frontend code.
4. In **Supabase → Authentication → URL Configuration**, set the Site URL to `https://vital-cyan-beta.vercel.app` and add these allowed redirect URLs: `https://vital-cyan-beta.vercel.app/login` and `http://localhost:5173/login`. Add only explicit Vercel preview URL patterns you intend to support. Avoid broad wildcard entries. The app sends production callbacks to the production Vercel origin and local callbacks to the current local origin, then restores a safe in-app destination.
5. In **Google Cloud → APIs & Services → Credentials**, make sure the OAuth consent screen is published or that each test account is included as a test user while the app remains in testing.
6. For local testing, set only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL` in the ignored local `.env`, add `http://localhost:5173/login` to the Supabase redirect allowlist, start Vite and the Coach API, then test both a new Google account and an existing account. Verify profile creation, a protected page redirect, refresh restoration, and logout.
7. For production, add the production `/login` URL to the Supabase redirect allowlist and the production site domain to Google consent/authorized domains. Test signup and return login from the deployed Vercel origin. OAuth cannot complete until the Google provider credentials are saved in Supabase.

Google client ID/client secret are configured only in Supabase's provider settings. Firebase and custom Google environment variables are not needed. Supabase email verification and reset emails use Supabase Auth's email templates; test delivery and redirect links in the configured project.

Official setup references: [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Supabase data and migrations

The active frontend database is Supabase Postgres; no local database files are used for user data. Apply the committed `supabase/migrations` in timestamp order to the intended Supabase project using a reviewed migration process. The latest Gym Partner migration is `20261031000000_gym_workouts.sql`. Migration application is not part of these deployment files and was not performed here.

Configure the Supabase Auth Site URL and redirect allowlist for the Vercel production domain and any Preview domain policy you choose. Keep email confirmation and project auth limits configured intentionally. Verify owner isolation with the SQL RLS tests in a non-production project before launch. Back up the project before applying schema changes.

The legacy Prisma backend has its own data model and local PostgreSQL example in `.env.example`. It is not required by Vercel or the Coach service. No database migration, data copy, or reassignment of existing accounts was performed. If you later decide to deploy that legacy API, first identify its intended PostgreSQL database and use its migrations only against that separate database.

## Deployment, validation, and rollback

1. Push the reviewed repository to GitHub without `.env` or credentials.
2. Confirm the Vercel server-side variables above are set without placing secrets in frontend-prefixed variables.
3. Deploy a Vercel Preview and confirm `GET /api/health` returns JSON (not the SPA HTML) and reports Gemini and File Search as available.
4. In Supabase Auth, add the Vercel site/redirect URLs. Confirm sign-in, private record access, Coach conversation persistence, and user isolation.
5. From the Preview site, send a signed-in Coach prompt and verify a grounded response and persisted conversation.
6. Promote only after checks pass. Roll back the Vercel deployment if a smoke check fails; do not roll back or reset the database as an application rollback. Database migrations need a separately reviewed forward-fix or restoration plan.

## Cost and free-tier limits

- Vercel Hobby is free for personal, non-commercial projects and has usage limits; commercial use requires an eligible paid plan. See [Vercel Hobby](https://vercel.com/docs/plans/hobby).
- Supabase Free includes two active projects and 500 MB database storage; inactive projects may pause. See [Supabase pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- Gemini API offers a free tier with limited models/quotas; free-tier data handling differs from paid-tier terms. API use may require a paid tier depending on model, quota, and production needs. See [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

These plans can start at $0 for a personal preview, but do not guarantee production availability or zero costs as usage and provider terms change.
