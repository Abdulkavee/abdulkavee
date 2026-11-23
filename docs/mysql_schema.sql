-- ============================================================================
-- LedgerIQ: Automated Expense Tracker with OCR & Predictive Analytics
-- MySQL 8.0 Relational Database Schema (12 Normalized Tables)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS expense_tracker_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE expense_tracker_db;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  monthly_income_target DECIMAL(12, 2) NOT NULL DEFAULT 30000.00,
  monthly_budget_limit DECIMAL(12, 2) NOT NULL DEFAULT 20000.00,
  is_demo_account BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Categories
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(80) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_category_user_name_type (user_id, name, type)
) ENGINE=InnoDB;

-- 3. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  merchant_name VARCHAR(160) NOT NULL,
  receipt_date DATE NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12, 2) NOT NULL,
  payment_info VARCHAR(60) NOT NULL DEFAULT 'UPI',
  ocr_engine VARCHAR(60) NOT NULL DEFAULT 'EasyOCR',
  ocr_confidence DECIMAL(5, 3) NOT NULL DEFAULT 0.000,
  raw_text TEXT,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_receipts_user_date (user_id, receipt_date)
) ENGINE=InnoDB;

-- 4. Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  category_name VARCHAR(80) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description VARCHAR(255) NOT NULL,
  merchant VARCHAR(160) NOT NULL DEFAULT '',
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  transaction_date DATE NOT NULL,
  receipt_id BIGINT UNSIGNED NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  predicted_category VARCHAR(80) NULL,
  prediction_confidence DECIMAL(5, 3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_tx_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL,
  INDEX idx_tx_user_date (user_id, transaction_date),
  INDEX idx_tx_user_category (user_id, category_name)
) ENGINE=InnoDB;

-- 5. ReceiptItems
CREATE TABLE IF NOT EXISTS receipt_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receipt_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  quantity DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(12, 2) NOT NULL,
  CONSTRAINT fk_receipt_items_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  INDEX idx_receipt_items_receipt (receipt_id)
) ENGINE=InnoDB;

-- 6. Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  month_key CHAR(7) NOT NULL,
  amount_limit DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_budget_user_cat_month (user_id, category_name, month_key),
  INDEX idx_budgets_user_month (user_id, month_key)
) ENGINE=InnoDB;

-- 7. ForecastHistory
CREATE TABLE IF NOT EXISTS forecast_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  model_name VARCHAR(120) NOT NULL,
  next_7_days_total DECIMAL(12, 2) NOT NULL,
  next_30_days_total DECIMAL(12, 2) NOT NULL,
  predicted_eom_total DECIMAL(12, 2) NOT NULL,
  mae DECIMAL(10, 2) NOT NULL,
  rmse DECIMAL(10, 2) NOT NULL,
  test_days INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_forecast_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_forecast_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- 8. SavingsGoals
CREATE TABLE IF NOT EXISTS savings_goals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(140) NOT NULL,
  target_amount DECIMAL(12, 2) NOT NULL,
  current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  target_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_goals_user (user_id)
) ENGINE=InnoDB;

-- 9. RecurringExpenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  frequency ENUM('monthly', 'weekly', 'quarterly', 'yearly') NOT NULL DEFAULT 'monthly',
  next_expected_date DATE NOT NULL,
  payment_method VARCHAR(60) NOT NULL DEFAULT 'UPI',
  is_auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recurring_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_recurring_user_next (user_id, next_expected_date)
) ENGINE=InnoDB;

-- 10. ChatHistory
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'gemini',
  retrieved_summary JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- 11. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('budget_warning', 'budget_exceeded', 'anomaly', 'forecast', 'info') NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB;

-- 12. ModelPredictionHistory
CREATE TABLE IF NOT EXISTS model_prediction_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  input_text VARCHAR(255) NOT NULL,
  predicted_category VARCHAR(80) NOT NULL,
  corrected_category VARCHAR(80) NOT NULL,
  confidence DECIMAL(5, 3) NOT NULL DEFAULT 0.000,
  was_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pred_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pred_user (user_id)
) ENGINE=InnoDB;
