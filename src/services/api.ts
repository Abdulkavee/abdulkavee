import type {
  Budget,
  Category,
  CategoryPrediction,
  ChatMessage,
  DashboardPayload,
  DetectedRecurringPattern,
  ForecastResult,
  NotificationItem,
  ParsedReceiptData,
  ReceiptRecord,
  RecurringExpense,
  SavingsGoal,
  SavingsRecommendation,
  SpendingAnomaly,
  Transaction,
  UserProfile,
} from '../types/finance';

// Capacitor-ready base URL: empty string on web (same-origin), or set VITE_API_BASE_URL for Android/iOS builds
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

const LEGACY_TOKEN_STORAGE_KEY = 'ledgeriq_auth_token';
let memoryAuthToken: string | null = null;

// Clean up any legacy token previously persisted in localStorage
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  }
} catch {
  // Ignore storage restrictions
}

export function getStoredToken(): string | null {
  return memoryAuthToken;
}

export function setStoredToken(token: string | null): void {
  memoryAuthToken = token;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) errMsg = data.error;
    } catch {
      // keep default message
    }
    throw new Error(errMsg);
  }

  return (await res.json()) as T;
}

export const api = {
  // Auth
  login(email: string, password: string) {
    return apiRequest<{
      token: string;
      user: UserProfile;
      authProvider?: 'supabase' | 'local';
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  register(payload: {
    fullName: string;
    email: string;
    password: string;
    monthlyIncomeTarget?: number;
    monthlyBudgetLimit?: number;
  }) {
    return apiRequest<{
      token?: string;
      user?: UserProfile;
      requiresEmailConfirmation?: boolean;
      email?: string;
      message?: string;
      authProvider?: 'supabase' | 'local';
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  exchangeSupabaseToken(accessToken: string, eventType?: 'signup' | 'login') {
    return apiRequest<{
      token: string;
      user: UserProfile;
      authProvider?: 'supabase';
    }>('/api/auth/supabase/exchange', {
      method: 'POST',
      body: JSON.stringify({ accessToken, eventType }),
    });
  },
  logout(supabaseAccessToken?: string | null) {
    return apiRequest<{ ok: boolean; supabaseSynced: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ supabaseAccessToken: supabaseAccessToken || undefined }),
    });
  },
  getAuthActivity() {
    return apiRequest<{
      activities: Array<{
        id: string;
        email: string;
        fullName: string;
        eventType: 'signup' | 'login' | 'logout' | 'password_reset';
        authProvider: string;
        source: 'supabase' | 'local';
        supabaseSynced: boolean;
        createdAt: string;
      }>;
      activeSupabaseSession: boolean;
      supabaseStatus: {
        configured: boolean;
        reachable: boolean;
        schemaReady: boolean;
        canServerSync: boolean;
        mode: 'supabase+sqlite' | 'supabase-readonly' | 'sqlite-local';
        message: string;
      };
    }>('/api/auth/activity');
  },
  forgotPassword(email: string) {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  resendConfirmation(email: string) {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  getMe() {
    return apiRequest<{ user: UserProfile }>('/api/auth/me');
  },
  updateProfile(payload: {
    fullName: string;
    monthlyIncomeTarget: number;
    monthlyBudgetLimit: number;
  }) {
    return apiRequest<{ ok: boolean; user: UserProfile }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  resetDemoData() {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/reset-demo', {
      method: 'POST',
    });
  },

  // Dashboard
  getDashboard(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return apiRequest<DashboardPayload>(`/api/dashboard${q}`);
  },

  // Transactions
  getTransactions(filters: {
    search?: string;
    category?: string;
    type?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== 'ALL') params.set(k, v);
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{
      transactions: Transaction[];
      summary: { count: number; totalIncome: number; totalExpense: number; net: number };
      monthlySummary: Array<{ period: string; income: number; expense: number }>;
      yearlySummary: Array<{ period: string; income: number; expense: number }>;
    }>(`/api/transactions${qs}`);
  },
  createTransaction(payload: {
    type: 'income' | 'expense';
    amount: number;
    categoryName: string;
    description: string;
    merchant?: string;
    paymentMethod: string;
    transactionDate: string;
    predictedCategory?: string | null;
    predictionConfidence?: number | null;
  }) {
    return apiRequest<{ transaction: Transaction }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateTransaction(
    id: number,
    payload: {
      type: 'income' | 'expense';
      amount: number;
      categoryName: string;
      description: string;
      merchant?: string;
      paymentMethod: string;
      transactionDate: string;
    }
  ) {
    return apiRequest<{ transaction: Transaction }>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteTransaction(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  // Categories
  getCategories() {
    return apiRequest<{ categories: Category[] }>('/api/categories');
  },
  createCategory(payload: { name: string; type: 'income' | 'expense'; color?: string }) {
    return apiRequest<{ category: Category }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteCategory(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // Budgets
  getBudgets(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return apiRequest<{ monthKey: string; budgets: Budget[] }>(`/api/budgets${q}`);
  },
  saveBudget(payload: { categoryName: string; monthKey?: string; amountLimit: number }) {
    return apiRequest<{ monthKey: string; budgets: Budget[] }>('/api/budgets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteBudget(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/budgets/${id}`, {
      method: 'DELETE',
    });
  },

  // Receipt OCR
  scanReceipt(file: File) {
    const form = new FormData();
    form.append('receipt', file);
    return apiRequest<{ fileName: string; parsed: ParsedReceiptData }>('/api/receipts/scan', {
      method: 'POST',
      body: form,
    });
  },
  confirmReceipt(payload: Record<string, unknown>) {
    return apiRequest<{ receiptId: number; transactionId: number; message: string }>(
      '/api/receipts/confirm',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  getReceipts() {
    return apiRequest<{ receipts: ReceiptRecord[] }>('/api/receipts');
  },

  // ML Auto-Categorization
  predictCategory(description: string, merchant = '') {
    return apiRequest<{ prediction: CategoryPrediction }>('/api/ml/categorize', {
      method: 'POST',
      body: JSON.stringify({ description, merchant }),
    });
  },

  // 30-Day Forecast
  getForecast() {
    return apiRequest<{ forecast: ForecastResult }>('/api/forecast');
  },

  // Analytics & Anomalies
  getAnalytics() {
    return apiRequest<{
      anomalies: SpendingAnomaly[];
      dayOfWeekSpend: Array<{ day: string; total: number; average: number }>;
      paymentMethods: Array<{ method: string; amount: number }>;
      categoryAllTime: Array<{ category: string; amount: number; color: string }>;
      monthlyTrend: Array<{ month: string; income: number; expense: number; savings: number }>;
    }>('/api/analytics');
  },

  // AI Assistant
  getChatHistory() {
    return apiRequest<{ messages: ChatMessage[] }>('/api/assistant/chat');
  },
  sendChatMessage(message: string) {
    return apiRequest<{
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      notice?: string;
    }>('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
  clearChatHistory() {
    return apiRequest<{ ok: boolean }>('/api/assistant/chat', {
      method: 'DELETE',
    });
  },

  // Recommendations & Goals
  getRecommendations() {
    return apiRequest<{
      monthKey: string;
      monthlyIncome: number;
      recommendations: SavingsRecommendation[];
      suggestedMonthlySavingsTarget: number;
      discretionaryTotal: number;
      essentialTotal: number;
      goals: SavingsGoal[];
    }>('/api/recommendations');
  },
  createGoal(payload: { title: string; targetAmount: number; currentAmount: number; targetDate: string }) {
    return apiRequest<{ goal: SavingsGoal }>('/api/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateGoal(id: number, payload: { currentAmount?: number; targetAmount?: number; title?: string }) {
    return apiRequest<{ ok: boolean }>(`/api/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteGoal(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/goals/${id}`, {
      method: 'DELETE',
    });
  },

  // Recurring
  getRecurring() {
    return apiRequest<{
      recurring: RecurringExpense[];
      detectedPatterns: DetectedRecurringPattern[];
      totalMonthlyCommitments: number;
    }>('/api/recurring');
  },
  createRecurring(payload: {
    title: string;
    categoryName: string;
    amount: number;
    frequency: string;
    nextExpectedDate: string;
    paymentMethod: string;
    isAutoDetected?: boolean;
    notes?: string;
  }) {
    return apiRequest<{ id: number; ok: boolean }>('/api/recurring', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteRecurring(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/recurring/${id}`, {
      method: 'DELETE',
    });
  },

  // Reports
  getReports(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{
      range: { startDate: string; endDate: string };
      totals: { income: number; expense: number; savings: number; savingsRate: number; transactionCount: number };
      daily: Array<{ date: string; amount: number }>;
      weekly: Array<{ week: string; amount: number }>;
      monthly: Array<{ month: string; income: number; expense: number; savings: number }>;
      yearly: Array<{ year: string; income: number; expense: number; savings: number }>;
      byCategory: Array<{ category: string; amount: number; share: number }>;
      predictedMonthlySpending: number;
      next30DaysForecast: number;
      transactions: Transaction[];
    }>(`/api/reports${qs}`);
  },
  async downloadCsvBlob(startDate: string, endDate: string): Promise<Blob> {
    const token = getStoredToken();
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(
      `${API_BASE}/api/reports/export.csv?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error('Could not download CSV report.');
    }
    return res.blob();
  },

  // Notifications
  getNotifications() {
    return apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
  },
  markNotificationsRead() {
    return apiRequest<{ ok: boolean }>('/api/notifications/read-all', {
      method: 'PUT',
    });
  },

  // Supabase Cloud Sync
  getSupabaseStatus() {
    return apiRequest<{
      configured: boolean;
      reachable: boolean;
      schemaReady: boolean;
      canServerSync: boolean;
      mode: 'supabase+sqlite' | 'supabase-readonly' | 'sqlite-local';
      message: string;
    }>('/api/supabase/status');
  },
  syncSupabase() {
    return apiRequest<{
      ok: boolean;
      summary: {
        transactionsSynced: number;
        budgetsSynced: number;
        recurringSynced: number;
        goalsSynced: number;
      };
    }>('/api/supabase/sync', {
      method: 'POST',
    });
  },
};
