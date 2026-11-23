import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import {
  CATEGORY_COLORS,
  DEMO_EMAIL,
  ensureDefaultCategoriesForUser,
  getDb,
  populateDemoDataForUser,
} from './src/server/db.ts';
import { requireAuth, signAuthToken, type AuthedRequest } from './src/server/auth.ts';
import { extractReceiptFromImageBuffer } from './src/server/ocrService.ts';
import { generateRagFinancialReply } from './src/server/ragAssistant.ts';
import {
  checkSupabaseConnection,
  deleteMirroredTransactionInSupabase,
  fetchSupabaseAuthActivity,
  isSupabaseAuthEnabled,
  isSupabaseInvalidApiKeyError,
  mirrorTransactionToSupabase,
  recordSupabaseAuthEvent,
  supabaseEmailSignIn,
  supabaseEmailSignUp,
  supabaseResendConfirmation,
  supabaseSendPasswordReset,
  supabaseSignOutSession,
  supabaseVerifyAccessToken,
  syncUserLedgerToSupabase,
  type AuthActivityEntry,
  type AuthActivityEventType,
  type SupabaseUserSession,
} from './src/server/supabaseService.ts';
import { createCategorizer } from './src/ml/categorizer.ts';
import { generateExpenseForecast } from './src/ml/forecaster.ts';
import { detectSpendingAnomalies } from './src/ml/anomalyDetector.ts';
import {
  detectRecurringPatterns,
  generateSavingsRecommendations,
} from './src/ml/recommendations.ts';

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'receipts');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB strict limit
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPG, JPEG, and PNG receipt images are supported.'));
      return;
    }
    cb(null, true);
  },
});

function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function getPrevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

function getUserCategorizer(userId: number) {
  const db = getDb();
  const feedbackRows = db
    .prepare(
      `SELECT input_text, corrected_category FROM model_prediction_history
       WHERE user_id = ? ORDER BY id DESC LIMIT 200`
    )
    .all(userId) as Array<{ input_text: string; corrected_category: string }>;
  return createCategorizer(
    feedbackRows.map((r) => ({ text: r.input_text, category: r.corrected_category }))
  );
}

function mapTransactionRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    categoryId: row.category_id ? Number(row.category_id) : null,
    categoryName: String(row.category_name),
    type: String(row.type) as 'income' | 'expense',
    amount: Number(row.amount),
    description: String(row.description),
    merchant: String(row.merchant ?? ''),
    paymentMethod: String(row.payment_method ?? 'UPI'),
    transactionDate: String(row.transaction_date),
    receiptId: row.receipt_id ? Number(row.receipt_id) : null,
    isRecurring: Boolean(row.is_recurring),
    predictedCategory: row.predicted_category ? String(row.predicted_category) : null,
    predictionConfidence:
      row.prediction_confidence !== null && row.prediction_confidence !== undefined
        ? Number(row.prediction_confidence)
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function evaluateAndNotifyBudgets(userId: number, monthKey: string) {
  const db = getDb();
  const budgets = db
    .prepare('SELECT id, category_name, amount_limit FROM budgets WHERE user_id = ? AND month_key = ?')
    .all(userId, monthKey) as Array<{ id: number; category_name: string; amount_limit: number }>;

  const txRows = db
    .prepare(
      `SELECT category_name, SUM(amount) as total FROM transactions
       WHERE user_id = ? AND type = 'expense' AND transaction_date LIKE ?
       GROUP BY category_name`
    )
    .all(userId, `${monthKey}%`) as Array<{ category_name: string; total: number }>;

  const spentByCat = new Map<string, number>();
  let totalSpent = 0;
  for (const r of txRows) {
    spentByCat.set(r.category_name, Number(r.total));
    totalSpent += Number(r.total);
  }

  return budgets.map((b) => {
    const spent = b.category_name === 'OVERALL' ? totalSpent : (spentByCat.get(b.category_name) ?? 0);
    const percentUsed = b.amount_limit > 0 ? Number(((spent / b.amount_limit) * 100).toFixed(1)) : 0;
    const status: 'nominal' | 'warning' | 'exceeded' =
      percentUsed >= 100 ? 'exceeded' : percentUsed >= 80 ? 'warning' : 'nominal';
    return {
      id: b.id,
      userId,
      categoryName: b.category_name,
      monthKey,
      amountLimit: Number(b.amount_limit),
      spent: Number(spent.toFixed(2)),
      remaining: Number(Math.max(0, b.amount_limit - spent).toFixed(2)),
      percentUsed,
      status,
    };
  });
}

async function startServer() {
  // Initialize SQLite database & demo account on startup
  getDb();

  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads/receipts', express.static(UPLOAD_DIR));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Server-side in-memory map of verified active Supabase sessions (cleared on logout, never persisted to disk)
  const supabaseSessionStore = new Map<number, SupabaseUserSession>();

  async function recordAuthActivity(params: {
    userId: number;
    email: string;
    fullName: string;
    eventType: AuthActivityEventType;
    authProvider: string;
    userAgent?: string;
    monthlyIncomeTarget?: number;
    monthlyBudgetLimit?: number;
    supabaseSession?: SupabaseUserSession | null;
  }): Promise<{ supabaseSynced: boolean }> {
    let supabaseSynced = false;
    if (params.supabaseSession?.supabaseUserId) {
      const sbRes = await recordSupabaseAuthEvent({
        supabaseUserId: params.supabaseSession.supabaseUserId,
        email: params.email,
        fullName: params.fullName,
        eventType: params.eventType,
        accessToken: params.supabaseSession.accessToken,
        authProvider: params.authProvider,
        userAgent: params.userAgent,
        monthlyIncomeTarget: params.monthlyIncomeTarget,
        monthlyBudgetLimit: params.monthlyBudgetLimit,
      });
      supabaseSynced = sbRes.synced;
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO auth_activity_logs (user_id, email, full_name, event_type, auth_provider, supabase_synced, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId,
      params.email,
      params.fullName,
      params.eventType,
      params.authProvider,
      supabaseSynced ? 1 : 0,
      (params.userAgent || '').slice(0, 240)
    );

    return { supabaseSynced };
  }

  function ensureLocalLedgerUserForSupabase(params: {
    email: string;
    fullName: string;
    monthlyIncomeTarget: number;
    monthlyBudgetLimit: number;
  }) {
    const db = getDb();
    const existing = db
      .prepare(
        `SELECT id, full_name, email, currency, monthly_income_target, monthly_budget_limit, is_demo_account, created_at
         FROM users WHERE email = ?`
      )
      .get(params.email) as
      | {
          id: number;
          full_name: string;
          email: string;
          currency: string;
          monthly_income_target: number;
          monthly_budget_limit: number;
          is_demo_account: number;
          created_at: string;
        }
      | undefined;

    if (existing) {
      ensureDefaultCategoriesForUser(db, existing.id);
      return {
        id: existing.id,
        fullName: existing.full_name,
        email: existing.email,
        currency: existing.currency,
        monthlyIncomeTarget: Number(existing.monthly_income_target),
        monthlyBudgetLimit: Number(existing.monthly_budget_limit),
        isDemoAccount: Boolean(existing.is_demo_account),
        createdAt: existing.created_at,
      };
    }

    // Store a non-reusable cryptographically random bcrypt hash because authentication is verified by Supabase Auth
    const placeholderHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, currency, monthly_income_target, monthly_budget_limit, is_demo_account)
         VALUES (?, ?, ?, 'INR', ?, ?, 0)`
      )
      .run(
        params.fullName,
        params.email,
        placeholderHash,
        params.monthlyIncomeTarget,
        params.monthlyBudgetLimit
      );

    const userId = Number(result.lastInsertRowid);
    ensureDefaultCategoriesForUser(db, userId);
    db.prepare(
      'INSERT OR IGNORE INTO budgets (user_id, category_name, month_key, amount_limit) VALUES (?, ?, ?, ?)'
    ).run(userId, 'OVERALL', getCurrentMonthKey(), params.monthlyBudgetLimit);

    return {
      id: userId,
      fullName: params.fullName,
      email: params.email,
      currency: 'INR',
      monthlyIncomeTarget: params.monthlyIncomeTarget,
      monthlyBudgetLimit: params.monthlyBudgetLimit,
      isDemoAccount: false,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 1. AUTHENTICATION & PROFILE ROUTES (Supabase Email Auth + Local Fallback)
  // =========================================================================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { fullName, email, password, monthlyIncomeTarget, monthlyBudgetLimit } = req.body ?? {};
      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({ error: 'Please provide your full name (at least 2 characters).' });
        return;
      }
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const incomeTarget = Number(monthlyIncomeTarget) > 0 ? Number(monthlyIncomeTarget) : 25000;
      const budgetLimit = Number(monthlyBudgetLimit) > 0 ? Number(monthlyBudgetLimit) : 15000;

      // Primary path: Supabase Email Authentication when configured in server secrets
      if (isSupabaseAuthEnabled() && normalizedEmail !== DEMO_EMAIL) {
        try {
          const sbResult = await supabaseEmailSignUp({
            email: normalizedEmail,
            password,
            fullName: fullName.trim(),
            monthlyIncomeTarget: incomeTarget,
            monthlyBudgetLimit: budgetLimit,
            emailRedirectTo: process.env.APP_URL || undefined,
          });

          if (sbResult.requiresEmailConfirmation) {
            res.status(202).json({
              requiresEmailConfirmation: true,
              email: sbResult.email,
              authProvider: 'supabase',
              message:
                'Verification email sent! Please check your inbox and click the confirmation link before signing in.',
            });
            return;
          }

          const linkedUser = ensureLocalLedgerUserForSupabase({
            email: sbResult.email,
            fullName: sbResult.fullName,
            monthlyIncomeTarget: incomeTarget,
            monthlyBudgetLimit: budgetLimit,
          });
          const sbSession: SupabaseUserSession | null =
            sbResult.accessToken && sbResult.supabaseUserId
              ? {
                  accessToken: sbResult.accessToken,
                  supabaseUserId: sbResult.supabaseUserId,
                  email: sbResult.email,
                }
              : null;
          if (sbSession) {
            supabaseSessionStore.set(linkedUser.id, sbSession);
          }
          await recordAuthActivity({
            userId: linkedUser.id,
            email: linkedUser.email,
            fullName: linkedUser.fullName,
            eventType: 'signup',
            authProvider: 'supabase_email',
            userAgent: String(req.headers['user-agent'] || ''),
            monthlyIncomeTarget: incomeTarget,
            monthlyBudgetLimit: budgetLimit,
            supabaseSession: sbSession,
          });
          const token = signAuthToken({ sub: linkedUser.id, email: linkedUser.email });
          res.status(201).json({ token, user: linkedUser, authProvider: 'supabase' });
          return;
        } catch (sbErr) {
          if (isSupabaseInvalidApiKeyError(sbErr)) {
            console.warn(
              '[Supabase] API key was rejected during signup ("Invalid API key"). Falling back to local SQLite auth. Update SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY in .env.'
            );
          } else {
            res.status(400).json({
              error: sbErr instanceof Error ? sbErr.message : 'Supabase registration failed.',
            });
            return;
          }
        }
      }

      // Local SQLite + bcrypt path when Supabase secrets are not yet configured
      const db = getDb();
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (exists) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const hash = bcrypt.hashSync(password, 10);
      const result = db
        .prepare(
          `INSERT INTO users (full_name, email, password_hash, currency, monthly_income_target, monthly_budget_limit, is_demo_account)
           VALUES (?, ?, ?, 'INR', ?, ?, 0)`
        )
        .run(fullName.trim(), normalizedEmail, hash, incomeTarget, budgetLimit);

      const userId = Number(result.lastInsertRowid);
      ensureDefaultCategoriesForUser(db, userId);

      // Initialize overall monthly budget for new user
      db.prepare(
        'INSERT OR IGNORE INTO budgets (user_id, category_name, month_key, amount_limit) VALUES (?, ?, ?, ?)'
      ).run(userId, 'OVERALL', getCurrentMonthKey(), budgetLimit);

      await recordAuthActivity({
        userId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        eventType: 'signup',
        authProvider: 'local',
        userAgent: String(req.headers['user-agent'] || ''),
      });

      const token = signAuthToken({ sub: userId, email: normalizedEmail });
      res.status(201).json({
        token,
        authProvider: 'local',
        user: {
          id: userId,
          fullName: fullName.trim(),
          email: normalizedEmail,
          currency: 'INR',
          monthlyIncomeTarget: incomeTarget,
          monthlyBudgetLimit: budgetLimit,
          isDemoAccount: false,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      // Primary path: Supabase Email Authentication for all non-demo accounts when configured
      if (isSupabaseAuthEnabled() && normalizedEmail !== DEMO_EMAIL) {
        try {
          const sbUser = await supabaseEmailSignIn(normalizedEmail, String(password));
          const linkedUser = ensureLocalLedgerUserForSupabase({
            email: sbUser.email,
            fullName: sbUser.fullName,
            monthlyIncomeTarget: sbUser.monthlyIncomeTarget,
            monthlyBudgetLimit: sbUser.monthlyBudgetLimit,
          });
          const sbSession: SupabaseUserSession | null = sbUser.accessToken
            ? {
                accessToken: sbUser.accessToken,
                supabaseUserId: sbUser.supabaseUserId,
                email: sbUser.email,
              }
            : null;
          if (sbSession) {
            supabaseSessionStore.set(linkedUser.id, sbSession);
          }
          await recordAuthActivity({
            userId: linkedUser.id,
            email: linkedUser.email,
            fullName: linkedUser.fullName,
            eventType: 'login',
            authProvider: 'supabase_email',
            userAgent: String(req.headers['user-agent'] || ''),
            monthlyIncomeTarget: linkedUser.monthlyIncomeTarget,
            monthlyBudgetLimit: linkedUser.monthlyBudgetLimit,
            supabaseSession: sbSession,
          });
          const token = signAuthToken({ sub: linkedUser.id, email: linkedUser.email });
          res.json({ token, user: linkedUser, authProvider: 'supabase' });
          return;
        } catch (sbErr) {
          if (isSupabaseInvalidApiKeyError(sbErr)) {
            console.warn(
              '[Supabase] API key was rejected during login ("Invalid API key"). Falling back to local SQLite auth. Update SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY in .env.'
            );
          } else {
            const errObj = sbErr as Error & { needsEmailVerification?: boolean };
            if (errObj.needsEmailVerification) {
              res.status(403).json({
                error: 'Please confirm your email address using the link Supabase sent before signing in.',
                needsEmailVerification: true,
              });
              return;
            }
            res.status(401).json({
              error: errObj.message || 'Invalid email or password.',
            });
            return;
          }
        }
      }

      const db = getDb();
      const user = db
        .prepare(
          `SELECT id, full_name, email, password_hash, currency, monthly_income_target, monthly_budget_limit, is_demo_account, created_at
           FROM users WHERE email = ?`
        )
        .get(normalizedEmail) as
        | {
            id: number;
            full_name: string;
            email: string;
            password_hash: string;
            currency: string;
            monthly_income_target: number;
            monthly_budget_limit: number;
            is_demo_account: number;
            created_at: string;
          }
        | undefined;

      if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      await recordAuthActivity({
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        eventType: 'login',
        authProvider: user.is_demo_account ? 'demo' : 'local',
        userAgent: String(req.headers['user-agent'] || ''),
      });

      const token = signAuthToken({ sub: user.id, email: user.email });
      res.json({
        token,
        authProvider: 'local',
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          currency: user.currency,
          monthlyIncomeTarget: Number(user.monthly_income_target),
          monthlyBudgetLimit: Number(user.monthly_budget_limit),
          isDemoAccount: Boolean(user.is_demo_account),
          createdAt: user.created_at,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // Exchange a verified browser Supabase access_token for a LedgerIQ session token
  app.post('/api/auth/supabase/exchange', async (req, res) => {
    try {
      const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
      const rawEvent = req.body?.eventType;
      const eventType: AuthActivityEventType | null =
        rawEvent === 'signup' || rawEvent === 'login' ? rawEvent : null;
      if (!accessToken) {
        res.status(400).json({ error: 'Supabase access token is required.' });
        return;
      }
      const sbUser = await supabaseVerifyAccessToken(accessToken);
      const linkedUser = ensureLocalLedgerUserForSupabase({
        email: sbUser.email,
        fullName: sbUser.fullName,
        monthlyIncomeTarget: sbUser.monthlyIncomeTarget,
        monthlyBudgetLimit: sbUser.monthlyBudgetLimit,
      });
      const sbSession: SupabaseUserSession = {
        accessToken,
        supabaseUserId: sbUser.supabaseUserId,
        email: sbUser.email,
      };
      supabaseSessionStore.set(linkedUser.id, sbSession);

      if (eventType) {
        await recordAuthActivity({
          userId: linkedUser.id,
          email: linkedUser.email,
          fullName: linkedUser.fullName,
          eventType,
          authProvider: 'supabase_email',
          userAgent: String(req.headers['user-agent'] || ''),
          monthlyIncomeTarget: linkedUser.monthlyIncomeTarget,
          monthlyBudgetLimit: linkedUser.monthlyBudgetLimit,
          supabaseSession: sbSession,
        });
      }

      const token = signAuthToken({ sub: linkedUser.id, email: linkedUser.email });
      res.json({ token, user: linkedUser, authProvider: 'supabase' });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Could not verify Supabase session.',
      });
    }
  });

  // Record Logout in Supabase PostgreSQL (auth_activity_logs + profiles) and local DB before signing out
  app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const user = req.authUser!;
      let sbSession = supabaseSessionStore.get(user.id) ?? null;

      // If browser sent an active Supabase access token, verify it belongs to this authenticated user
      const bodyToken =
        typeof req.body?.supabaseAccessToken === 'string'
          ? req.body.supabaseAccessToken.trim()
          : '';
      if (!sbSession && bodyToken) {
        try {
          const verified = await supabaseVerifyAccessToken(bodyToken);
          if (verified.email === user.email.toLowerCase()) {
            sbSession = {
              accessToken: bodyToken,
              supabaseUserId: verified.supabaseUserId,
              email: verified.email,
            };
          }
        } catch {
          // Ignore invalid/expired external token
        }
      }

      const { supabaseSynced } = await recordAuthActivity({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        eventType: 'logout',
        authProvider: sbSession ? 'supabase_email' : 'local',
        userAgent: String(req.headers['user-agent'] || ''),
        supabaseSession: sbSession,
      });

      if (sbSession?.accessToken) {
        await supabaseSignOutSession(sbSession.accessToken);
      }
      supabaseSessionStore.delete(user.id);

      res.json({ ok: true, supabaseSynced });
    } catch (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Could not complete sign out cleanly.' });
    }
  });

  // Return authenticated user's Sign Up / Sign In / Sign Out history (from Supabase DB when active, plus local fallback)
  app.get('/api/auth/activity', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.authUser!.id;
      const sbSession = supabaseSessionStore.get(userId) ?? null;
      const supabaseStatus = await checkSupabaseConnection();

      let activities: AuthActivityEntry[] = [];
      if (sbSession?.accessToken) {
        const remote = await fetchSupabaseAuthActivity(sbSession.accessToken, 30);
        if (remote && remote.length > 0) {
          activities = remote;
        }
      }

      if (activities.length === 0) {
        const db = getDb();
        const rows = db
          .prepare(
            `SELECT id, email, full_name, event_type, auth_provider, supabase_synced, created_at
             FROM auth_activity_logs
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 30`
          )
          .all(userId) as Array<Record<string, unknown>>;

        activities = rows.map((r) => ({
          id: `local_${r.id}`,
          email: String(r.email),
          fullName: String(r.full_name || ''),
          eventType: String(r.event_type) as AuthActivityEventType,
          authProvider: String(r.auth_provider || 'local'),
          source: Boolean(r.supabase_synced) ? 'supabase' : 'local',
          supabaseSynced: Boolean(r.supabase_synced),
          createdAt: String(r.created_at),
        }));
      }

      res.json({
        activities,
        activeSupabaseSession: Boolean(sbSession),
        supabaseStatus,
      });
    } catch (err) {
      console.error('Auth activity fetch error:', err);
      res.status(500).json({ error: 'Could not load authentication activity log.' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (!isSupabaseAuthEnabled()) {
        res.status(400).json({
          error: 'Password reset emails require SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Settings -> Secrets.',
        });
        return;
      }
      await supabaseSendPasswordReset(email, process.env.APP_URL || undefined);
      res.json({
        ok: true,
        message: 'If an account exists for this email, a password reset link has been sent.',
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not send password reset email.',
      });
    }
  });

  app.post('/api/auth/resend-confirmation', async (req, res) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (!isSupabaseAuthEnabled()) {
        res.status(400).json({
          error: 'Confirmation emails require SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Settings -> Secrets.',
        });
        return;
      }
      await supabaseResendConfirmation(email, process.env.APP_URL || undefined);
      res.json({
        ok: true,
        message: 'Verification email resent. Please check your inbox and spam folder.',
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not resend verification email.',
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, full_name, email, currency, monthly_income_target, monthly_budget_limit, is_demo_account, created_at
         FROM users WHERE id = ?`
      )
      .get(req.authUser!.id) as Record<string, unknown>;
    res.json({
      user: {
        id: Number(user.id),
        fullName: String(user.full_name),
        email: String(user.email),
        currency: String(user.currency),
        monthlyIncomeTarget: Number(user.monthly_income_target),
        monthlyBudgetLimit: Number(user.monthly_budget_limit),
        isDemoAccount: Boolean(user.is_demo_account),
        createdAt: String(user.created_at),
      },
    });
  });

  app.put('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const { fullName, monthlyIncomeTarget, monthlyBudgetLimit } = req.body ?? {};
    const db = getDb();
    const userId = req.authUser!.id;
    const cleanName = typeof fullName === 'string' && fullName.trim().length >= 2 ? fullName.trim() : req.authUser!.fullName;
    const inc = Number(monthlyIncomeTarget) > 0 ? Number(monthlyIncomeTarget) : 25000;
    const bud = Number(monthlyBudgetLimit) > 0 ? Number(monthlyBudgetLimit) : 15000;

    db.prepare(
      `UPDATE users SET full_name = ?, monthly_income_target = ?, monthly_budget_limit = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(cleanName, inc, bud, userId);

    db.prepare(
      `INSERT INTO budgets (user_id, category_name, month_key, amount_limit)
       VALUES (?, 'OVERALL', ?, ?)
       ON CONFLICT(user_id, category_name, month_key)
       DO UPDATE SET amount_limit = excluded.amount_limit, updated_at = datetime('now')`
    ).run(userId, getCurrentMonthKey(), bud);

    res.json({
      ok: true,
      user: {
        id: userId,
        fullName: cleanName,
        email: req.authUser!.email,
        currency: 'INR',
        monthlyIncomeTarget: inc,
        monthlyBudgetLimit: bud,
        isDemoAccount: req.authUser!.isDemoAccount,
      },
    });
  });

  app.post('/api/auth/reset-demo', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    populateDemoDataForUser(db, req.authUser!.id);
    res.json({ ok: true, message: 'Demo dataset has been restored.' });
  });

  // =========================================================================
  // 2. DASHBOARD OVERVIEW
  // =========================================================================
  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const monthKey = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : getCurrentMonthKey();
    const todayIso = new Date().toISOString().slice(0, 10);

    const allTxs = db
      .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC')
      .all(userId)
      .map((r) => mapTransactionRow(r as Record<string, unknown>));

    const monthTxs = allTxs.filter((t) => t.transactionDate.startsWith(monthKey));
    const monthlyIncome = monthTxs
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const monthlyExpenses = monthTxs
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const totalIncomeAll = allTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenseAll = allTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const currentBalance = totalIncomeAll - totalExpenseAll;

    const todaySpending = allTxs
      .filter((t) => t.type === 'expense' && t.transactionDate === todayIso)
      .reduce((s, t) => s + t.amount, 0);

    const evaluatedBudgets = evaluateAndNotifyBudgets(userId, monthKey);
    const overallBudgetObj = evaluatedBudgets.find((b) => b.categoryName === 'OVERALL');
    const userRow = db
      .prepare('SELECT monthly_budget_limit FROM users WHERE id = ?')
      .get(userId) as { monthly_budget_limit: number };
    const monthlyBudget = overallBudgetObj?.amountLimit ?? Number(userRow.monthly_budget_limit) ?? 20000;
    const remainingBudget = Math.max(0, monthlyBudget - monthlyExpenses);
    const savingsAmount = monthlyIncome - monthlyExpenses;
    const savingsPercentage =
      monthlyIncome > 0 ? Number(((savingsAmount / monthlyIncome) * 100).toFixed(1)) : 0;
    const budgetUsedPercent =
      monthlyBudget > 0 ? Number(((monthlyExpenses / monthlyBudget) * 100).toFixed(1)) : 0;

    // Daily spending for last 14 days
    const dailyMap = new Map<string, number>();
    for (const tx of allTxs) {
      if (tx.type === 'expense') {
        dailyMap.set(tx.transactionDate, (dailyMap.get(tx.transactionDate) ?? 0) + tx.amount);
      }
    }
    const dailySpending: Array<{ date: string; label: string; amount: number }> = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(now.getTime() - i * 86400000);
      const iso = dt.toISOString().slice(0, 10);
      const label = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      dailySpending.push({ date: iso, label, amount: Number((dailyMap.get(iso) ?? 0).toFixed(2)) });
    }

    // Category-wise spending (current month)
    const catTotals = new Map<string, number>();
    for (const tx of monthTxs) {
      if (tx.type === 'expense') {
        catTotals.set(tx.categoryName, (catTotals.get(tx.categoryName) ?? 0) + tx.amount);
      }
    }
    const categorySpending = Array.from(catTotals.entries())
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
        percentage: monthlyExpenses > 0 ? Number(((amount / monthlyExpenses) * 100).toFixed(1)) : 0,
        color: CATEGORY_COLORS[category] || '#3B82F6',
      }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly comparison (last 6 months)
    const monthlyComparison: Array<{
      month: string;
      label: string;
      income: number;
      expense: number;
      savings: number;
    }> = [];
    for (let m = 5; m >= 0; m--) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      const mk = dt.toISOString().slice(0, 7);
      const label = dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      const inc = allTxs
        .filter((t) => t.type === 'income' && t.transactionDate.startsWith(mk))
        .reduce((s, t) => s + t.amount, 0);
      const exp = allTxs
        .filter((t) => t.type === 'expense' && t.transactionDate.startsWith(mk))
        .reduce((s, t) => s + t.amount, 0);
      if (inc > 0 || exp > 0 || m <= 2) {
        monthlyComparison.push({
          month: mk,
          label,
          income: Number(inc.toFixed(2)),
          expense: Number(exp.toFixed(2)),
          savings: Number((inc - exp).toFixed(2)),
        });
      }
    }

    // Forecast summary
    const expenseRecords = allTxs
      .filter((t) => t.type === 'expense')
      .map((t) => ({ date: t.transactionDate, amount: t.amount, category: t.categoryName }));
    const forecast = generateExpenseForecast(expenseRecords, monthlyBudget, todayIso);
    const next7DaysSeries = forecast.series
      .filter((s) => s.kind === 'forecast')
      .slice(0, 7)
      .map((s) => ({ date: s.date, predicted: s.predicted ?? 0 }));

    // Budget warnings (>= 80%)
    const budgetWarnings = evaluatedBudgets
      .filter((b) => b.status === 'warning' || b.status === 'exceeded')
      .map((b) => ({
        categoryName: b.categoryName === 'OVERALL' ? 'Monthly Total Budget' : b.categoryName,
        percentUsed: b.percentUsed,
        spent: b.spent,
        limit: b.amountLimit,
        status: b.status as 'warning' | 'exceeded',
        message:
          b.status === 'exceeded'
            ? `${b.categoryName === 'OVERALL' ? 'Overall monthly budget' : b.categoryName} exceeded (${b.percentUsed}% used — ₹${Math.round(b.spent).toLocaleString('en-IN')} / ₹${Math.round(b.amountLimit).toLocaleString('en-IN')}).`
            : `${b.categoryName === 'OVERALL' ? 'Overall monthly budget' : b.categoryName} reached ${b.percentUsed}% of limit (₹${Math.round(b.remaining).toLocaleString('en-IN')} remaining).`,
      }));

    // Anomalies count
    const anomalies = detectSpendingAnomalies(
      allTxs.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        merchant: t.merchant,
        description: t.description,
        category: t.categoryName,
        amount: t.amount,
        type: t.type,
      }))
    );

    res.json({
      monthKey,
      kpis: {
        monthlyIncome: Number(monthlyIncome.toFixed(2)),
        monthlyExpenses: Number(monthlyExpenses.toFixed(2)),
        currentBalance: Number(currentBalance.toFixed(2)),
        monthlyBudget: Number(monthlyBudget.toFixed(2)),
        remainingBudget: Number(remainingBudget.toFixed(2)),
        savingsAmount: Number(savingsAmount.toFixed(2)),
        savingsPercentage,
        todaySpending: Number(todaySpending.toFixed(2)),
        budgetUsedPercent,
      },
      dailySpending,
      categorySpending,
      monthlyComparison,
      recentTransactions: allTxs.slice(0, 8),
      upcomingPredicted: {
        next7DaysTotal: forecast.next7DaysTotal,
        predictedEndOfMonth: forecast.predictedEndOfMonthTotal,
        overrunWarning: forecast.overrunWarning,
        next7DaysSeries,
      },
      budgetWarnings,
      anomalyCount: anomalies.length,
      isDemoAccount: req.authUser!.isDemoAccount,
    });
  });

  // =========================================================================
  // 3. TRANSACTIONS CRUD & SUMMARIES
  // =========================================================================
  app.get('/api/transactions', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const { search, category, type, paymentMethod, startDate, endDate } = req.query;

    const clauses = ['user_id = ?'];
    const params: Array<string | number> = [userId];

    if (typeof type === 'string' && (type === 'income' || type === 'expense')) {
      clauses.push('type = ?');
      params.push(type);
    }
    if (typeof category === 'string' && category && category !== 'ALL') {
      clauses.push('category_name = ?');
      params.push(category);
    }
    if (typeof paymentMethod === 'string' && paymentMethod && paymentMethod !== 'ALL') {
      clauses.push('payment_method = ?');
      params.push(paymentMethod);
    }
    if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      clauses.push('transaction_date >= ?');
      params.push(startDate);
    }
    if (typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      clauses.push('transaction_date <= ?');
      params.push(endDate);
    }
    if (typeof search === 'string' && search.trim()) {
      clauses.push('(LOWER(description) LIKE ? OR LOWER(merchant) LIKE ? OR LOWER(category_name) LIKE ?)');
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }

    const sql = `SELECT * FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY transaction_date DESC, id DESC`;
    const rows = db
      .prepare(sql)
      .all(...params)
      .map((r) => mapTransactionRow(r as Record<string, unknown>));

    const totalIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

    // Monthly & yearly summary aggregates for the user
    const monthlySummary = db
      .prepare(
        `SELECT substr(transaction_date, 1, 7) as period,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
         FROM transactions WHERE user_id = ?
         GROUP BY period ORDER BY period DESC LIMIT 12`
      )
      .all(userId);

    const yearlySummary = db
      .prepare(
        `SELECT substr(transaction_date, 1, 4) as period,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
         FROM transactions WHERE user_id = ?
         GROUP BY period ORDER BY period DESC`
      )
      .all(userId);

    res.json({
      transactions: rows,
      summary: {
        count: rows.length,
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpense: Number(totalExpense.toFixed(2)),
        net: Number((totalIncome - totalExpense).toFixed(2)),
      },
      monthlySummary,
      yearlySummary,
    });
  });

  app.post('/api/transactions', requireAuth, (req: AuthedRequest, res) => {
    try {
      const {
        type,
        amount,
        categoryName,
        description,
        merchant,
        paymentMethod,
        transactionDate,
        predictedCategory,
        predictionConfidence,
      } = req.body ?? {};

      if (type !== 'income' && type !== 'expense') {
        res.status(400).json({ error: 'Transaction type must be income or expense.' });
        return;
      }
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        res.status(400).json({ error: 'Amount must be a positive number.' });
        return;
      }
      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'Please provide a transaction description.' });
        return;
      }
      const dateStr =
        typeof transactionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
          ? transactionDate
          : new Date().toISOString().slice(0, 10);

      const db = getDb();
      const userId = req.authUser!.id;
      const cleanCategory =
        typeof categoryName === 'string' && categoryName.trim()
          ? categoryName.trim()
          : type === 'income'
            ? 'Salary'
            : 'Other';

      const catRow = db
        .prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?')
        .get(userId, cleanCategory, type) as { id: number } | undefined;

      const result = db
        .prepare(
          `INSERT INTO transactions
            (user_id, category_id, category_name, type, amount, description, merchant, payment_method, transaction_date, predicted_category, prediction_confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          catRow?.id ?? null,
          cleanCategory,
          type,
          Number(amt.toFixed(2)),
          description.trim(),
          typeof merchant === 'string' ? merchant.trim() : '',
          typeof paymentMethod === 'string' && paymentMethod.trim() ? paymentMethod.trim() : 'UPI',
          dateStr,
          typeof predictedCategory === 'string' ? predictedCategory : null,
          typeof predictionConfidence === 'number' ? predictionConfidence : null
        );

      // Record ML categorization feedback when an expense was predicted and saved
      if (type === 'expense' && typeof predictedCategory === 'string' && predictedCategory.trim()) {
        const wasCorrected = predictedCategory !== cleanCategory ? 1 : 0;
        db.prepare(
          `INSERT INTO model_prediction_history (user_id, input_text, predicted_category, corrected_category, confidence, was_corrected)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          `${merchant ?? ''} ${description}`.trim(),
          predictedCategory,
          cleanCategory,
          typeof predictionConfidence === 'number' ? predictionConfidence : 0.5,
          wasCorrected
        );
      }

      const created = db
        .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
        .get(Number(result.lastInsertRowid), userId) as Record<string, unknown>;

      const mapped = mapTransactionRow(created);
      void mirrorTransactionToSupabase(userId, mapped).catch(() => {});
      res.status(201).json({ transaction: mapped });
    } catch (err) {
      console.error('Create transaction error:', err);
      res.status(500).json({ error: 'Could not save transaction.' });
    }
  });

  app.put('/api/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    const { type, amount, categoryName, description, merchant, paymentMethod, transactionDate } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    const nextType = type === 'income' || type === 'expense' ? type : String(existing.type);
    const nextCat = typeof categoryName === 'string' && categoryName.trim() ? categoryName.trim() : String(existing.category_name);
    const nextDesc = typeof description === 'string' && description.trim() ? description.trim() : String(existing.description);
    const nextMerch = typeof merchant === 'string' ? merchant.trim() : String(existing.merchant ?? '');
    const nextPm = typeof paymentMethod === 'string' && paymentMethod.trim() ? paymentMethod.trim() : String(existing.payment_method);
    const nextDate =
      typeof transactionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
        ? transactionDate
        : String(existing.transaction_date);

    db.prepare(
      `UPDATE transactions
       SET type = ?, amount = ?, category_name = ?, description = ?, merchant = ?, payment_method = ?, transaction_date = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(nextType, Number(amt.toFixed(2)), nextCat, nextDesc, nextMerch, nextPm, nextDate, id, userId);

    const updated = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, unknown>;
    const mapped = mapTransactionRow(updated);
    void mirrorTransactionToSupabase(userId, mapped).catch(() => {});
    res.json({ transaction: mapped });
  });

  app.delete('/api/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const id = Number(req.params.id);
    const info = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }
    void deleteMirroredTransactionInSupabase(userId, id).catch(() => {});
    res.json({ ok: true });
  });

  // =========================================================================
  // 4. CATEGORIES (DEFAULT + CUSTOM)
  // =========================================================================
  app.get('/api/categories', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    ensureDefaultCategoriesForUser(db, userId);
    const rows = db
      .prepare('SELECT id, user_id, name, type, is_default, color FROM categories WHERE user_id = ? ORDER BY is_default DESC, name ASC')
      .all(userId) as Array<Record<string, unknown>>;

    res.json({
      categories: rows.map((r) => ({
        id: Number(r.id),
        userId: Number(r.user_id),
        name: String(r.name),
        type: String(r.type),
        isDefault: Boolean(r.is_default),
        color: String(r.color),
      })),
    });
  });

  app.post('/api/categories', requireAuth, (req: AuthedRequest, res) => {
    const { name, type, color } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Category name must be at least 2 characters.' });
      return;
    }
    const cleanType = type === 'income' ? 'income' : 'expense';
    const cleanColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563EB';
    const db = getDb();
    const userId = req.authUser!.id;

    try {
      const result = db
        .prepare('INSERT INTO categories (user_id, name, type, is_default, color) VALUES (?, ?, ?, 0, ?)')
        .run(userId, name.trim(), cleanType, cleanColor);
      res.status(201).json({
        category: {
          id: Number(result.lastInsertRowid),
          userId,
          name: name.trim(),
          type: cleanType,
          isDefault: false,
          color: cleanColor,
        },
      });
    } catch {
      res.status(409).json({ error: 'A category with that name already exists.' });
    }
  });

  app.delete('/api/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const id = Number(req.params.id);
    const info = db
      .prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_default = 0')
      .run(id, userId);
    if (info.changes === 0) {
      res.status(400).json({ error: 'Custom category not found or default category cannot be deleted.' });
      return;
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 5. BUDGET MANAGEMENT
  // =========================================================================
  app.get('/api/budgets', requireAuth, (req: AuthedRequest, res) => {
    const monthKey =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : getCurrentMonthKey();
    const budgets = evaluateAndNotifyBudgets(req.authUser!.id, monthKey);
    res.json({ monthKey, budgets });
  });

  app.post('/api/budgets', requireAuth, (req: AuthedRequest, res) => {
    const { categoryName, monthKey, amountLimit } = req.body ?? {};
    const limit = Number(amountLimit);
    if (!categoryName || typeof categoryName !== 'string') {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      res.status(400).json({ error: 'Budget limit must be greater than zero.' });
      return;
    }
    const mk =
      typeof monthKey === 'string' && /^\d{4}-\d{2}$/.test(monthKey)
        ? monthKey
        : getCurrentMonthKey();

    const db = getDb();
    const userId = req.authUser!.id;
    db.prepare(
      `INSERT INTO budgets (user_id, category_name, month_key, amount_limit)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category_name, month_key)
       DO UPDATE SET amount_limit = excluded.amount_limit, updated_at = datetime('now')`
    ).run(userId, categoryName.trim(), mk, Number(limit.toFixed(2)));

    if (categoryName.trim() === 'OVERALL') {
      db.prepare('UPDATE users SET monthly_budget_limit = ? WHERE id = ?').run(limit, userId);
    }

    const budgets = evaluateAndNotifyBudgets(userId, mk);
    res.json({ monthKey: mk, budgets });
  });

  app.delete('/api/budgets/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const info = db
      .prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.authUser!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Budget not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 6. INNOVATION 1: REAL TESSERACT OCR RECEIPT SCANNER
  // =========================================================================
  app.post('/api/receipts/scan', requireAuth, (req: AuthedRequest, res) => {
    upload.single('receipt')(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ error: uploadErr.message || 'Invalid file upload.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Please upload a receipt image (JPG, JPEG, or PNG).' });
        return;
      }

      try {
        const ext = req.file.mimetype === 'image/png' ? '.png' : '.jpg';
        const safeName = `receipt_${req.authUser!.id}_${Date.now()}${ext}`;
        const destPath = path.join(UPLOAD_DIR, safeName);
        fs.writeFileSync(destPath, req.file.buffer);
        const imageUrl = `/uploads/receipts/${safeName}`;

        const parsed = await extractReceiptFromImageBuffer(req.file.buffer, imageUrl);
        res.json({
          fileName: safeName,
          parsed,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Receipt OCR failed.';
        res.status(500).json({ error: msg });
      }
    });
  });

  app.post('/api/receipts/confirm', requireAuth, (req: AuthedRequest, res) => {
    try {
      const {
        fileName,
        imageUrl,
        merchant,
        receiptDate,
        items,
        subtotal,
        taxAmount,
        totalAmount,
        paymentMethod,
        categoryName,
        suggestedCategory,
        categoryConfidence,
        rawText,
        ocrConfidence,
        description,
      } = req.body ?? {};

      const total = Number(totalAmount);
      if (!merchant || typeof merchant !== 'string' || !merchant.trim()) {
        res.status(400).json({ error: 'Merchant name is required before saving.' });
        return;
      }
      if (!Number.isFinite(total) || total <= 0) {
        res.status(400).json({ error: 'Total amount must be greater than zero.' });
        return;
      }

      const db = getDb();
      const userId = req.authUser!.id;
      const dateStr =
        typeof receiptDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(receiptDate)
          ? receiptDate
          : new Date().toISOString().slice(0, 10);

      const cleanCat = typeof categoryName === 'string' && categoryName.trim() ? categoryName.trim() : 'Shopping';
      const itemList: Array<{ name: string; quantity: number; unitPrice: number; totalPrice: number }> =
        Array.isArray(items) ? items : [];

      const receiptRes = db
        .prepare(
          `INSERT INTO receipts (user_id, file_name, image_url, merchant_name, receipt_date, subtotal, tax_amount, total_amount, payment_info, ocr_engine, ocr_confidence, raw_text, verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Tesseract.js', ?, ?, 1)`
        )
        .run(
          userId,
          typeof fileName === 'string' && fileName ? fileName : 'uploaded_receipt.png',
          typeof imageUrl === 'string' ? imageUrl : '',
          merchant.trim(),
          dateStr,
          Number(subtotal) || total,
          Number(taxAmount) || 0,
          Number(total.toFixed(2)),
          typeof paymentMethod === 'string' && paymentMethod ? paymentMethod : 'UPI',
          Number(ocrConfidence) || 0.85,
          typeof rawText === 'string' ? rawText : ''
        );

      const receiptId = Number(receiptRes.lastInsertRowid);
      const itemStmt = db.prepare(
        'INSERT INTO receipt_items (receipt_id, item_name, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)'
      );
      for (const it of itemList) {
        if (it && typeof it.name === 'string' && it.name.trim() && Number(it.totalPrice) > 0) {
          const qty = Math.max(1, Number(it.quantity) || 1);
          const tp = Number(it.totalPrice);
          itemStmt.run(receiptId, it.name.trim(), qty, Number((tp / qty).toFixed(2)), Number(tp.toFixed(2)));
        }
      }

      const itemSummary =
        itemList.length > 0
          ? `${merchant.trim()} (${itemList.slice(0, 4).map((i) => i.name).join(', ')})`
          : `${merchant.trim()} Receipt`;

      const txDesc =
        typeof description === 'string' && description.trim() ? description.trim() : itemSummary;

      const catRow = db
        .prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?')
        .get(userId, cleanCat, 'expense') as { id: number } | undefined;

      const txRes = db
        .prepare(
          `INSERT INTO transactions
            (user_id, category_id, category_name, type, amount, description, merchant, payment_method, transaction_date, receipt_id, predicted_category, prediction_confidence)
           VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          catRow?.id ?? null,
          cleanCat,
          Number(total.toFixed(2)),
          txDesc,
          merchant.trim(),
          typeof paymentMethod === 'string' && paymentMethod ? paymentMethod : 'UPI',
          dateStr,
          receiptId,
          typeof suggestedCategory === 'string' ? suggestedCategory : cleanCat,
          Number(categoryConfidence) || 0.8
        );

      if (typeof suggestedCategory === 'string' && suggestedCategory) {
        db.prepare(
          `INSERT INTO model_prediction_history (user_id, input_text, predicted_category, corrected_category, confidence, was_corrected)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          `${merchant.trim()} ${itemList.map((i) => i.name).join(' ')}`,
          suggestedCategory,
          cleanCat,
          Number(categoryConfidence) || 0.8,
          suggestedCategory !== cleanCat ? 1 : 0
        );
      }

      res.status(201).json({
        receiptId,
        transactionId: Number(txRes.lastInsertRowid),
        message: 'Verified receipt and transaction saved to database.',
      });
    } catch (err) {
      console.error('Confirm receipt error:', err);
      res.status(500).json({ error: 'Failed to save verified receipt.' });
    }
  });

  app.get('/api/receipts', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM receipts WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    const itemStmt = db.prepare('SELECT id, item_name, quantity, unit_price, total_price FROM receipt_items WHERE receipt_id = ?');
    const receipts = rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      fileName: String(r.file_name),
      imageUrl: String(r.image_url ?? ''),
      merchantName: String(r.merchant_name),
      receiptDate: String(r.receipt_date),
      subtotal: Number(r.subtotal),
      taxAmount: Number(r.tax_amount),
      totalAmount: Number(r.total_amount),
      paymentInfo: String(r.payment_info),
      ocrEngine: String(r.ocr_engine),
      rawText: String(r.raw_text),
      verified: Boolean(r.verified),
      createdAt: String(r.created_at),
      items: (itemStmt.all(Number(r.id)) as Array<Record<string, unknown>>).map((it) => ({
        id: Number(it.id),
        name: String(it.item_name),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        totalPrice: Number(it.total_price),
      })),
    }));

    res.json({ receipts });
  });

  // =========================================================================
  // 7. INNOVATION 4: ML AUTOMATIC EXPENSE CATEGORIZATION
  // =========================================================================
  app.post('/api/ml/categorize', requireAuth, (req: AuthedRequest, res) => {
    const { description, merchant } = req.body ?? {};
    const categorizer = getUserCategorizer(req.authUser!.id);
    const prediction = categorizer.predict(String(description ?? ''), String(merchant ?? ''));
    res.json({ prediction });
  });

  // =========================================================================
  // 8. INNOVATION 2: 30-DAY PREDICTIVE EXPENSE ANALYTICS
  // =========================================================================
  app.get('/api/forecast', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const todayIso = new Date().toISOString().slice(0, 10);
    const monthKey = todayIso.slice(0, 7);

    const rows = db
      .prepare(
        `SELECT transaction_date as date, amount, category_name as category
         FROM transactions WHERE user_id = ? AND type = 'expense' ORDER BY transaction_date ASC`
      )
      .all(userId) as Array<{ date: string; amount: number; category: string }>;

    const budgetRow = db
      .prepare(
        `SELECT amount_limit FROM budgets WHERE user_id = ? AND category_name = 'OVERALL' AND month_key = ?`
      )
      .get(userId, monthKey) as { amount_limit: number } | undefined;
    const userRow = db
      .prepare('SELECT monthly_budget_limit FROM users WHERE id = ?')
      .get(userId) as { monthly_budget_limit: number };
    const monthlyBudget = budgetRow?.amount_limit ?? Number(userRow.monthly_budget_limit) ?? 20000;

    const forecast = generateExpenseForecast(rows, monthlyBudget, todayIso);

    // Persist latest forecast run in forecast_history if valid
    if (!forecast.insufficientData) {
      const lastSaved = db
        .prepare('SELECT created_at FROM forecast_history WHERE user_id = ? ORDER BY id DESC LIMIT 1')
        .get(userId) as { created_at: string } | undefined;
      const shouldInsert =
        !lastSaved || Date.now() - new Date(lastSaved.created_at + 'Z').getTime() > 1000 * 60 * 10;
      if (shouldInsert) {
        db.prepare(
          `INSERT INTO forecast_history (user_id, model_name, next_7_days_total, next_30_days_total, predicted_eom_total, mae, rmse, test_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          forecast.modelName,
          forecast.next7DaysTotal,
          forecast.next30DaysTotal,
          forecast.predictedEndOfMonthTotal,
          forecast.evaluation.mae,
          forecast.evaluation.rmse,
          forecast.evaluation.testDays
        );
      }
    }

    res.json({ forecast });
  });

  // =========================================================================
  // 9. ANALYTICS & INNOVATION 5: ANOMALY DETECTION
  // =========================================================================
  app.get('/api/analytics', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const allTxs = db
      .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC')
      .all(userId)
      .map((r) => mapTransactionRow(r as Record<string, unknown>));

    const anomalies = detectSpendingAnomalies(
      allTxs.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        merchant: t.merchant,
        description: t.description,
        category: t.categoryName,
        amount: t.amount,
        type: t.type,
      }))
    );

    // Day-of-week average spend
    const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowTotals = new Array<number>(7).fill(0);
    const dowCounts = new Array<number>(7).fill(0);
    const paymentBreakdown = new Map<string, number>();
    const categoryTotals = new Map<string, number>();

    for (const tx of allTxs) {
      if (tx.type !== 'expense') continue;
      const dow = new Date(tx.transactionDate + 'T00:00:00Z').getUTCDay();
      dowTotals[dow] += tx.amount;
      dowCounts[dow] += 1;
      paymentBreakdown.set(tx.paymentMethod, (paymentBreakdown.get(tx.paymentMethod) ?? 0) + tx.amount);
      categoryTotals.set(tx.categoryName, (categoryTotals.get(tx.categoryName) ?? 0) + tx.amount);
    }

    const dayOfWeekSpend = dowLabels.map((day, idx) => ({
      day,
      total: Number(dowTotals[idx].toFixed(2)),
      average: dowCounts[idx] > 0 ? Number((dowTotals[idx] / dowCounts[idx]).toFixed(2)) : 0,
    }));

    const paymentMethods = Array.from(paymentBreakdown.entries())
      .map(([method, amount]) => ({ method, amount: Number(amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount);

    const categoryAllTime = Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
        color: CATEGORY_COLORS[category] || '#3B82F6',
      }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly trend
    const monthlyMap = new Map<string, { income: number; expense: number }>();
    for (const tx of allTxs) {
      const mk = tx.transactionDate.slice(0, 7);
      const entry = monthlyMap.get(mk) ?? { income: 0, expense: 0 };
      if (tx.type === 'income') entry.income += tx.amount;
      else entry.expense += tx.amount;
      monthlyMap.set(mk, entry);
    }
    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, val]) => ({
        month,
        income: Number(val.income.toFixed(2)),
        expense: Number(val.expense.toFixed(2)),
        savings: Number((val.income - val.expense).toFixed(2)),
      }));

    res.json({
      anomalies,
      dayOfWeekSpend,
      paymentMethods,
      categoryAllTime,
      monthlyTrend,
    });
  });

  // =========================================================================
  // 10. INNOVATION 3: AI FINANCIAL ASSISTANT WITH RAG
  // =========================================================================
  app.get('/api/assistant/chat', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT id, role, content, mode, retrieved_summary, created_at FROM chat_history WHERE user_id = ? ORDER BY id ASC LIMIT 60')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    res.json({
      messages: rows.map((r) => ({
        id: Number(r.id),
        role: String(r.role),
        content: String(r.content),
        mode: String(r.mode || 'gemini'),
        retrievedSummary: r.retrieved_summary ? JSON.parse(String(r.retrieved_summary)) : null,
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/assistant/chat', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { message } = req.body ?? {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Please enter a financial question.' });
        return;
      }

      const db = getDb();
      const userId = req.authUser!.id;
      const cleanQuestion = message.trim();

      const recentRows = db
        .prepare('SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 6')
        .all(userId) as Array<{ role: string; content: string }>;
      recentRows.reverse();

      const userMsgRes = db
        .prepare(`INSERT INTO chat_history (user_id, role, content, mode) VALUES (?, 'user', ?, 'user')`)
        .run(userId, cleanQuestion);

      const ragResult = await generateRagFinancialReply(db, userId, cleanQuestion, recentRows);

      const assistantMsgRes = db
        .prepare(
          `INSERT INTO chat_history (user_id, role, content, mode, retrieved_summary)
           VALUES (?, 'assistant', ?, ?, ?)`
        )
        .run(userId, ragResult.reply, ragResult.mode, JSON.stringify(ragResult.retrievedSummary));

      res.json({
        userMessage: {
          id: Number(userMsgRes.lastInsertRowid),
          role: 'user',
          content: cleanQuestion,
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: Number(assistantMsgRes.lastInsertRowid),
          role: 'assistant',
          content: ragResult.reply,
          mode: ragResult.mode,
          retrievedSummary: ragResult.retrievedSummary,
          createdAt: new Date().toISOString(),
        },
        notice: ragResult.notice,
      });
    } catch (err) {
      console.error('Assistant chat error:', err);
      res.status(500).json({ error: 'Unable to answer right now. Please try again.' });
    }
  });

  app.delete('/api/assistant/chat', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // =========================================================================
  // 11. INNOVATION 7: SMART SAVINGS RECOMMENDATIONS & SAVINGS GOALS
  // =========================================================================
  app.get('/api/recommendations', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const monthKey = getCurrentMonthKey();
    const prevMonthKey = getPrevMonthKey(monthKey);

    const txs = db
      .prepare(
        `SELECT id, transaction_date as date, merchant, description, category_name as category, amount, type
         FROM transactions WHERE user_id = ?`
      )
      .all(userId) as Array<{
      id: number;
      date: string;
      merchant: string;
      description: string;
      category: string;
      amount: number;
      type: 'income' | 'expense';
    }>;

    const monthlyIncome = txs
      .filter((t) => t.type === 'income' && t.date.startsWith(monthKey))
      .reduce((s, t) => s + t.amount, 0);

    const rec = generateSavingsRecommendations(txs, monthKey, prevMonthKey, monthlyIncome);
    const goalRows = db
      .prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY target_date ASC')
      .all(userId) as Array<Record<string, unknown>>;

    const goals = goalRows.map((g) => {
      const target = Number(g.target_amount);
      const current = Number(g.current_amount);
      return {
        id: Number(g.id),
        userId: Number(g.user_id),
        title: String(g.title),
        targetAmount: target,
        currentAmount: current,
        targetDate: String(g.target_date),
        progressPercent: target > 0 ? Math.min(100, Number(((current / target) * 100).toFixed(1))) : 0,
        createdAt: String(g.created_at),
      };
    });

    res.json({
      monthKey,
      monthlyIncome: Number(monthlyIncome.toFixed(2)),
      ...rec,
      goals,
    });
  });

  app.post('/api/goals', requireAuth, (req: AuthedRequest, res) => {
    const { title, targetAmount, currentAmount, targetDate } = req.body ?? {};
    const target = Number(targetAmount);
    const current = Math.max(0, Number(currentAmount) || 0);
    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      res.status(400).json({ error: 'Goal title is required.' });
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      res.status(400).json({ error: 'Target amount must be greater than zero.' });
      return;
    }
    const tDate =
      typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
        ? targetDate
        : '2027-06-30';

    const db = getDb();
    const info = db
      .prepare(
        'INSERT INTO savings_goals (user_id, title, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.authUser!.id, title.trim(), target, current, tDate);

    res.status(201).json({
      goal: {
        id: Number(info.lastInsertRowid),
        userId: req.authUser!.id,
        title: title.trim(),
        targetAmount: target,
        currentAmount: current,
        targetDate: tDate,
        progressPercent: Math.min(100, Number(((current / target) * 100).toFixed(1))),
        createdAt: new Date().toISOString(),
      },
    });
  });

  app.put('/api/goals/:id', requireAuth, (req: AuthedRequest, res) => {
    const { currentAmount, targetAmount, title } = req.body ?? {};
    const db = getDb();
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?')
      .get(id, req.authUser!.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Savings goal not found.' });
      return;
    }
    const nextCur = currentAmount !== undefined ? Math.max(0, Number(currentAmount)) : Number(existing.current_amount);
    const nextTarget = targetAmount !== undefined && Number(targetAmount) > 0 ? Number(targetAmount) : Number(existing.target_amount);
    const nextTitle = typeof title === 'string' && title.trim() ? title.trim() : String(existing.title);

    db.prepare('UPDATE savings_goals SET title = ?, current_amount = ?, target_amount = ? WHERE id = ? AND user_id = ?').run(
      nextTitle,
      nextCur,
      nextTarget,
      id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  app.delete('/api/goals/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const info = db
      .prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.authUser!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Goal not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 12. RECURRING EXPENSE TRACKER & PATTERN DETECTION
  // =========================================================================
  app.get('/api/recurring', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const rows = db
      .prepare('SELECT * FROM recurring_expenses WHERE user_id = ? ORDER BY next_expected_date ASC')
      .all(userId) as Array<Record<string, unknown>>;

    const recurring = rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      title: String(r.title),
      categoryName: String(r.category_name),
      amount: Number(r.amount),
      frequency: String(r.frequency),
      nextExpectedDate: String(r.next_expected_date),
      paymentMethod: String(r.payment_method),
      isAutoDetected: Boolean(r.is_auto_detected),
      notes: String(r.notes ?? ''),
    }));

    const txs = db
      .prepare(
        `SELECT id, transaction_date as date, merchant, description, category_name as category, amount, type
         FROM transactions WHERE user_id = ?`
      )
      .all(userId) as Array<{
      id: number;
      date: string;
      merchant: string;
      description: string;
      category: string;
      amount: number;
      type: 'income' | 'expense';
    }>;

    const detectedPatterns = detectRecurringPatterns(
      txs,
      recurring.map((r) => r.title)
    );

    const monthlyTotal = recurring.reduce((sum, r) => {
      if (r.frequency === 'weekly') return sum + r.amount * 4.33;
      if (r.frequency === 'quarterly') return sum + r.amount / 3;
      if (r.frequency === 'yearly') return sum + r.amount / 12;
      return sum + r.amount;
    }, 0);

    res.json({
      recurring,
      detectedPatterns,
      totalMonthlyCommitments: Number(monthlyTotal.toFixed(2)),
    });
  });

  app.post('/api/recurring', requireAuth, (req: AuthedRequest, res) => {
    const { title, categoryName, amount, frequency, nextExpectedDate, paymentMethod, isAutoDetected, notes } =
      req.body ?? {};
    const amt = Number(amount);
    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      res.status(400).json({ error: 'Title is required.' });
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }
    const freq = ['monthly', 'weekly', 'quarterly', 'yearly'].includes(String(frequency))
      ? String(frequency)
      : 'monthly';
    const nextDate =
      typeof nextExpectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nextExpectedDate)
        ? nextExpectedDate
        : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO recurring_expenses (user_id, title, category_name, amount, frequency, next_expected_date, payment_method, is_auto_detected, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.authUser!.id,
        title.trim(),
        typeof categoryName === 'string' && categoryName.trim() ? categoryName.trim() : 'Bills',
        Number(amt.toFixed(2)),
        freq,
        nextDate,
        typeof paymentMethod === 'string' && paymentMethod.trim() ? paymentMethod.trim() : 'UPI',
        isAutoDetected ? 1 : 0,
        typeof notes === 'string' ? notes.trim() : ''
      );

    res.status(201).json({ id: Number(info.lastInsertRowid), ok: true });
  });

  app.delete('/api/recurring/:id', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const info = db
      .prepare('DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.authUser!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Recurring expense not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 13. REPORTS & CSV EXPORT
  // =========================================================================
  app.get('/api/reports', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const startDate =
      typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
        ? req.query.startDate
        : new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const endDate =
      typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
        ? req.query.endDate
        : new Date().toISOString().slice(0, 10);

    const rows = db
      .prepare(
        `SELECT * FROM transactions
         WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?
         ORDER BY transaction_date DESC, id DESC`
      )
      .all(userId, startDate, endDate)
      .map((r) => mapTransactionRow(r as Record<string, unknown>));

    const totalIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

    // Daily, weekly, monthly, yearly, category aggregations
    const dailyMap = new Map<string, number>();
    const weeklyMap = new Map<string, number>();
    const monthlyMap = new Map<string, { income: number; expense: number }>();
    const yearlyMap = new Map<string, { income: number; expense: number }>();
    const categoryMap = new Map<string, number>();

    for (const tx of rows) {
      const mk = tx.transactionDate.slice(0, 7);
      const yk = tx.transactionDate.slice(0, 4);
      const mEntry = monthlyMap.get(mk) ?? { income: 0, expense: 0 };
      const yEntry = yearlyMap.get(yk) ?? { income: 0, expense: 0 };
      if (tx.type === 'income') {
        mEntry.income += tx.amount;
        yEntry.income += tx.amount;
      } else {
        mEntry.expense += tx.amount;
        yEntry.expense += tx.amount;
        dailyMap.set(tx.transactionDate, (dailyMap.get(tx.transactionDate) ?? 0) + tx.amount);
        // ISO Week bucket (start of week Monday)
        const d = new Date(tx.transactionDate + 'T00:00:00Z');
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        const wk = `Week of ${d.toISOString().slice(0, 10)}`;
        weeklyMap.set(wk, (weeklyMap.get(wk) ?? 0) + tx.amount);
        categoryMap.set(tx.categoryName, (categoryMap.get(tx.categoryName) ?? 0) + tx.amount);
      }
      monthlyMap.set(mk, mEntry);
      yearlyMap.set(yk, yEntry);
    }

    const userRow = db
      .prepare('SELECT monthly_budget_limit FROM users WHERE id = ?')
      .get(userId) as { monthly_budget_limit: number };
    const allExpenses = db
      .prepare(`SELECT transaction_date as date, amount, category_name as category FROM transactions WHERE user_id = ? AND type = 'expense'`)
      .all(userId) as Array<{ date: string; amount: number; category: string }>;
    const forecast = generateExpenseForecast(allExpenses, Number(userRow.monthly_budget_limit) || 20000);

    res.json({
      range: { startDate, endDate },
      totals: {
        income: Number(totalIncome.toFixed(2)),
        expense: Number(totalExpense.toFixed(2)),
        savings: Number((totalIncome - totalExpense).toFixed(2)),
        savingsRate: totalIncome > 0 ? Number((((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1)) : 0,
        transactionCount: rows.length,
      },
      daily: Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) })),
      weekly: Array.from(weeklyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, amount]) => ({ week, amount: Number(amount.toFixed(2)) })),
      monthly: Array.from(monthlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => ({
          month,
          income: Number(v.income.toFixed(2)),
          expense: Number(v.expense.toFixed(2)),
          savings: Number((v.income - v.expense).toFixed(2)),
        })),
      yearly: Array.from(yearlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, v]) => ({
          year,
          income: Number(v.income.toFixed(2)),
          expense: Number(v.expense.toFixed(2)),
          savings: Number((v.income - v.expense).toFixed(2)),
        })),
      byCategory: Array.from(categoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({
          category,
          amount: Number(amount.toFixed(2)),
          share: totalExpense > 0 ? Number(((amount / totalExpense) * 100).toFixed(1)) : 0,
        })),
      predictedMonthlySpending: forecast.predictedEndOfMonthTotal,
      next30DaysForecast: forecast.next30DaysTotal,
      transactions: rows,
    });
  });

  app.get('/api/reports/export.csv', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const userId = req.authUser!.id;
    const startDate =
      typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
        ? req.query.startDate
        : '2000-01-01';
    const endDate =
      typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
        ? req.query.endDate
        : '2099-12-31';

    const rows = db
      .prepare(
        `SELECT transaction_date, type, category_name, merchant, description, payment_method, amount
         FROM transactions
         WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?
         ORDER BY transaction_date DESC`
      )
      .all(userId, startDate, endDate) as Array<Record<string, unknown>>;

    const escapeCsv = (v: unknown) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = 'Date,Type,Category,Merchant,Description,Payment Method,Amount (INR)';
    const lines = rows.map((r) =>
      [
        r.transaction_date,
        r.type,
        r.category_name,
        r.merchant,
        r.description,
        r.payment_method,
        Number(r.amount).toFixed(2),
      ]
        .map(escapeCsv)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledgeriq_report_${startDate}_to_${endDate}.csv"`);
    res.send(csv);
  });

  // =========================================================================
  // 14. NOTIFICATIONS
  // =========================================================================
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({
      notifications: rows.map((r) => ({
        id: Number(r.id),
        type: String(r.type),
        title: String(r.title),
        message: String(r.message),
        isRead: Boolean(r.is_read),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.put('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // =========================================================================
  // 15. SUPABASE CLOUD BACKEND STATUS & SYNC
  // =========================================================================
  app.get('/api/supabase/status', requireAuth, async (_req: AuthedRequest, res) => {
    try {
      const status = await checkSupabaseConnection();
      res.json(status);
    } catch (err) {
      res.status(500).json({
        configured: false,
        reachable: false,
        schemaReady: false,
        canServerSync: false,
        mode: 'sqlite-local',
        message: err instanceof Error ? err.message : 'Unable to check Supabase status.',
      });
    }
  });

  app.post('/api/supabase/sync', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const sbSession = supabaseSessionStore.get(req.authUser!.id) ?? null;
      const summary = await syncUserLedgerToSupabase(req.authUser!.id, sbSession);
      res.json({ ok: true, summary });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not sync ledger to Supabase.',
      });
    }
  });

  // =========================================================================
  // FRONTEND SERVING (Vite dev middleware in dev, dist/ in production)
  // =========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LedgerIQ server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
