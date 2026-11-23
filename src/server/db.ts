import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
  : path.join(DATA_DIR, 'expense_tracker.db');

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#2563EB',
  Transport: '#0284C7',
  Shopping: '#0F766E',
  Rent: '#1E293B',
  Bills: '#D97706',
  Education: '#4F46E5',
  Healthcare: '#DC2626',
  Entertainment: '#7C3AED',
  Travel: '#059669',
  Other: '#64748B',
  Salary: '#059669',
  Freelance: '#0D9488',
  Scholarship: '#2563EB',
  'Other Income': '#475569',
};

export const DEFAULT_CATEGORIES: Array<{ name: string; type: 'expense' | 'income'; color: string }> = [
  { name: 'Food', type: 'expense', color: '#2563EB' },
  { name: 'Transport', type: 'expense', color: '#0284C7' },
  { name: 'Shopping', type: 'expense', color: '#0F766E' },
  { name: 'Rent', type: 'expense', color: '#1E293B' },
  { name: 'Bills', type: 'expense', color: '#D97706' },
  { name: 'Education', type: 'expense', color: '#4F46E5' },
  { name: 'Healthcare', type: 'expense', color: '#DC2626' },
  { name: 'Entertainment', type: 'expense', color: '#7C3AED' },
  { name: 'Travel', type: 'expense', color: '#059669' },
  { name: 'Other', type: 'expense', color: '#64748B' },
  { name: 'Salary', type: 'income', color: '#059669' },
  { name: 'Freelance', type: 'income', color: '#0D9488' },
  { name: 'Scholarship', type: 'income', color: '#2563EB' },
  { name: 'Other Income', type: 'income', color: '#475569' },
];

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  initializeSchema(db);
  dbInstance = db;
  seedDemoUserIfMissing(db);
  return db;
}

function initializeSchema(db: DatabaseSync): void {
  // 12 Relational Tables matching the MySQL architectural specification (see docs/mysql_schema.sql)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      monthly_income_target REAL NOT NULL DEFAULT 32000,
      monthly_budget_limit REAL NOT NULL DEFAULT 22000,
      is_demo_account INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      is_default INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#64748B',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name, type)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      merchant_name TEXT NOT NULL,
      receipt_date TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_info TEXT NOT NULL DEFAULT 'UPI',
      ocr_engine TEXT NOT NULL DEFAULT 'Tesseract.js',
      ocr_confidence REAL NOT NULL DEFAULT 0,
      raw_text TEXT NOT NULL DEFAULT '',
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      category_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT NOT NULL,
      merchant TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'UPI',
      transaction_date TEXT NOT NULL,
      receipt_id INTEGER,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      predicted_category TEXT,
      prediction_confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL,
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount_limit REAL NOT NULL CHECK(amount_limit > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, category_name, month_key)
    );

    CREATE TABLE IF NOT EXISTS forecast_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      model_name TEXT NOT NULL,
      next_7_days_total REAL NOT NULL,
      next_30_days_total REAL NOT NULL,
      predicted_eom_total REAL NOT NULL,
      mae REAL NOT NULL,
      rmse REAL NOT NULL,
      test_days INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL CHECK(target_amount > 0),
      current_amount REAL NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
      target_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category_name TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'weekly', 'quarterly', 'yearly')),
      next_expected_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'UPI',
      is_auto_detected INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'gemini',
      retrieved_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('budget_warning', 'budget_exceeded', 'anomaly', 'forecast', 'info')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS model_prediction_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      input_text TEXT NOT NULL,
      predicted_category TEXT NOT NULL,
      corrected_category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      was_corrected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL CHECK(event_type IN ('signup', 'login', 'logout', 'password_reset')),
      auth_provider TEXT NOT NULL DEFAULT 'local',
      supabase_synced INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_name);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month_key);
    CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id, receipt_date);
    CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_auth_activity_user ON auth_activity_logs(user_id, created_at);
  `);
}

export function ensureDefaultCategoriesForUser(db: DatabaseSync, userId: number): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO categories (user_id, name, type, is_default, color)
     VALUES (?, ?, ?, 1, ?)`
  );
  for (const cat of DEFAULT_CATEGORIES) {
    stmt.run(userId, cat.name, cat.type, cat.color);
  }
}

export const DEMO_EMAIL = 'aarav.sharma@demo.fin';
export const DEMO_PASSWORD = 'Demo@2026';

export function seedDemoUserIfMissing(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL) as
    | { id: number }
    | undefined;
  if (existing) return;

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const res = db
    .prepare(
      `INSERT INTO users (full_name, email, password_hash, currency, monthly_income_target, monthly_budget_limit, is_demo_account)
       VALUES (?, ?, ?, 'INR', 36000, 22000, 1)`
    )
    .run('Aarav Sharma', DEMO_EMAIL, passwordHash);

  const userId = Number(res.lastInsertRowid);
  populateDemoDataForUser(db, userId);
}

export function populateDemoDataForUser(db: DatabaseSync, userId: number): void {
  // Wipe existing user data safely before re-seeding
  db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM receipts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM savings_goals WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM recurring_expenses WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM model_prediction_history WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM forecast_history WHERE user_id = ?').run(userId);

  ensureDefaultCategoriesForUser(db, userId);

  const catRows = db
    .prepare('SELECT id, name, type FROM categories WHERE user_id = ?')
    .all(userId) as Array<{ id: number; name: string; type: string }>;
  const catIdMap = new Map<string, number>();
  for (const c of catRows) {
    catIdMap.set(`${c.type}:${c.name}`, c.id);
  }

  const insertTx = db.prepare(
    `INSERT INTO transactions
      (user_id, category_id, category_name, type, amount, description, merchant, payment_method, transaction_date, receipt_id, is_recurring, predicted_category, prediction_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Use today's current month (Nov 2026 in environment, or dynamic today)
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const currentMonthKey = todayIso.slice(0, 7);

  // Helper to get YYYY-MM-DD N days before today
  const daysAgo = (n: number): string => {
    const dt = new Date(now.getTime() - n * 86400000);
    return dt.toISOString().slice(0, 10);
  };

  // Helper for fixed day-of-month offset (monthsBack: 0 = current, 1 = prev, 2 = two months ago)
  const monthDay = (monthsBack: number, day: number): string => {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, Math.min(day, 28)));
    if (dt.getTime() > now.getTime()) {
      return todayIso;
    }
    return dt.toISOString().slice(0, 10);
  };

  // 1. Monthly Income records (3 months: Stipend/Salary + Freelance)
  for (const mBack of [2, 1, 0]) {
    insertTx.run(
      userId,
      catIdMap.get('income:Salary') ?? null,
      'Salary',
      'income',
      28000,
      'Monthly Internship Stipend & Allowance',
      'TechNova Labs',
      'Net Banking',
      monthDay(mBack, 1),
      null,
      1,
      null,
      null
    );
    insertTx.run(
      userId,
      catIdMap.get('income:Freelance') ?? null,
      'Freelance',
      'income',
      mBack === 0 ? 8500 : mBack === 1 ? 6500 : 5000,
      'Python & Web Freelance Project Milestone',
      'Upwork Client',
      'Net Banking',
      monthDay(mBack, 12),
      null,
      0,
      null,
      null
    );
  }

  // 2. Recurring Monthly Fixed Bills across 3 months (for Recurring Detection + Budget Realism)
  const recurringSeed = [
    { title: 'House Rent', merchant: 'GreenView PG & Flats', cat: 'Rent', amt: 7500, day: 2, pm: 'Net Banking' },
    { title: 'Airtel Fiber Broadband', merchant: 'Airtel Fiber', cat: 'Bills', amt: 999, day: 5, pm: 'UPI' },
    { title: 'BESCOM Electricity Bill', merchant: 'BESCOM Electricity', cat: 'Bills', amt: 1180, day: 8, pm: 'UPI' },
    { title: 'Spotify & Cloud Storage', merchant: 'Spotify Premium', cat: 'Entertainment', amt: 249, day: 10, pm: 'Debit Card' },
  ];

  for (const mBack of [2, 1, 0]) {
    for (const r of recurringSeed) {
      const amt = r.cat === 'Bills' && r.title.includes('Electricity') ? r.amt + (mBack === 0 ? 110 : mBack === 1 ? -40 : 0) : r.amt;
      insertTx.run(
        userId,
        catIdMap.get(`expense:${r.cat}`) ?? null,
        r.cat,
        'expense',
        amt,
        r.title,
        r.merchant,
        r.pm,
        monthDay(mBack, r.day),
        null,
        1,
        r.cat,
        0.92
      );
    }
  }

  // 3. Deterministic 85-day realistic daily spending records (Food, Transport, Shopping, Education, Healthcare, Entertainment, Travel)
  const dailyTemplates: Array<{
    merchant: string;
    desc: string;
    cat: string;
    baseAmt: number;
    pm: string;
  }> = [
    { merchant: 'Swiggy', desc: 'Swiggy Masala Dosa & Biryani Order', cat: 'Food', baseAmt: 260, pm: 'UPI' },
    { merchant: 'Zomato', desc: 'Zomato Veg Thali Dinner', cat: 'Food', baseAmt: 230, pm: 'UPI' },
    { merchant: 'Campus Canteen', desc: 'College Canteen Lunch & Tea', cat: 'Food', baseAmt: 115, pm: 'UPI' },
    { merchant: 'Uber Auto', desc: 'Uber Auto Commute to Campus', cat: 'Transport', baseAmt: 145, pm: 'UPI' },
    { merchant: 'Namma Metro', desc: 'Metro Smart Card Top-up', cat: 'Transport', baseAmt: 200, pm: 'UPI' },
    { merchant: 'Indian Oil', desc: 'Two-Wheeler Petrol Refill', cat: 'Transport', baseAmt: 350, pm: 'Debit Card' },
    { merchant: 'Amazon India', desc: 'Amazon USB-C Hub & Cables', cat: 'Shopping', baseAmt: 680, pm: 'Credit Card' },
    { merchant: 'DMart Supermarket', desc: 'DMart Monthly Groceries & Essentials', cat: 'Shopping', baseAmt: 540, pm: 'UPI' },
    { merchant: 'Starbucks Cafe', desc: 'Coffee & Sandwich Study Session', cat: 'Food', baseAmt: 340, pm: 'Debit Card' },
    { merchant: 'Campus Stationery', desc: 'Notebooks, Lab Manual & Printouts', cat: 'Education', baseAmt: 290, pm: 'Cash' },
    { merchant: 'BookMyShow', desc: 'Weekend Movie Ticket & Snacks', cat: 'Entertainment', baseAmt: 420, pm: 'UPI' },
    { merchant: 'Apollo Pharmacy', desc: 'Vitamins & Cold Relief Tablets', cat: 'Healthcare', baseAmt: 310, pm: 'UPI' },
    { merchant: 'Myntra', desc: 'Casual Cotton T-Shirt & Socks', cat: 'Shopping', baseAmt: 890, pm: 'Credit Card' },
    { merchant: 'Udemy', desc: 'Scikit-Learn & Time-Series Course', cat: 'Education', baseAmt: 549, pm: 'Debit Card' },
    { merchant: 'IRCTC Rail', desc: 'Weekend Train Ticket Home', cat: 'Travel', baseAmt: 640, pm: 'UPI' },
  ];

  // Deterministic pseudo-random generator for clean, repeatable demo dataset
  let seed = 20261120;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let d = 84; d >= 0; d--) {
    const dateStr = daysAgo(d);
    const dt = new Date(dateStr + 'T00:00:00Z');
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    // Slight realistic uptick in current month Food & Shopping so MoM insights & budget alerts activate genuinely
    const isCurrentMonth = dateStr.startsWith(currentMonthKey);

    // 1 to 2 daily transactions most days
    const txCount = isWeekend ? 2 : nextRand() > 0.25 ? 1 : 0;
    for (let k = 0; k < txCount; k++) {
      let pickIdx = Math.floor(nextRand() * dailyTemplates.length);
      // Higher weight for Food & Transport
      if (k === 0 && nextRand() < 0.55) {
        pickIdx = Math.floor(nextRand() * 6);
      }
      const tpl = dailyTemplates[pickIdx];
      const variance = 0.8 + nextRand() * 0.45;
      const monthBoost = isCurrentMonth && (tpl.cat === 'Food' || tpl.cat === 'Shopping') ? 1.22 : 1.0;
      const amount = Math.round((tpl.baseAmt * variance * monthBoost) / 5) * 5;

      insertTx.run(
        userId,
        catIdMap.get(`expense:${tpl.cat}`) ?? null,
        tpl.cat,
        'expense',
        amount,
        tpl.desc,
        tpl.merchant,
        tpl.pm,
        dateStr,
        null,
        0,
        tpl.cat,
        Number((0.78 + nextRand() * 0.16).toFixed(2))
      );
    }
  }

  // 4. Two deliberate realistic unusual spending spikes (so Anomaly Detection demonstrates genuine statistical flagging!)
  insertTx.run(
    userId,
    catIdMap.get('expense:Shopping') ?? null,
    'Shopping',
    'expense',
    6450,
    'Croma Mechanical Keyboard & Noise-Cancelling Headphones',
    'Croma Electronics',
    'Credit Card',
    daysAgo(6),
    null,
    0,
    'Shopping',
    0.89
  );
  insertTx.run(
    userId,
    catIdMap.get('expense:Food') ?? null,
    'Food',
    'expense',
    2850,
    'Team Project Celebration Group Dinner Bill',
    'Barbeque Nation',
    'Credit Card',
    daysAgo(3),
    null,
    0,
    'Food',
    0.87
  );

  // 5. Two saved OCR Receipts + ReceiptItems (including the exact ABC Supermarket brief example!)
  const r1 = db
    .prepare(
      `INSERT INTO receipts (user_id, file_name, image_url, merchant_name, receipt_date, subtotal, tax_amount, total_amount, payment_info, ocr_engine, ocr_confidence, raw_text, verified)
       VALUES (?, 'abc_supermarket_demo.png', '', 'ABC Supermarket', ?, 220, 0, 220, 'UPI', 'Tesseract.js', 0.94, ?, 1)`
    )
    .run(
      userId,
      todayIso,
      `ABC Supermarket\nDate: 20 November 2026\nMilk: ₹60\nBread: ₹40\nRice: ₹120\nTotal: ₹220\nPaid via UPI`
    );
  const r1Id = Number(r1.lastInsertRowid);
  const insertItem = db.prepare(
    'INSERT INTO receipt_items (receipt_id, item_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)'
  );
  insertItem.run(r1Id, 'Milk', 1, 60, 60);
  insertItem.run(r1Id, 'Bread', 1, 40, 40);
  insertItem.run(r1Id, 'Rice', 1, 120, 120);

  insertTx.run(
    userId,
    catIdMap.get('expense:Shopping') ?? null,
    'Shopping',
    'expense',
    220,
    'ABC Supermarket Receipt (Milk, Bread, Rice)',
    'ABC Supermarket',
    'UPI',
    todayIso,
    r1Id,
    0,
    'Shopping',
    0.91
  );

  // 6. Monthly Overall Budget + Category Budgets for current month
  const insertBudget = db.prepare(
    'INSERT INTO budgets (user_id, category_name, month_key, amount_limit) VALUES (?, ?, ?, ?)'
  );
  insertBudget.run(userId, 'OVERALL', currentMonthKey, 22000);
  insertBudget.run(userId, 'Food', currentMonthKey, 4500);
  insertBudget.run(userId, 'Shopping', currentMonthKey, 5000);
  insertBudget.run(userId, 'Transport', currentMonthKey, 2500);
  insertBudget.run(userId, 'Bills', currentMonthKey, 2800);
  insertBudget.run(userId, 'Entertainment', currentMonthKey, 1500);
  insertBudget.run(userId, 'Education', currentMonthKey, 2000);

  // 7. Tracked Recurring Expenses
  const insertRec = db.prepare(
    `INSERT INTO recurring_expenses (user_id, title, category_name, amount, frequency, next_expected_date, payment_method, is_auto_detected, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const nextMonthIso = (day: number) => {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day));
    return dt.toISOString().slice(0, 10);
  };
  insertRec.run(userId, 'House Rent', 'Rent', 7500, 'monthly', nextMonthIso(2), 'Net Banking', 0, 'GreenView PG & Flats monthly rent');
  insertRec.run(userId, 'Airtel Fiber Broadband', 'Bills', 999, 'monthly', nextMonthIso(5), 'UPI', 1, '100 Mbps student home plan');
  insertRec.run(userId, 'BESCOM Electricity Bill', 'Bills', 1220, 'monthly', nextMonthIso(8), 'UPI', 0, 'Estimated monthly electricity utility');
  insertRec.run(userId, 'Spotify & Cloud Storage', 'Entertainment', 249, 'monthly', nextMonthIso(10), 'Debit Card', 1, 'Student music & Google One bundle');

  // 8. Savings Goals
  const insertGoal = db.prepare(
    'INSERT INTO savings_goals (user_id, title, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?, ?)'
  );
  insertGoal.run(userId, 'Emergency Cash Buffer', 50000, 31500, '2027-03-31');
  insertGoal.run(userId, 'ML Workstation / Laptop Upgrade', 65000, 24000, '2027-07-15');
  insertGoal.run(userId, 'Summer Internship Relocation Fund', 25000, 14500, '2027-05-01');

  // 9. Notifications
  const insertNotif = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, 0)'
  );
  insertNotif.run(
    userId,
    'budget_exceeded',
    'Shopping Budget Alert',
    'Your Shopping spend this month has crossed your ₹5,000 category budget limit.',
  );
  insertNotif.run(
    userId,
    'anomaly',
    'Unusual Spending Activity Flagged',
    'Two transactions (Croma Electronics ₹6,450 and Barbeque Nation ₹2,850) are significantly higher than your typical category median.',
  );

  // 10. Seed ModelPredictionHistory feedback rows
  const insertPred = db.prepare(
    'INSERT INTO model_prediction_history (user_id, input_text, predicted_category, corrected_category, confidence, was_corrected) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertPred.run(userId, 'Swiggy Masala Dosa & Biryani', 'Food', 'Food', 0.91, 0);
  insertPred.run(userId, 'Uber Auto Commute', 'Transport', 'Transport', 0.89, 0);
  insertPred.run(userId, 'Campus Xerox Project Binding', 'Other', 'Education', 0.48, 1);
}
