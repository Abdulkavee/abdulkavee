export type TransactionType = 'income' | 'expense';

export type PaymentMethod =
  | 'UPI'
  | 'Debit Card'
  | 'Credit Card'
  | 'Cash'
  | 'Net Banking'
  | 'Wallet';

export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  currency: string;
  monthlyIncomeTarget: number;
  monthlyBudgetLimit: number;
  isDemoAccount: boolean;
  createdAt: string;
}

export interface Category {
  id: number;
  userId: number | null;
  name: string;
  type: TransactionType;
  isDefault: boolean;
  color: string;
}

export interface Transaction {
  id: number;
  userId: number;
  categoryId: number | null;
  categoryName: string;
  type: TransactionType;
  amount: number;
  description: string;
  merchant: string;
  paymentMethod: PaymentMethod | string;
  transactionDate: string; // YYYY-MM-DD
  receiptId: number | null;
  isRecurring: boolean;
  predictedCategory?: string | null;
  predictionConfidence?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: number;
  userId: number;
  categoryName: string; // 'OVERALL' for monthly total or category name
  monthKey: string; // YYYY-MM
  amountLimit: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: 'nominal' | 'warning' | 'exceeded';
}

export interface ReceiptItem {
  id?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedReceiptData {
  merchant: string;
  receiptDate: string;
  items: ReceiptItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: string;
  suggestedCategory: string;
  categoryConfidence: number;
  rawText: string;
  ocrConfidence: number;
  validation: {
    status: 'matched' | 'mismatch' | 'no_items';
    itemsSum: number;
    expectedTotal: number;
    difference: number;
    message: string;
  };
  warnings: string[];
  imageUrl?: string;
}

export interface ReceiptRecord {
  id: number;
  userId: number;
  transactionId: number | null;
  fileName: string;
  imageUrl: string;
  merchantName: string;
  receiptDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentInfo: string;
  ocrEngine: string;
  rawText: string;
  verified: boolean;
  createdAt: string;
  items: ReceiptItem[];
}

export interface CategoryPrediction {
  predictedCategory: string;
  confidence: number;
  calibrated: boolean;
  topCandidates: Array<{ category: string; probability: number }>;
  matchedKeywords: string[];
  modelVersion: string;
}

export interface ForecastPoint {
  date: string;
  actual: number | null;
  predicted: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  kind: 'historical' | 'backtest' | 'forecast';
}

export interface CategoryForecastItem {
  category: string;
  historicalMonthlyAvg: number;
  predictedNext30Days: number;
  sampleCount: number;
}

export interface ForecastResult {
  insufficientData: boolean;
  insufficientReason: string | null;
  modelName: string;
  historicalDaysCount: number;
  next7DaysTotal: number;
  next30DaysTotal: number;
  currentMonthSpent: number;
  predictedEndOfMonthTotal: number;
  monthlyBudget: number;
  projectedOverrun: number;
  overrunWarning: string | null;
  evaluation: {
    testDays: number;
    mae: number;
    rmse: number;
    mape: number | null;
    baselineMae: number;
  };
  series: ForecastPoint[];
  categoryForecasts: CategoryForecastItem[];
  generatedAt: string;
}

export interface SpendingAnomaly {
  transactionId: number;
  date: string;
  merchant: string;
  description: string;
  category: string;
  amount: number;
  baselineAvg: number;
  baselineMedian: number;
  deviationFactor: number;
  zScore: number;
  severity: 'Low' | 'Medium' | 'High';
  anomalyType: 'category_outlier' | 'burst_activity' | 'monthly_surge';
  label: string; // Always "Unusual Spending Activity"
  reason: string;
}

export interface SavingsGoal {
  id: number;
  userId: number;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  progressPercent: number;
  createdAt: string;
}

export interface SavingsRecommendation {
  id: string;
  category: string;
  severity: 'info' | 'opportunity' | 'warning';
  title: string;
  detail: string;
  potentialMonthlySavings: number;
  metricLabel: string;
}

export interface RecurringExpense {
  id: number;
  userId: number;
  title: string;
  categoryName: string;
  amount: number;
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly';
  nextExpectedDate: string;
  paymentMethod: string;
  isAutoDetected: boolean;
  notes: string;
}

export interface DetectedRecurringPattern {
  signature: string;
  title: string;
  categoryName: string;
  estimatedAmount: number;
  frequency: 'monthly' | 'weekly';
  occurrences: number;
  lastPaidDate: string;
  nextExpectedDate: string;
  alreadyTracked: boolean;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'gemini' | 'sql_fallback';
  retrievedSummary?: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  type: 'budget_warning' | 'budget_exceeded' | 'anomaly' | 'forecast' | 'info';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardPayload {
  monthKey: string;
  kpis: {
    monthlyIncome: number;
    monthlyExpenses: number;
    currentBalance: number;
    monthlyBudget: number;
    remainingBudget: number;
    savingsAmount: number;
    savingsPercentage: number;
    todaySpending: number;
    budgetUsedPercent: number;
  };
  dailySpending: Array<{ date: string; label: string; amount: number }>;
  categorySpending: Array<{ category: string; amount: number; percentage: number; color: string }>;
  monthlyComparison: Array<{ month: string; label: string; income: number; expense: number; savings: number }>;
  recentTransactions: Transaction[];
  upcomingPredicted: {
    next7DaysTotal: number;
    predictedEndOfMonth: number;
    overrunWarning: string | null;
    next7DaysSeries: Array<{ date: string; predicted: number }>;
  };
  budgetWarnings: Array<{
    categoryName: string;
    percentUsed: number;
    spent: number;
    limit: number;
    status: 'warning' | 'exceeded';
    message: string;
  }>;
  anomalyCount: number;
  isDemoAccount: boolean;
}

export interface WhatIfInput {
  currentIncome: number;
  simulatedIncome: number;
  currentMonthlyBudget: number;
  simulatedMonthlyBudget: number;
  categories: Array<{
    category: string;
    actualSpent: number;
    simulatedBudget: number;
  }>;
}

export interface WhatIfResult {
  currentExpenses: number;
  simulatedExpenses: number;
  currentSavings: number;
  simulatedSavings: number;
  savingsDelta: number;
  remainingBudget: number;
  potentialOverspending: number;
  simulatedSavingsRate: number;
  categoryComparison: Array<{
    category: string;
    current: number;
    simulated: number;
    delta: number;
  }>;
}
