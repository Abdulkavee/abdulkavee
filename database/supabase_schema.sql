-- ============================================================================
-- LedgerIQ: Supabase PostgreSQL Schema with Row Level Security (RLS)
-- Run this script once in your Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- Trigger helper to automatically keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. User Profiles (linked to Supabase Auth auth.users OR server-synced ledger accounts)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL DEFAULT 'LedgerIQ User',
  email VARCHAR(190) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  monthly_income_target NUMERIC(12, 2) NOT NULL DEFAULT 30000.00,
  monthly_budget_limit NUMERIC(12, 2) NOT NULL DEFAULT 20000.00,
  session_status VARCHAR(20) NOT NULL DEFAULT 'signed_out',
  last_login_at TIMESTAMPTZ NULL,
  last_logout_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe migrations if profiles table already existed from an earlier setup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_status VARCHAR(20) NOT NULL DEFAULT 'signed_out';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ NULL;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1b. Authentication Activity Logs (records every Sign Up, Sign In / Login, and Sign Out / Logout)
CREATE TABLE IF NOT EXISTS public.auth_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(190) NOT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('signup', 'login', 'logout', 'password_reset')),
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'supabase_email',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_activity_user_time
  ON public.auth_activity_logs (user_id, created_at DESC);

-- Automatically create a profile row AND record a 'signup' activity row when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name VARCHAR(120);
  v_income NUMERIC(12, 2);
  v_budget NUMERIC(12, 2);
BEGIN
  v_full_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
  v_income := COALESCE(NULLIF(NEW.raw_user_meta_data->>'monthly_income_target', '')::NUMERIC, 30000.00);
  v_budget := COALESCE(NULLIF(NEW.raw_user_meta_data->>'monthly_budget_limit', '')::NUMERIC, 20000.00);

  INSERT INTO public.profiles (id, full_name, email, monthly_income_target, monthly_budget_limit, session_status)
  VALUES (NEW.id, v_full_name, NEW.email, v_income, v_budget, 'signed_up')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.auth_activity_logs (user_id, email, full_name, event_type, auth_provider)
  VALUES (NEW.id, NEW.email, v_full_name, 'signup', 'supabase_email');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 2. Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  name VARCHAR(80) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('income', 'expense')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_global
  ON public.categories (name, type)
  WHERE user_id IS NULL AND external_owner_email IS NULL;

-- 3. Receipts
CREATE TABLE IF NOT EXISTS public.receipts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  external_id VARCHAR(120) NULL,
  file_name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  merchant_name VARCHAR(160) NOT NULL,
  receipt_date DATE NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL,
  payment_info VARCHAR(60) NOT NULL DEFAULT 'UPI',
  ocr_engine VARCHAR(60) NOT NULL DEFAULT 'Tesseract.js',
  ocr_confidence NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
  raw_text TEXT,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_owner_email, external_id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_date
  ON public.receipts (user_id, receipt_date DESC);

-- 4. Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  external_id VARCHAR(120) NULL,
  category_name VARCHAR(80) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description VARCHAR(255) NOT NULL,
  merchant VARCHAR(160) NOT NULL DEFAULT '',
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  transaction_date DATE NOT NULL,
  receipt_id BIGINT NULL REFERENCES public.receipts(id) ON DELETE SET NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  predicted_category VARCHAR(80) NULL,
  prediction_confidence NUMERIC(5, 3) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_owner_email, external_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_owner_date
  ON public.transactions (external_owner_email, transaction_date DESC);

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Receipt Items
CREATE TABLE IF NOT EXISTS public.receipt_items (
  id BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  item_name VARCHAR(180) NOT NULL,
  quantity NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt
  ON public.receipt_items (receipt_id);

-- 6. Budgets
CREATE TABLE IF NOT EXISTS public.budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  category_name VARCHAR(80) NOT NULL,
  month_key CHAR(7) NOT NULL,
  amount_limit NUMERIC(12, 2) NOT NULL CHECK (amount_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_owner_email, category_name, month_key)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month
  ON public.budgets (user_id, month_key);

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON public.budgets;
CREATE TRIGGER trg_budgets_updated_at
BEFORE UPDATE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Recurring Expenses
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  external_id VARCHAR(120) NULL,
  title VARCHAR(160) NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  frequency VARCHAR(16) NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'weekly', 'quarterly', 'yearly')),
  next_expected_date DATE NOT NULL,
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  is_auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_owner_email, external_id)
);

-- 8. Savings Goals
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  external_id VARCHAR(120) NULL,
  title VARCHAR(140) NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (current_amount >= 0),
  target_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_owner_email, external_id)
);

-- 9. Forecast History
CREATE TABLE IF NOT EXISTS public.forecast_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  model_name VARCHAR(120) NOT NULL,
  next_7_days_total NUMERIC(12, 2) NOT NULL,
  next_30_days_total NUMERIC(12, 2) NOT NULL,
  predicted_eom_total NUMERIC(12, 2) NOT NULL,
  mae NUMERIC(10, 2) NOT NULL,
  rmse NUMERIC(10, 2) NOT NULL,
  test_days INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Chat History
CREATE TABLE IF NOT EXISTS public.chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'gemini',
  retrieved_summary JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  type VARCHAR(24) NOT NULL
    CHECK (type IN ('budget_warning', 'budget_exceeded', 'anomaly', 'forecast', 'info')),
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Model Prediction History
CREATE TABLE IF NOT EXISTS public.model_prediction_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_owner_email VARCHAR(190) NULL,
  input_text VARCHAR(255) NOT NULL,
  predicted_category VARCHAR(80) NOT NULL,
  corrected_category VARCHAR(80) NOT NULL,
  confidence NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
  was_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strictly isolates every user's financial data when using the publishable key.
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_prediction_history ENABLE ROW LEVEL SECURITY;

-- Profiles: users can view, insert, and update only their own profile
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auth Activity Logs: users can only read and append their own signup/login/logout events
DROP POLICY IF EXISTS "Users read own auth activity" ON public.auth_activity_logs;
CREATE POLICY "Users read own auth activity" ON public.auth_activity_logs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own auth activity" ON public.auth_activity_logs;
CREATE POLICY "Users insert own auth activity" ON public.auth_activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Categories: users can read default global categories or their own custom categories
DROP POLICY IF EXISTS "Read default or own categories" ON public.categories;
CREATE POLICY "Read default or own categories" ON public.categories
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
DROP POLICY IF EXISTS "Manage own categories" ON public.categories;
CREATE POLICY "Manage own categories" ON public.categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transactions
DROP POLICY IF EXISTS "Manage own transactions" ON public.transactions;
CREATE POLICY "Manage own transactions" ON public.transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Receipts & Receipt Items
DROP POLICY IF EXISTS "Manage own receipts" ON public.receipts;
CREATE POLICY "Manage own receipts" ON public.receipts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Manage own receipt items" ON public.receipt_items;
CREATE POLICY "Manage own receipt items" ON public.receipt_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = receipt_items.receipt_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = receipt_items.receipt_id AND r.user_id = auth.uid()
    )
  );

-- Budgets
DROP POLICY IF EXISTS "Manage own budgets" ON public.budgets;
CREATE POLICY "Manage own budgets" ON public.budgets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recurring Expenses
DROP POLICY IF EXISTS "Manage own recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Manage own recurring expenses" ON public.recurring_expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Savings Goals
DROP POLICY IF EXISTS "Manage own savings goals" ON public.savings_goals;
CREATE POLICY "Manage own savings goals" ON public.savings_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Forecast History
DROP POLICY IF EXISTS "Manage own forecast history" ON public.forecast_history;
CREATE POLICY "Manage own forecast history" ON public.forecast_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat History
DROP POLICY IF EXISTS "Manage own chat history" ON public.chat_history;
CREATE POLICY "Manage own chat history" ON public.chat_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notifications
DROP POLICY IF EXISTS "Manage own notifications" ON public.notifications;
CREATE POLICY "Manage own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Model Prediction History
DROP POLICY IF EXISTS "Manage own model prediction history" ON public.model_prediction_history;
CREATE POLICY "Manage own model prediction history" ON public.model_prediction_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed default global categories (idempotent)
INSERT INTO public.categories (user_id, external_owner_email, name, type, is_default, color) VALUES
  (NULL, NULL, 'Food', 'expense', TRUE, '#2563EB'),
  (NULL, NULL, 'Rent', 'expense', TRUE, '#1E293B'),
  (NULL, NULL, 'Transport', 'expense', TRUE, '#0284C7'),
  (NULL, NULL, 'Shopping', 'expense', TRUE, '#059669'),
  (NULL, NULL, 'Bills', 'expense', TRUE, '#D97706'),
  (NULL, NULL, 'Entertainment', 'expense', TRUE, '#7C3AED'),
  (NULL, NULL, 'Education', 'expense', TRUE, '#4F46E5'),
  (NULL, NULL, 'Healthcare', 'expense', TRUE, '#DC2626'),
  (NULL, NULL, 'Travel', 'expense', TRUE, '#0D9488'),
  (NULL, NULL, 'Other', 'expense', TRUE, '#64748B'),
  (NULL, NULL, 'Salary', 'income', TRUE, '#059669'),
  (NULL, NULL, 'Allowance', 'income', TRUE, '#2563EB'),
  (NULL, NULL, 'Freelance', 'income', TRUE, '#7C3AED'),
  (NULL, NULL, 'Scholarship', 'income', TRUE, '#0284C7')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLE PRIVILEGES (RLS above still strictly enforces auth.uid() = user_id)
-- Required so sb_publishable_ / authenticated JWT requests can query tables.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
