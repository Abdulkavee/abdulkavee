import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getDb } from './db.ts';

function isBlockedPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower === '169.254.169.254' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Validates and normalizes a Supabase project URL (strips any accidental `/rest/v1/` suffix).
 * Enforces HTTPS and an allowlisted Supabase domain to block SSRF or private-network fetches.
 */
export function normalizeSupabaseProjectUrl(rawUrl?: string): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  try {
    const cleaned = rawUrl
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    if (isBlockedPrivateHost(parsed.hostname)) return null;
    if (!parsed.hostname.endsWith('.supabase.co') && !parsed.hostname.endsWith('.supabase.in')) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Cleans and validates a Supabase API key from environment variables.
 * Strips accidental quotes/whitespace and rejects placeholder values so
 * unconfigured `.env` templates never trigger "Invalid API key" failures.
 */
export function sanitizeSupabaseApiKey(rawKey?: string): string | null {
  if (!rawKey) return null;
  const cleaned = rawKey.trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned) return null;
  if (/^(your_|my_|replace_|placeholder|<)/i.test(cleaned)) return null;
  if (cleaned.includes('your_publishable_key') || cleaned.includes('your-sb_')) return null;

  const isModernKey =
    (cleaned.startsWith('sb_publishable_') || cleaned.startsWith('sb_secret_')) &&
    cleaned.length >= 24;
  const isLegacyJwt =
    cleaned.startsWith('eyJ') && cleaned.split('.').length === 3 && cleaned.length >= 60;

  return isModernKey || isLegacyJwt ? cleaned : null;
}

export function isSupabaseInvalidApiKeyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('invalid api key') ||
    msg.includes('no api key found') ||
    msg.includes('apikey') && msg.includes('invalid')
  );
}

function getConfiguredPublishableKey(): string | null {
  return (
    sanitizeSupabaseApiKey(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    sanitizeSupabaseApiKey(process.env.SUPABASE_ANON_KEY) ||
    sanitizeSupabaseApiKey(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    sanitizeSupabaseApiKey(process.env.VITE_SUPABASE_ANON_KEY)
  );
}

function getConfiguredServiceRoleKey(): string | null {
  return sanitizeSupabaseApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface SupabaseConfigState {
  projectUrl: string | null;
  hasPublishableKey: boolean;
  hasServiceRoleKey: boolean;
  configured: boolean;
}

export function getSupabaseConfigState(): SupabaseConfigState {
  const projectUrl = normalizeSupabaseProjectUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const publishableKey = getConfiguredPublishableKey();
  const serviceRoleKey = getConfiguredServiceRoleKey();

  return {
    projectUrl,
    hasPublishableKey: Boolean(publishableKey),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    configured: Boolean(projectUrl && (publishableKey || serviceRoleKey)),
  };
}

let cachedServiceClient: SupabaseClient | null = null;
let cachedPublicClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  const projectUrl = normalizeSupabaseProjectUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const serviceRoleKey = getConfiguredServiceRoleKey();
  if (!projectUrl || !serviceRoleKey) return null;
  if (!cachedServiceClient) {
    cachedServiceClient = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedServiceClient;
}

export function getSupabasePublicServerClient(): SupabaseClient | null {
  const projectUrl = normalizeSupabaseProjectUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const publishableKey = getConfiguredPublishableKey();
  if (!projectUrl || !publishableKey) return null;
  if (!cachedPublicClient) {
    cachedPublicClient = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedPublicClient;
}

export interface SupabaseConnectionStatus {
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  canServerSync: boolean;
  mode: 'supabase+sqlite' | 'supabase-readonly' | 'sqlite-local';
  message: string;
}

export async function checkSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const cfg = getSupabaseConfigState();
  if (!cfg.configured || !cfg.projectUrl) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      canServerSync: false,
      mode: 'sqlite-local',
      message:
        'Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (plus SUPABASE_SERVICE_ROLE_KEY for server sync) in Settings -> Secrets.',
    };
  }

  const activeKey = getConfiguredServiceRoleKey() || getConfiguredPublishableKey();
  const client = getSupabaseServerClient() || getSupabasePublicServerClient();
  if (!client || !activeKey) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      canServerSync: false,
      mode: 'sqlite-local',
      message: 'Supabase client could not be initialized from environment variables.',
    };
  }

  try {
    // 1. Verify project URL + API key against Supabase Auth settings endpoint
    const authResp = await fetch(`${cfg.projectUrl}/auth/v1/settings`, {
      headers: { apikey: activeKey },
    });
    if (authResp.status === 401 || authResp.status === 403) {
      return {
        configured: true,
        reachable: true,
        schemaReady: false,
        canServerSync: false,
        mode: 'sqlite-local',
        message:
          'Supabase rejected the configured API key ("Invalid API key"). Copy the active Publishable key or Legacy anon key from Supabase Dashboard -> Project Settings -> API Keys into .env and restart.',
      };
    }

    // 2. Verify schema tables using GET (not HEAD) so PostgreSQL error codes (42P01 vs 42501) are visible
    const { error } = await client.from('categories').select('id').limit(1);
    if (error) {
      const missingTable =
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message.toLowerCase().includes('could not find the table') ||
        error.message.toLowerCase().includes('does not exist');

      if (missingTable) {
        return {
          configured: true,
          reachable: true,
          schemaReady: false,
          canServerSync: cfg.hasServiceRoleKey || cfg.hasPublishableKey,
          mode: 'sqlite-local',
          message:
            'Connected to Supabase Auth, but LedgerIQ tables are not created yet. Run database/supabase_schema.sql in your Supabase SQL Editor.',
        };
      }

      if (isSupabaseInvalidApiKeyError(error)) {
        return {
          configured: true,
          reachable: true,
          schemaReady: false,
          canServerSync: false,
          mode: 'sqlite-local',
          message:
            'Supabase rejected the configured API key ("Invalid API key"). Copy the active Publishable key or Legacy anon key from Supabase Dashboard -> Project Settings -> API Keys into .env and restart.',
        };
      }

      if (error.code === '42501' || error.message.toLowerCase().includes('permission denied')) {
        return {
          configured: true,
          reachable: true,
          schemaReady: true,
          canServerSync: cfg.hasServiceRoleKey || cfg.hasPublishableKey,
          mode: cfg.hasServiceRoleKey ? 'supabase+sqlite' : 'supabase-readonly',
          message:
            'Connected to Supabase Auth & tables exist. Run the GRANT statements at the bottom of database/supabase_schema.sql in Supabase SQL Editor to enable full read/write under RLS.',
        };
      }

      return {
        configured: true,
        reachable: true,
        schemaReady: false,
        canServerSync: cfg.hasServiceRoleKey,
        mode: 'sqlite-local',
        message: `Supabase responded with: ${error.message || 'Check database/supabase_schema.sql grants.'}`,
      };
    }

    const { error: authLogErr } = await client.from('auth_activity_logs').select('id').limit(1);
    const authLogsReady =
      !authLogErr ||
      authLogErr.code === '42501' ||
      authLogErr.message.toLowerCase().includes('permission denied');

    return {
      configured: true,
      reachable: true,
      schemaReady: true,
      canServerSync: cfg.hasServiceRoleKey || cfg.hasPublishableKey,
      mode: cfg.hasServiceRoleKey ? 'supabase+sqlite' : 'supabase-readonly',
      message: authLogsReady
        ? 'Connected to Supabase PostgreSQL with Auth, profiles, auth activity logs, and ledger tables ready.'
        : 'Connected to Supabase. Re-run database/supabase_schema.sql in your SQL Editor to enable auth_activity_logs tracking.',
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      schemaReady: false,
      canServerSync: cfg.hasServiceRoleKey,
      mode: 'sqlite-local',
      message:
        err instanceof Error
          ? `Could not reach Supabase endpoint: ${err.message}`
          : 'Could not reach Supabase endpoint.',
    };
  }
}

export interface SupabaseSyncSummary {
  transactionsSynced: number;
  budgetsSynced: number;
  recurringSynced: number;
  goalsSynced: number;
}

export interface SupabaseUserSession {
  accessToken: string;
  supabaseUserId: string;
  email: string;
}

export type AuthActivityEventType = 'signup' | 'login' | 'logout' | 'password_reset';

export interface AuthActivityEntry {
  id: string;
  email: string;
  fullName: string;
  eventType: AuthActivityEventType;
  authProvider: string;
  source: 'supabase' | 'local';
  supabaseSynced: boolean;
  createdAt: string;
}

/**
 * Creates a stateless per-request Supabase client authenticated with a specific user's
 * verified Supabase JWT so all database writes run under strict Row Level Security (RLS)
 * using only the publishable API key.
 */
export function createUserScopedSupabaseClient(accessToken: string): SupabaseClient | null {
  const projectUrl = normalizeSupabaseProjectUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const publishableKey = getConfiguredPublishableKey();
  if (!projectUrl || !publishableKey || !accessToken.trim()) return null;
  return createClient(projectUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Syncs the authenticated user's local SQLite ledger records into their Supabase tables.
 * Works with either SUPABASE_SERVICE_ROLE_KEY OR an active user's RLS-scoped Supabase session.
 */
export async function syncUserLedgerToSupabase(
  userId: number,
  userSession?: SupabaseUserSession | null
): Promise<SupabaseSyncSummary> {
  const serviceClient = getSupabaseServerClient();
  const userClient = userSession?.accessToken
    ? createUserScopedSupabaseClient(userSession.accessToken)
    : null;
  const client = serviceClient || userClient;
  const supabaseUid = userSession?.supabaseUserId ?? null;

  if (!client) {
    throw new Error(
      'Sign in with a Supabase email account (with SUPABASE_URL & SUPABASE_PUBLISHABLE_KEY set in Settings -> Secrets) or configure SUPABASE_SERVICE_ROLE_KEY to sync.'
    );
  }

  const db = getDb();
  const userRow = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as
    | { id: number; email: string }
    | undefined;
  if (!userRow) {
    throw new Error('Authenticated user record not found.');
  }

  const ownerEmail = userRow.email;

  const txRows = db
    .prepare(
      `SELECT id, category_name, type, amount, description, merchant, payment_method,
              transaction_date, is_recurring, predicted_category, prediction_confidence
       FROM transactions WHERE user_id = ?`
    )
    .all(userId) as Array<Record<string, unknown>>;

  if (txRows.length > 0) {
    const payload = txRows.map((r) => ({
      ...(supabaseUid ? { user_id: supabaseUid } : {}),
      external_owner_email: ownerEmail,
      external_id: `tx_${r.id}`,
      category_name: String(r.category_name),
      type: String(r.type),
      amount: Number(r.amount),
      description: String(r.description),
      merchant: String(r.merchant ?? ''),
      payment_method: String(r.payment_method ?? 'UPI'),
      transaction_date: String(r.transaction_date),
      is_recurring: Boolean(r.is_recurring),
      predicted_category: r.predicted_category ? String(r.predicted_category) : null,
      prediction_confidence:
        r.prediction_confidence !== null && r.prediction_confidence !== undefined
          ? Number(r.prediction_confidence)
          : null,
    }));

    const { error } = await client
      .from('transactions')
      .upsert(payload, { onConflict: 'external_owner_email,external_id' });
    if (error) {
      throw new Error(`Supabase transactions sync failed: ${error.message}`);
    }
  }

  const budgetRows = db
    .prepare('SELECT category_name, month_key, amount_limit FROM budgets WHERE user_id = ?')
    .all(userId) as Array<Record<string, unknown>>;

  if (budgetRows.length > 0) {
    const payload = budgetRows.map((b) => ({
      ...(supabaseUid ? { user_id: supabaseUid } : {}),
      external_owner_email: ownerEmail,
      category_name: String(b.category_name),
      month_key: String(b.month_key),
      amount_limit: Number(b.amount_limit),
    }));
    const { error } = await client
      .from('budgets')
      .upsert(payload, { onConflict: 'external_owner_email,category_name,month_key' });
    if (error) {
      throw new Error(`Supabase budgets sync failed: ${error.message}`);
    }
  }

  const recRows = db
    .prepare(
      `SELECT id, title, category_name, amount, frequency, next_expected_date,
              payment_method, is_auto_detected, notes
       FROM recurring_expenses WHERE user_id = ?`
    )
    .all(userId) as Array<Record<string, unknown>>;

  if (recRows.length > 0) {
    const payload = recRows.map((r) => ({
      ...(supabaseUid ? { user_id: supabaseUid } : {}),
      external_owner_email: ownerEmail,
      external_id: `rec_${r.id}`,
      title: String(r.title),
      category_name: String(r.category_name),
      amount: Number(r.amount),
      frequency: String(r.frequency),
      next_expected_date: String(r.next_expected_date),
      payment_method: String(r.payment_method ?? 'UPI'),
      is_auto_detected: Boolean(r.is_auto_detected),
      notes: String(r.notes ?? ''),
    }));
    const { error } = await client
      .from('recurring_expenses')
      .upsert(payload, { onConflict: 'external_owner_email,external_id' });
    if (error) {
      throw new Error(`Supabase recurring bills sync failed: ${error.message}`);
    }
  }

  const goalRows = db
    .prepare(
      'SELECT id, title, target_amount, current_amount, target_date FROM savings_goals WHERE user_id = ?'
    )
    .all(userId) as Array<Record<string, unknown>>;

  if (goalRows.length > 0) {
    const payload = goalRows.map((g) => ({
      ...(supabaseUid ? { user_id: supabaseUid } : {}),
      external_owner_email: ownerEmail,
      external_id: `goal_${g.id}`,
      title: String(g.title),
      target_amount: Number(g.target_amount),
      current_amount: Number(g.current_amount),
      target_date: String(g.target_date),
    }));
    const { error } = await client
      .from('savings_goals')
      .upsert(payload, { onConflict: 'external_owner_email,external_id' });
    if (error) {
      throw new Error(`Supabase savings goals sync failed: ${error.message}`);
    }
  }

  return {
    transactionsSynced: txRows.length,
    budgetsSynced: budgetRows.length,
    recurringSynced: recRows.length,
    goalsSynced: goalRows.length,
  };
}

/**
 * Best-effort background mirror of a single transaction mutation to Supabase when configured.
 */
export async function mirrorTransactionToSupabase(
  userId: number,
  tx: {
    id: number;
    categoryName: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    merchant: string;
    paymentMethod: string;
    transactionDate: string;
    isRecurring: boolean;
    predictedCategory: string | null;
    predictionConfidence: number | null;
  }
): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client) return;
  const db = getDb();
  const userRow = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as
    | { email: string }
    | undefined;
  if (!userRow) return;

  await client.from('transactions').upsert(
    {
      external_owner_email: userRow.email,
      external_id: `tx_${tx.id}`,
      category_name: tx.categoryName,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      merchant: tx.merchant,
      payment_method: tx.paymentMethod,
      transaction_date: tx.transactionDate,
      is_recurring: tx.isRecurring,
      predicted_category: tx.predictedCategory,
      prediction_confidence: tx.predictionConfidence,
    },
    { onConflict: 'external_owner_email,external_id' }
  );
}

export async function deleteMirroredTransactionInSupabase(
  userId: number,
  txId: number
): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client) return;
  const db = getDb();
  const userRow = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as
    | { email: string }
    | undefined;
  if (!userRow) return;

  await client
    .from('transactions')
    .delete()
    .eq('external_owner_email', userRow.email)
    .eq('external_id', `tx_${txId}`);
}

/**
 * Creates a fresh, stateless Supabase auth client per request so concurrent logins
 * never share in-memory auth session state across users.
 */
function createStatelessSupabaseAuthClient(): SupabaseClient | null {
  const projectUrl = normalizeSupabaseProjectUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  );
  const key = getConfiguredPublishableKey() || getConfiguredServiceRoleKey();
  if (!projectUrl || !key) return null;
  return createClient(projectUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseAuthEnabled(): boolean {
  const cfg = getSupabaseConfigState();
  return Boolean(cfg.projectUrl && (cfg.hasPublishableKey || cfg.hasServiceRoleKey));
}

export async function supabaseEmailSignUp(params: {
  email: string;
  password: string;
  fullName: string;
  monthlyIncomeTarget: number;
  monthlyBudgetLimit: number;
  emailRedirectTo?: string;
}): Promise<{
  email: string;
  fullName: string;
  requiresEmailConfirmation: boolean;
  supabaseUserId: string | null;
  accessToken: string | null;
}> {
  const client = createStatelessSupabaseAuthClient();
  if (!client) {
    throw new Error('Supabase email authentication is not configured on the server.');
  }

  const { data, error } = await client.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: params.emailRedirectTo,
      data: {
        full_name: params.fullName,
        monthly_income_target: params.monthlyIncomeTarget,
        monthly_budget_limit: params.monthlyBudgetLimit,
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'Supabase sign up failed.');
  }

  // Supabase returns an empty identities array if the email is already registered with confirmation enabled
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  return {
    email: data.user?.email?.toLowerCase() || params.email,
    fullName: params.fullName,
    requiresEmailConfirmation: !data.session,
    supabaseUserId: data.user?.id ?? null,
    accessToken: data.session?.access_token ?? null,
  };
}

export async function supabaseEmailSignIn(
  email: string,
  password: string
): Promise<{
  email: string;
  fullName: string;
  monthlyIncomeTarget: number;
  monthlyBudgetLimit: number;
  supabaseUserId: string;
  accessToken: string | null;
}> {
  const client = createStatelessSupabaseAuthClient();
  if (!client) {
    throw new Error('Supabase email authentication is not configured on the server.');
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const msg = error?.message || 'Invalid email or password.';
    const wrapped = new Error(msg) as Error & { needsEmailVerification?: boolean };
    if (msg.toLowerCase().includes('email not confirmed')) {
      wrapped.needsEmailVerification = true;
    }
    throw wrapped;
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    typeof meta.full_name === 'string' && meta.full_name.trim().length >= 2
      ? meta.full_name.trim()
      : (data.user.email || email).split('@')[0];

  return {
    email: (data.user.email || email).toLowerCase(),
    fullName,
    monthlyIncomeTarget:
      typeof meta.monthly_income_target === 'number' && meta.monthly_income_target > 0
        ? meta.monthly_income_target
        : 30000,
    monthlyBudgetLimit:
      typeof meta.monthly_budget_limit === 'number' && meta.monthly_budget_limit > 0
        ? meta.monthly_budget_limit
        : 18000,
    supabaseUserId: data.user.id,
    accessToken: data.session?.access_token ?? null,
  };
}

export async function supabaseVerifyAccessToken(accessToken: string): Promise<{
  email: string;
  fullName: string;
  monthlyIncomeTarget: number;
  monthlyBudgetLimit: number;
  supabaseUserId: string;
}> {
  const client = createStatelessSupabaseAuthClient();
  if (!client) {
    throw new Error('Supabase is not configured on the server.');
  }
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email) {
    throw new Error('Invalid or expired Supabase session token.');
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    typeof meta.full_name === 'string' && meta.full_name.trim().length >= 2
      ? meta.full_name.trim()
      : data.user.email.split('@')[0];

  return {
    email: data.user.email.toLowerCase(),
    fullName,
    monthlyIncomeTarget:
      typeof meta.monthly_income_target === 'number' && meta.monthly_income_target > 0
        ? meta.monthly_income_target
        : 30000,
    monthlyBudgetLimit:
      typeof meta.monthly_budget_limit === 'number' && meta.monthly_budget_limit > 0
        ? meta.monthly_budget_limit
        : 18000,
    supabaseUserId: data.user.id,
  };
}

/**
 * Records a signup, login, logout, or password_reset event in Supabase PostgreSQL
 * (`public.auth_activity_logs` + `public.profiles`) using either the user's verified
 * RLS-scoped Supabase access token or the server service client.
 */
export async function recordSupabaseAuthEvent(params: {
  supabaseUserId: string;
  email: string;
  fullName: string;
  eventType: AuthActivityEventType;
  accessToken?: string | null;
  authProvider?: string;
  userAgent?: string;
  monthlyIncomeTarget?: number;
  monthlyBudgetLimit?: number;
}): Promise<{ synced: boolean; error?: string }> {
  const client =
    (params.accessToken ? createUserScopedSupabaseClient(params.accessToken) : null) ||
    getSupabaseServerClient();

  if (!client || !params.supabaseUserId) {
    return { synced: false };
  }

  const nowIso = new Date().toISOString();
  const safeUserAgent = (params.userAgent || '').slice(0, 240);

  try {
    // 1. Keep public.profiles up to date with latest login/logout timestamps & status
    const profilePatch: Record<string, unknown> = {
      id: params.supabaseUserId,
      email: params.email.toLowerCase(),
      full_name: params.fullName.trim() || params.email.split('@')[0],
      updated_at: nowIso,
    };
    if (typeof params.monthlyIncomeTarget === 'number' && params.monthlyIncomeTarget > 0) {
      profilePatch.monthly_income_target = params.monthlyIncomeTarget;
    }
    if (typeof params.monthlyBudgetLimit === 'number' && params.monthlyBudgetLimit > 0) {
      profilePatch.monthly_budget_limit = params.monthlyBudgetLimit;
    }
    if (params.eventType === 'login' || params.eventType === 'signup') {
      profilePatch.session_status = 'signed_in';
      profilePatch.last_login_at = nowIso;
    } else if (params.eventType === 'logout') {
      profilePatch.session_status = 'signed_out';
      profilePatch.last_logout_at = nowIso;
    }

    await client.from('profiles').upsert(profilePatch, { onConflict: 'id' });

    // 2. Append immutable auth activity event row
    const { error } = await client.from('auth_activity_logs').insert({
      user_id: params.supabaseUserId,
      email: params.email.toLowerCase(),
      full_name: params.fullName.trim() || params.email.split('@')[0],
      event_type: params.eventType,
      auth_provider: params.authProvider || 'supabase_email',
      user_agent: safeUserAgent,
    });

    if (error) {
      return { synced: false, error: error.message };
    }
    return { synced: true };
  } catch (err) {
    return {
      synced: false,
      error: err instanceof Error ? err.message : 'Could not record Supabase auth event.',
    };
  }
}

export async function fetchSupabaseAuthActivity(
  accessToken: string,
  limit = 25
): Promise<AuthActivityEntry[] | null> {
  const client = createUserScopedSupabaseClient(accessToken);
  if (!client) return null;
  try {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const { data, error } = await client
      .from('auth_activity_logs')
      .select('id, email, full_name, event_type, auth_provider, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error || !Array.isArray(data)) {
      return null;
    }

    return data.map((row) => ({
      id: `sb_${row.id}`,
      email: String(row.email),
      fullName: String(row.full_name || ''),
      eventType: String(row.event_type) as AuthActivityEventType,
      authProvider: String(row.auth_provider || 'supabase_email'),
      source: 'supabase',
      supabaseSynced: true,
      createdAt: String(row.created_at),
    }));
  } catch {
    return null;
  }
}

export async function supabaseSignOutSession(accessToken: string): Promise<void> {
  const client = createUserScopedSupabaseClient(accessToken);
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // Best-effort remote session revocation
  }
}

export async function supabaseSendPasswordReset(email: string, redirectTo?: string): Promise<void> {
  const client = createStatelessSupabaseAuthClient();
  if (!client) {
    throw new Error('Password reset emails require Supabase Email Authentication to be configured.');
  }
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    throw new Error(error.message || 'Could not send password reset email.');
  }
}

export async function supabaseResendConfirmation(email: string, redirectTo?: string): Promise<void> {
  const client = createStatelessSupabaseAuthClient();
  if (!client) {
    throw new Error('Email confirmation requires Supabase Email Authentication to be configured.');
  }
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) {
    throw new Error(error.message || 'Could not resend verification email.');
  }
}
