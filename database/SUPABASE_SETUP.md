# Connecting LedgerIQ to Supabase

LedgerIQ integrates with Supabase through `@supabase/supabase-js` on both the frontend (`src/services/supabaseClient.ts`) and Express backend (`src/server/supabaseService.ts`), as well as the Python Flask backend (`backend/run.py`).

## Step 1: Create the 12 Tables & Row Level Security in Supabase
1. Open your **Supabase Dashboard** → **SQL Editor** → **New Query**.
2. Paste the entire contents of `database/supabase_schema.sql` and click **Run**.
3. This creates all 12 normalized tables, enables Row Level Security (`RLS`) on every table, sets per-user `auth.uid()` isolation policies, and seeds the 14 default categories.

## Step 2: Add Environment Secrets (Never Commit Keys to Code)
In AI Studio (**Settings → Secrets**) or your local `.env` file, add:

```env
# Base project URL (do NOT include /rest/v1/ at the end)
SUPABASE_URL="https://<your-project-id>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<your-sb_publishable_key>"

# Optional frontend client env vars (public browser key only)
VITE_SUPABASE_URL="https://<your-project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-sb_publishable_key>"

# Server-only secret key from Supabase Dashboard -> Project Settings -> API Keys
# Required for server-side Express background sync & full ledger export to Supabase
SUPABASE_SERVICE_ROLE_KEY="<your-sb_secret_or_service_role_key>"
```

> **Important:** Use the base project URL (`https://<project-id>.supabase.co`), not the `/rest/v1/` subpath. The Supabase SDK appends `/rest/v1/` automatically.

## Step 3: Verify & Sync
1. Restart the server so the new environment variables load.
2. Sign in to LedgerIQ and go to **Profile & Settings** → **Supabase Cloud Backend**.
3. Click **Sync Ledger to Supabase** to push your transactions, budgets, recurring bills, and savings goals into your Supabase Postgres tables. All new transactions created afterwards also mirror automatically when `SUPABASE_SERVICE_ROLE_KEY` is configured on the server.
