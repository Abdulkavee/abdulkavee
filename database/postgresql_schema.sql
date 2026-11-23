-- ============================================================================
-- LedgerIQ: Automated Expense Tracker with OCR & Predictive Analytics
-- PostgreSQL 15+ Relational Database Schema (12 Normalized Tables)
-- Compatible with Local PostgreSQL, pgAdmin, Supabase, Neon, Railway & Render
-- ============================================================================

-- Trigger helper to automatically keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  monthly_income_target NUMERIC(12, 2) NOT NULL DEFAULT 30000.00,
  monthly_budget_limit NUMERIC(12, 2) NOT NULL DEFAULT 20000.00,
  is_demo_account BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Categories
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('income', 'expense')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_category_user_name_type UNIQUE (user_id, name, type)
);

-- 3. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  merchant_name VARCHAR(160) NOT NULL,
  receipt_date DATE NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL,
  payment_info VARCHAR(60) NOT NULL DEFAULT 'UPI',
  ocr_engine VARCHAR(60) NOT NULL DEFAULT 'Tesseract',
  ocr_confidence NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
  raw_text TEXT,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_date
  ON receipts (user_id, receipt_date DESC);

-- 4. Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(80) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description VARCHAR(255) NOT NULL,
  merchant VARCHAR(160) NOT NULL DEFAULT '',
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  transaction_date DATE NOT NULL,
  receipt_id BIGINT NULL REFERENCES receipts(id) ON DELETE SET NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  predicted_category VARCHAR(80) NULL,
  prediction_confidence NUMERIC(5, 3) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date
  ON transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_category
  ON transactions (user_id, category_name);

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. ReceiptItems
CREATE TABLE IF NOT EXISTS receipt_items (
  id BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  item_name VARCHAR(180) NOT NULL,
  quantity NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt
  ON receipt_items (receipt_id);

-- 6. Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_name VARCHAR(80) NOT NULL,
  month_key CHAR(7) NOT NULL,
  amount_limit NUMERIC(12, 2) NOT NULL CHECK (amount_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_budget_user_cat_month UNIQUE (user_id, category_name, month_key)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month
  ON budgets (user_id, month_key);

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON budgets;
CREATE TRIGGER trg_budgets_updated_at
BEFORE UPDATE ON budgets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. ForecastHistory
CREATE TABLE IF NOT EXISTS forecast_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_name VARCHAR(120) NOT NULL,
  next_7_days_total NUMERIC(12, 2) NOT NULL,
  next_30_days_total NUMERIC(12, 2) NOT NULL,
  predicted_eom_total NUMERIC(12, 2) NOT NULL,
  mae NUMERIC(10, 2) NOT NULL,
  rmse NUMERIC(10, 2) NOT NULL,
  test_days INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_user_created
  ON forecast_history (user_id, created_at DESC);

-- 8. SavingsGoals
CREATE TABLE IF NOT EXISTS savings_goals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(140) NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (current_amount >= 0),
  target_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user
  ON savings_goals (user_id);

-- 9. RecurringExpenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  frequency VARCHAR(16) NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'weekly', 'quarterly', 'yearly')),
  next_expected_date DATE NOT NULL,
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  is_auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user_next
  ON recurring_expenses (user_id, next_expected_date);

-- 10. ChatHistory
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'gemini',
  retrieved_summary JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_user_created
  ON chat_history (user_id, created_at DESC);

-- 11. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(24) NOT NULL
    CHECK (type IN ('budget_warning', 'budget_exceeded', 'anomaly', 'forecast', 'info')),
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_read
  ON notifications (user_id, is_read);

-- 12. ModelPredictionHistory
CREATE TABLE IF NOT EXISTS model_prediction_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_text VARCHAR(255) NOT NULL,
  predicted_category VARCHAR(80) NOT NULL,
  corrected_category VARCHAR(80) NOT NULL,
  confidence NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
  was_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pred_user
  ON model_prediction_history (user_id);
