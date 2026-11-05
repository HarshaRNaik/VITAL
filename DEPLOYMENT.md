# Cloud deployment guide

## Inspected architecture

- The Vite/React application is the product frontend. Its authenticated data path is Supabase Auth plus Supabase Postgres with row-level security (RLS).
- The Express/Prisma API and its PostgreSQL schema are a retained legacy backend. The browser app does not call its cookie-authenticated routes. That API still contains a separate bcrypt/password and cookie-session login; do not expose `start:server` publicly until it is migrated to Supabase token verification or intentionally retired. Do not point its Prisma API at the Supabase application schema or deploy its migrations into that project.
- The local `.env` is ignored by Git and its values are not included in this guide. Live authentication, email delivery, persistence, CORS, and deployment still require verification against the configured provider projects.

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
| `GEMINI_API_KEY` | Gemini API key (server-side only) |
| `GEMINI_MODEL` | Optional model override; defaults to `gemini-3.8-flash` |
| `SUPABASE_URL` | Server-side Supabase project URL used to validate Coach sessions |
| `SUPABASE_ANON_KEY` | Server-side Supabase publishable/anon key used with the caller's bearer token |

Vite embeds `VITE_` values in the client bundle. Do not set a service-role key or database password in any `VITE_` variable.

## Vercel API health

The Vercel deployment exposes a lightweight `GET /api/health` JSON endpoint. The SPA rewrite excludes `/api/*`, so unknown API paths remain API 404s instead of returning the frontend `index.html`. The application data path remains Supabase Auth and Supabase Postgres; the separate Express/Prisma API remains a local legacy service and is not deployed by the Vite frontend project.

Keep the Vercel project root at `.`, install with `npm ci`, build with `npm run build:frontend`, and serve `dist`. Configure the Gemini and server-side Supabase variables above in Vercel; none belong in a `VITE_` variable.
## Email OTP and password authentication

The frontend uses Supabase Auth's built-in six-digit email OTP. New email addresses are created by Supabase when the OTP is requested; the existing `on_auth_user_created_vital_fitness` trigger creates their profile, settings, and initial game state. Returning email users use the same `signInWithOtp` and `verifyOtp` flow. No application OTP store or database migration is used.

1. In the Supabase Dashboard, open **Authentication Ã¢â€ â€™ Sign In / Providers Ã¢â€ â€™ Auth Providers Ã¢â€ â€™ Email**. Enable Email if needed. Keep phone authentication disabled. Email OTP is an email sign-in method and uses the same provider configuration as email/password.
2. Open **Authentication Ã¢â€ â€™ Email Templates Ã¢â€ â€™ Magic Link**. Set a clear subject such as `Your VITAL FITNESS sign-in code`, and use a template body that includes `{{ .Token }}` as the actual code, for example:

   ```html
   <h2>Your VITAL FITNESS sign-in code</h2>
   <p>Enter this six-digit code in the app:</p>
   <p style="font-size: 28px; font-weight: 700; letter-spacing: 8px">{{ .Token }}</p>
   <p>If you did not request this code, you can ignore this email.</p>
   ```

   The app calls `verifyOtp` with `type: 'email'`. The projectÃ¢â‚¬â„¢s Email OTP expiration setting also controls OTP validity. Supabase's default resend interval is 60 seconds; the UI uses a 60-second resend countdown. Adjust provider rate limits deliberately if you change the interval. Changing the Magic Link template to a code affects passwordless emails that previously relied on clickable magic links, so review the template and test every email sign-in flow after saving.
3. If password registration is retained, open the Email provider settings and enable **Confirm email**. This makes new password accounts verify their email before they receive an authenticated session. Keep the appÃ¢â‚¬â„¢s email confirmation and password recovery templates configured, and test resend confirmation and password reset links.
4. Add the redirect URLs in **Authentication Ã¢â€ â€™ URL Configuration**: `http://localhost:5173/login` for local auth and `https://vital-cyan-beta.vercel.app/login` for production auth. Set the hosted project's Site URL to `https://vital-cyan-beta.vercel.app`. Add only the Vercel preview URL pattern your team needs. The OTP code entry itself stays in the app and does not require a custom verification endpoint.
5. Supabase's default email sender is for evaluation: current Supabase guidance limits it to authorized team addresses and two messages per hour, with no delivery SLA. For real users, configure a dedicated SMTP provider in **Authentication Ã¢â€ â€™ Settings Ã¢â€ â€™ SMTP Settings** (menu wording may vary by Dashboard version). Verify the sender domain with the email provider, configure SPF/DKIM/DMARC as they instruct, then enter the SMTP host, port, username, password, sender name, and sender email in Supabase. Keep SMTP credentials in Supabase's dashboard, never in Vite or this repository. Set an appropriate Auth email rate limit and test inbox, spam, and delivery behavior before launch.
6. Test with a new address and a returning address: request code, paste/type the six digits, try a wrong/expired code, resend after the countdown, refresh after successful sign-in, and log out. Google OAuth remains separately configured under the Google steps below. No Google security code is requested for email OTP.


## Google sign-in configuration

The application uses Supabase Auth's Google provider. There are no Google OAuth secrets in Vite variables or source code.

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen with the app name, support email, and the appropriate audience. Add authorized domains for the Supabase project domain and your production app domain when requested.
2. Create an OAuth client with application type **Web application**. Add the Supabase Auth callback URI shown on the Supabase Google provider setup page to **Authorized redirect URIs**. It has the form `https://<project-ref>.supabase.co/auth/v1/callback` (use the exact URL shown for your project). Add any custom Supabase Auth domain callback only if that is the callback Supabase shows.
3. Copy the Google client ID and client secret into the Supabase Dashboard under **Authentication Ã¢â€ â€™ Providers Ã¢â€ â€™ Google**. Save and enable the provider. Keep the client secret in Supabase only; never place it in `.env`, Vercel, or frontend code.
4. In **Supabase Ã¢â€ â€™ Authentication Ã¢â€ â€™ URL Configuration**, set the Site URL to `https://vital-cyan-beta.vercel.app` and add these allowed redirect URLs: `https://vital-cyan-beta.vercel.app/login` and `http://localhost:5173/login`. Add only explicit Vercel preview URL patterns you intend to support. Avoid broad wildcard entries. The app sends production callbacks to the production Vercel origin and local callbacks to the current local origin, then restores a safe in-app destination.
5. In **Google Cloud Ã¢â€ â€™ APIs & Services Ã¢â€ â€™ Credentials**, make sure the OAuth consent screen is published or that each test account is included as a test user while the app remains in testing.
6. For local testing, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored local `.env`, add `http://localhost:5173/login` to the Supabase redirect allowlist, start Vite, then test a new and an existing account. Verify profile creation, protected-page redirects, refresh restoration, and logout.
7. For production, add the production `/login` URL to the Supabase redirect allowlist and the production site domain to Google consent/authorized domains. Test signup and return login from the deployed Vercel origin. OAuth cannot complete until the Google provider credentials are saved in Supabase.

Google client ID/client secret are configured only in Supabase's provider settings. Firebase and custom Google environment variables are not needed. Supabase email verification and reset emails use Supabase Auth's email templates; test delivery and redirect links in the configured project.

Official setup references: [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Supabase data and migrations

The active frontend database is Supabase Postgres; no local database files are used for user data. For new setup, follow the seven-file migration sequence in `supabase/README.md`; do not blindly apply every file in the historical migration directory. The timestamped chat migration is not used by the app. The generated-plan migration is required for saved AI workout and nutrition plans. The original persistence migration also creates legacy Coach objects; review `supabase/optional-cleanup/remove_ai_coach.sql` if you want to remove those objects and any associated saved data. That SQL is destructive and must be reviewed and run manually after a verified backup. No migration or cleanup SQL was executed here.

Configure the Supabase Auth Site URL and redirect allowlist for the Vercel production domain and any Preview domain policy you choose. Keep email confirmation and project auth limits configured intentionally. Verify owner isolation with the SQL RLS tests in a non-production project before launch. Back up the project before applying schema changes.

The legacy Prisma backend has its own data model and local PostgreSQL example in `.env.example`. It is not required by the Vercel frontend. No database migration, data copy, or reassignment of existing accounts was performed. If you later decide to deploy that legacy API, first identify its intended PostgreSQL database and use its migrations only against that separate database.

## Deployment, validation, and rollback

1. Push the reviewed repository to GitHub without `.env` or credentials.
2. Confirm the Vercel server-side variables above are set without placing secrets in frontend-prefixed variables.
3. Deploy a Vercel Preview and confirm `GET /api/health` returns JSON (not the SPA HTML).
4. In Supabase Auth, add the Vercel site/redirect URLs. Confirm sign-in, private record access, and user isolation.
5. From the Preview site, verify Workout, Nutrition, Dashboard, and Analytics pages load and can read and save user-owned activity.
6. Promote only after checks pass. Roll back the Vercel deployment if a smoke check fails; do not roll back or reset the database as an application rollback. Database migrations need a separately reviewed forward-fix or restoration plan.

## Cost and free-tier limits

- Vercel Hobby is free for personal, non-commercial projects and has usage limits; commercial use requires an eligible paid plan. See [Vercel Hobby](https://vercel.com/docs/plans/hobby).
- Supabase Free includes two active projects and 500 MB database storage; inactive projects may pause. See [Supabase pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

These plans can start at $0 for a personal preview, but do not guarantee production availability or zero costs as usage and provider terms change.
