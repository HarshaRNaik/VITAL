# VITAL Fitness

VITAL Fitness is a React/Vite app. Supabase Auth handles sign-in, and the
browser uses the Supabase publishable/anon key with PostgreSQL Row Level
Security (RLS) for user-owned data. The workout library remains available
without signing in; private history and changes require an account.

## Local setup

1. Create a Supabase project and apply all timestamped migrations in order from
   [`supabase/migrations`](./supabase/migrations).
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from the project's API settings.
3. Add `http://localhost:5173` to the Supabase Auth site URL and redirect URL
   allowlist. Email confirmation can remain enabled; users must confirm their
   address before they can sign in.
4. Install dependencies and start the frontend:

   ```powershell
   npm ci
   npm run dev
   ```

See [`supabase/README.md`](./supabase/README.md) for migration, local testing,
security, production deployment, and backup/recovery details.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the Vercel frontend and Render
Gemini Coach deployment setup. The browser uses Supabase for authentication and
user data; the Render Coach API is separate from the retained legacy Prisma API.

`VITE_` variables are public and are included in the browser bundle. Use only
the Supabase publishable/anon key there. Never put a service-role key in a
`VITE_` variable or frontend file, and do not commit `.env`.

## Data and compatibility

Profiles, settings, Home Workout records, Gym Partner sessions and templates,
workout plans, nutrition, fitness metrics/goals, game progress, and coach
conversations are stored in Supabase. Active Gym Partner sessions can be
resumed, and gym completion rewards are granted transactionally. Supabase Auth
creates a profile and initial game state through the database trigger. RLS
policies scope private rows to `auth.uid()`.

The previous Express/Prisma authentication and activity endpoints remain
separate and are not used by the browser app. A standalone Express Coach API
uses Supabase access tokens and RLS-scoped reads to call Gemini; it does not
use the legacy Prisma database. Existing records in the previous PostgreSQL
database are not deleted or automatically assigned to Supabase accounts.
Review and explicitly migrate legacy data only after matching account
identities; do not infer ownership from email alone. Prisma client generation
does not require `DATABASE_URL`; legacy database migration and seed commands
do, and should only be run with the intended PostgreSQL connection string
configured.

## Validation

```powershell
npm test
npx vite build
```

When the Supabase CLI and a local Supabase stack are available, run the RLS
integration tests with `supabase test db`.
