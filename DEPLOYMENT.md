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
4. Add the redirect URLs in **Authentication → URL Configuration**: `http://localhost:5173/login` for local OAuth/password recovery and `https://<your-production-domain>/login` for production. Add only the Vercel preview URL pattern your team needs. The OTP code entry itself stays in the app and does not require a custom verification endpoint.
5. Supabase's default email sender is for evaluation: current Supabase guidance limits it to authorized team addresses and two messages per hour, with no delivery SLA. For real users, configure a dedicated SMTP provider in **Authentication → Settings → SMTP Settings** (menu wording may vary by Dashboard version). Verify the sender domain with the email provider, configure SPF/DKIM/DMARC as they instruct, then enter the SMTP host, port, username, password, sender name, and sender email in Supabase. Keep SMTP credentials in Supabase's dashboard, never in Vite or this repository. Set an appropriate Auth email rate limit and test inbox, spam, and delivery behavior before launch.
6. Test with a new address and a returning address: request code, paste/type the six digits, try a wrong/expired code, resend after the countdown, refresh after successful sign-in, and log out. Google OAuth remains separately configured under the Google steps below. No Google security code is requested for email OTP.

The Coach request includes bounded recent workouts, meals, and weight measurements, the caller's fitness goal and preferences, active goals, and at most six messages from that caller's most recent saved Coach conversation. Each read uses the caller's Supabase access token and RLS; no service-role key is used. Gemini receives this context and the current question. Avoid sending sensitive health details that are not needed for a Coach response, and review the Google API data terms and chosen model before production use.

## Google sign-in configuration

The application uses Supabase Auth's Google provider. There are no Google OAuth secrets in Vite variables or source code.

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen with the app name, support email, and the appropriate audience. Add authorized domains for the Supabase project domain and your production app domain when requested.
2. Create an OAuth client with application type **Web application**. Add the Supabase Auth callback URI shown on the Supabase Google provider setup page to **Authorized redirect URIs**. It has the form `https://<project-ref>.supabase.co/auth/v1/callback` (use the exact URL shown for your project). Add any custom Supabase Auth domain callback only if that is the callback Supabase shows.
3. Copy the Google client ID and client secret into the Supabase Dashboard under **Authentication → Providers → Google**. Save and enable the provider. Keep the client secret in Supabase only; never place it in `.env`, Vercel, or frontend code.
4. In **Supabase → Authentication → URL Configuration**, set the Site URL to the production Vercel site and add the allowed redirect URLs the app uses: `http://localhost:5173/login`, `https://<your-production-domain>/login`, and any explicit Vercel preview URL patterns you intend to support. Avoid broad wildcard entries. The app's OAuth callback returns to `/login` on the same origin and restores a safe local destination.
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
