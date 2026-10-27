# Supabase setup

## Configure a project

1. Create a Supabase project, or start a local project with the Supabase CLI.
2. Apply the migrations in timestamp order:
   `migrations/20261025000000_supabase_persistence.sql`, then
   `migrations/20261026000000_atomic_writes_and_validation.sql`, then
   `migrations/20261027000000_chat_security_and_rate_limits.sql`, then
   `migrations/20261028000000_level_five_relic.sql`.
   With the CLI, link the project and run `supabase db push`. Alternatively,
   apply all four files in order in the Supabase SQL editor. Review the SQL
   before applying it to any shared database.
3. In the project's Auth URL settings, add the app URL (for local development,
   `http://localhost:5173`) and its redirect URL.
4. Copy `.env.example` to `.env` and set:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

5. Run `npm ci` and `npm run dev`.

The login screen is available at `/login`; browsing stays open when signed out.
Users need to sign in to read or write private records. With email confirmation
enabled, registration asks the user to confirm their address before signing in.

## Security model

- The app uses the Supabase publishable/anon key from the browser. That key is
  expected to be public; every private table has RLS enabled and policies
  compare the row owner to `auth.uid()`.
- No service-role key is used by this app. Never expose one to the frontend.
- Exercise plans in the built-in workout library are static application data.
  User-owned workout plans and their exercise sequences are stored separately.
- Game rewards are granted by a database function with fixed reward values,
  per-user idempotency keys, and checks that the corresponding activity belongs
  to the caller. Clients cannot update game state or insert reward rows
  directly.
- Workout creation and exercise-set writes, workout edits, and custom workout
  plan writes run as single database transactions. Activity forms reuse request
  IDs when retrying a failed submission, preventing duplicate records.
- Assistant conversation and message writes use authenticated RPCs instead of
  direct table writes. The database applies per-user per-minute limits to
  conversation creation and message submissions, and workout reward keys must
  match the canonical workout session key.
- Supabase Auth endpoints have provider-side rate limits. Configure and review
  sign-in, sign-up, email/SMS delivery, and token verification limits under
  Authentication → Rate Limits in the deployed project. The Express server's
  rate limiter protects only that legacy API; the browser app calls Supabase
  directly.
- The Express API's current rate limiter uses its default in-process store.
  If that legacy API is deployed with multiple instances, configure a shared
  rate-limit store so requests cannot evade limits by landing on another
  instance.
- The current coach generates rule-based responses locally and does not call an
  external AI provider. No AI API key is required. If a provider is added later,
  call it only from a server-side Edge Function or trusted backend using a
  server-side secret; never add the key to a `VITE_` variable or browser code.
- New Supabase identities receive profile, settings, and initial game-state
  rows from an `auth.users` trigger.
- Existing Express/Prisma tables are not dropped or modified by this
  migration. Existing data remains in place and is not automatically linked
  to Supabase identities.

## RLS verification

The SQL tests create two temporary auth users, verify owner reads across all
private record types, verify the second user cannot read the first user's
records, and verify a cross-user workout update cannot change the owner’s row.
Run against a local Supabase stack:

```powershell
supabase start
supabase test db
```

The SQL suite checks owner reads, cross-user row isolation, RLS activation on
each private public table, denied direct writes to assistant history, and
canonical workout reward keys. It also verifies that crossing the existing
1,500 XP level-five threshold persists the corresponding relic. Run it after
every migration against a local Supabase stack and in the deployment pipeline
before promotion.

## Secrets and production deployment

- Frontend build-time variables are public. Only set `VITE_SUPABASE_URL` and
  the project's publishable/anon key in the frontend hosting environment.
  Never set a service-role key, database password, or AI provider key as a
  `VITE_` variable.
- Keep the legacy Express `DATABASE_URL` only in the server's secret manager.
  Restrict database network access, use TLS, rotate credentials, and do not
  print connection strings or auth tokens in application logs.
- Use HTTPS in production, set the exact production site and redirect URLs in
  Supabase Auth, enable email confirmation, and review password, CAPTCHA,
  session lifetime, MFA, and provider rate-limit settings for the deployment's
  risk and traffic.
- Apply committed migrations through a reviewed deployment pipeline. Run the
  build, unit tests, and `supabase test db` against a disposable local/project
  before deploying. Never use a service-role key in client-side RLS tests.
- Preserve the public exercise GIFs and frontend static assets in the normal
  versioned application deployment; they are not database backups.

## Backup and recovery

- Configure Supabase-managed automated backups and, where the plan supports
  it, point-in-time recovery. Select and periodically review retention against
  the product's recovery-point and recovery-time objectives.
- For an additional logical backup of application tables, link the Supabase
  CLI to the intended project and use
  `supabase db dump --linked --schema public --file <protected-backup-file>`.
  Keep dumps encrypted, access-limited,
  off the application host, and out of source control and chat logs. Treat
  Auth-managed identities and any Storage buckets separately according to
  Supabase's backup/restore documentation; a public-schema dump is not a
  complete project backup.
- Perform scheduled restore rehearsals into a separate non-production project.
  Verify schema/migration history, representative user-owned rows, and RLS
  behavior before accepting the recovery. Never restore over production or
  delete user data without explicit approval and a verified recovery point.
- For incidents, stop further writes if necessary, preserve logs without
  credentials/tokens, restore to an isolated project first, compare with the
  latest migration state, then follow the approved production recovery
  procedure. Rotate any potentially exposed credentials and review Auth and
  database audit events.

The browser can be built and unit-tested without project credentials, but live
authentication, persistence, and two-user isolation require a configured
Supabase project or local Supabase stack.
