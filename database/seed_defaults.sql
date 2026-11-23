-- ============================================================================
-- LedgerIQ: Default Categories & Sample Seed Data (Standard SQL)
-- Compatible with PostgreSQL, MySQL 8.0, and SQLite 3
-- ============================================================================

INSERT INTO categories (user_id, name, type, is_default, color) VALUES
  (NULL, 'Food', 'expense', TRUE, '#2563EB'),
  (NULL, 'Rent', 'expense', TRUE, '#1E293B'),
  (NULL, 'Transport', 'expense', TRUE, '#0284C7'),
  (NULL, 'Shopping', 'expense', TRUE, '#059669'),
  (NULL, 'Bills', 'expense', TRUE, '#D97706'),
  (NULL, 'Entertainment', 'expense', TRUE, '#7C3AED'),
  (NULL, 'Education', 'expense', TRUE, '#4F46E5'),
  (NULL, 'Healthcare', 'expense', TRUE, '#DC2626'),
  (NULL, 'Travel', 'expense', TRUE, '#0D9488'),
  (NULL, 'Other', 'expense', TRUE, '#64748B'),
  (NULL, 'Salary', 'income', TRUE, '#059669'),
  (NULL, 'Allowance', 'income', TRUE, '#2563EB'),
  (NULL, 'Freelance', 'income', TRUE, '#7C3AED'),
  (NULL, 'Scholarship', 'income', TRUE, '#0284C7');
