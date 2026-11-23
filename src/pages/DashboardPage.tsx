import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Calendar,
  Camera,
  Car,
  Film,
  HeartPulse,
  Home,
  Lightbulb,
  Plane,
  PlusCircle,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type {
  DashboardPayload,
  ForecastResult,
  RecurringExpense,
  SavingsRecommendation,
} from '../types/finance';
import { formatDateShort, formatINR, formatMonthLabel } from '../utils/format';
import type { AppPageId } from '../components/AppShell';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  DashboardSkeleton,
  EmptyStateCard,
  ErrorStateCard,
} from '../components/MotionPrimitives';

interface DashboardPageProps {
  onNavigate: (page: AppPageId) => void;
}

function getCategoryIcon(category: string): React.ComponentType<{ className?: string }> {
  const key = category.toLowerCase();
  if (key.includes('food') || key.includes('dining')) return Utensils;
  if (key.includes('transport') || key.includes('travel')) return key.includes('travel') ? Plane : Car;
  if (key.includes('shop') || key.includes('grocer')) return ShoppingBag;
  if (key.includes('rent') || key.includes('home')) return Home;
  if (key.includes('bill') || key.includes('util')) return Receipt;
  if (key.includes('edu')) return BookOpen;
  if (key.includes('health')) return HeartPulse;
  if (key.includes('entertain')) return Film;
  return Wallet;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user } = useAuth();
  const { chartTheme, resolveCategoryColor } = useTheme();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [insights, setInsights] = useState<SavingsRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    Promise.allSettled([
      api.getDashboard(),
      api.getForecast(),
      api.getRecurring(),
      api.getRecommendations(),
    ])
      .then(([dashRes, fcRes, recRes, insRes]) => {
        if (dashRes.status === 'fulfilled') {
          setData(dashRes.value);
          setError(null);
        } else {
          setError(
            dashRes.reason instanceof Error ? dashRes.reason.message : 'Failed to load dashboard.'
          );
        }
        if (fcRes.status === 'fulfilled') setForecast(fcRes.value.forecast);
        if (recRes.status === 'fulfilled') setRecurring(recRes.value.recurring);
        if (insRes.status === 'fulfilled') setInsights(insRes.value.recommendations);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return <ErrorStateCard message={error || 'Unable to load dashboard.'} onRetry={loadAll} />;
  }

  const { kpis } = data;
  const hasTransactions = data.recentTransactions.length > 0;
  const firstName = user?.fullName?.split(' ')[0] || 'there';

  const forecastPreviewSeries =
    forecast && !forecast.insufficientData
      ? forecast.series.slice(-37).map((pt) => ({
          label: pt.date.slice(5),
          actual: pt.actual,
          predicted: pt.predicted,
        }))
      : [];

  return (
    <div className="space-y-6">
      {/* Animated Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <p className="text-xs font-medium text-blue-600 dark:text-sky-400">
            {getTimeGreeting()}, {firstName} · {formatMonthLabel(data.monthKey)}
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white">
            Overview & Cash Flow
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('add-income')}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap"
          >
            Add Income
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-500/12 hover:bg-violet-500/20 border border-violet-500/25 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Ask AI Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('forecast')}
            className="px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-sky-300 bg-blue-500/12 hover:bg-blue-500/20 border border-blue-500/25 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap"
          >
            View 30-Day Forecast
          </button>
        </div>
      </motion.div>

      {/* Hero Animated Total Balance Glass Card */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="glass-balance-hero rounded-3xl p-6 sm:p-7 text-white relative overflow-hidden"
      >
        <div className="grid lg:grid-cols-12 gap-6 items-center relative z-10">
          <div className="lg:col-span-6 space-y-2">
            <div className="text-xs font-medium text-sky-200/80 uppercase tracking-wider">
              Net Available Balance
            </div>
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white">
              <AnimatedNumber value={kpis.currentBalance} format={(n) => formatINR(n)} />
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Savings rate this month:{' '}
              <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                {kpis.savingsPercentage}%
              </span>{' '}
              · Today’s spend:{' '}
              <span className="font-mono font-semibold text-white tabular-nums">
                {formatINR(kpis.todaySpending)}
              </span>
            </p>
          </div>

          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-white/[0.08] border border-white/12 backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Monthly Income</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-white">
                <AnimatedNumber value={kpis.monthlyIncome} format={(n) => formatINR(n)} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.08] border border-white/12 backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Monthly Expenses</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-white">
                <AnimatedNumber value={kpis.monthlyExpenses} format={(n) => formatINR(n)} />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.08] border border-white/12 backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Est. End-of-Month</span>
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-sky-200">
                <AnimatedNumber
                  value={data.upcomingPredicted.predictedEndOfMonth}
                  format={(n) => formatINR(n)}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Budget & Forecast Warning Banner */}
      {(data.budgetWarnings.length > 0 || data.upcomingPredicted.overrunWarning) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          role="status"
          className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/12 border border-amber-500/30 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-sm">
              <div className="font-semibold text-amber-950 dark:text-amber-200">
                Budget & Forecast Alerts
              </div>
              {data.upcomingPredicted.overrunWarning && (
                <p className="text-amber-900 dark:text-amber-100/90 text-xs sm:text-sm">
                  {data.upcomingPredicted.overrunWarning}
                </p>
              )}
              {data.budgetWarnings.slice(0, 2).map((w) => (
                <p key={w.categoryName} className="text-amber-800 dark:text-amber-200/80 text-xs">
                  {w.message}
                </p>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('budgets')}
            className="px-3.5 py-2 text-xs font-semibold text-amber-950 dark:text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 rounded-xl transition-colors whitespace-nowrap self-start md:self-center"
          >
            Review Budgets
          </button>
        </motion.div>
      )}

      {/* Staggered Frosted KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Monthly Savings</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {kpis.savingsPercentage}% rate
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-mono font-bold text-slate-900 dark:text-white">
            <AnimatedNumber
              value={kpis.monthlyIncome - kpis.monthlyExpenses}
              format={(n) => formatINR(n)}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Income minus expenses this month
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Monthly Budget</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                kpis.budgetUsedPercent >= 100
                  ? 'text-rose-600 dark:text-rose-400'
                  : kpis.budgetUsedPercent >= 80
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {kpis.budgetUsedPercent}% used
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-mono font-bold text-slate-900 dark:text-white">
            <AnimatedNumber value={kpis.monthlyBudget} format={(n) => formatINR(n)} />
          </div>
          <div className="mt-3">
            <AnimatedProgressBar
              percent={kpis.budgetUsedPercent}
              colorClass={
                kpis.budgetUsedPercent >= 100
                  ? 'bg-gradient-to-r from-rose-500 to-red-500'
                  : kpis.budgetUsedPercent >= 80
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-400'
              }
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.16 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Remaining Budget</div>
          <div className="mt-2.5 text-2xl font-mono font-bold text-slate-900 dark:text-white">
            <AnimatedNumber value={kpis.remainingBudget} format={(n) => formatINR(n)} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {kpis.remainingBudget > 0 ? 'Safe spending headroom left' : 'Monthly cap reached'}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Next 7-Day Forecast</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-sky-400" />
          </div>
          <div className="mt-2.5 text-2xl font-mono font-bold text-slate-900 dark:text-white">
            {data.upcomingPredicted.next7DaysSeries.length === 0 &&
            data.upcomingPredicted.next7DaysTotal === 0 ? (
              'Pending'
            ) : (
              <AnimatedNumber
                value={data.upcomingPredicted.next7DaysTotal}
                format={(n) => formatINR(n)}
              />
            )}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Month-End Est.: {formatINR(data.upcomingPredicted.predictedEndOfMonth)}
          </div>
        </motion.div>
      </div>

      {/* Empty State if newly registered user has zero transactions */}
      {!hasTransactions ? (
        <EmptyStateCard
          icon={Sparkles}
          title="Start building your financial picture"
          description="Log your first income or expense, or scan a paper receipt with Tesseract OCR to populate live charts and train your personal 30-day spending forecast."
          action={
            <>
              <button
                type="button"
                onClick={() => onNavigate('add-expense')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Log First Expense</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('receipt-scanner')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl"
              >
                <Camera className="w-4 h-4" />
                <span>Scan a Receipt</span>
              </button>
            </>
          }
        />
      ) : (
        <>
          {/* Row 1 Charts: Daily Spending Trend + Category Donut Breakdown */}
          <div className="grid lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                    Daily Spending Trend (Last 14 Days)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Actual daily expenses persisted in SQL
                  </p>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailySpending} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dailySpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartTheme.accentBlue} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={chartTheme.accentBlue} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [formatINR(Number(val ?? 0)), 'Spent']}
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke={chartTheme.accentBlue}
                      strokeWidth={2.4}
                      fill="url(#dailySpendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                    Spending Categories
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Current month distribution</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('analytics')}
                  className="text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                >
                  Deep Dive
                </button>
              </div>
              <div className="grid sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-6 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categorySpending}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {data.categorySpending.map((entry) => (
                          <Cell key={entry.category} fill={resolveCategoryColor(entry.color)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => formatINR(Number(val ?? 0))}
                        contentStyle={chartTheme.tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="sm:col-span-6 space-y-2.5 text-xs">
                  {data.categorySpending.slice(0, 6).map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: resolveCategoryColor(cat.color) }}
                          aria-hidden="true"
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">{cat.category}</span>
                      </div>
                      <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums shrink-0">
                        {formatINR(cat.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Row 2: Income vs Expense Chart + 30-Day Spending Forecast Mini-Graph */}
          <div className="grid lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl">
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Income vs. Expenses
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Monthly cash flow comparison</p>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlyComparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      formatter={(val: unknown, name: unknown) => [formatINR(Number(val ?? 0)), String(name ?? '')]}
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                    />
                    <Bar dataKey="income" name="Income" fill={chartTheme.incomeBar} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" name="Expenses" fill={chartTheme.expenseBar} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                    30-Day Predictive Spending Outlook
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Seasonal Holt-Winters forecast trained on your daily history
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('forecast')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  <span>Full Model</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {forecastPreviewSeries.length > 0 ? (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastPreviewSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.tickFill }} minTickGap={16} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip
                        formatter={(val: unknown, name: unknown) => [formatINR(Number(val ?? 0)), String(name ?? '')]}
                        contentStyle={chartTheme.tooltipStyle}
                        labelStyle={chartTheme.tooltipLabelStyle}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Actual Spend"
                        stroke={chartTheme.actualStroke}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        name="30-Day Forecast"
                        stroke={chartTheme.accentBlue}
                        strokeWidth={2.2}
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 text-center px-6">
                  Log at least 14 days of expenses to train your live 30-day predictive trajectory.
                </div>
              )}
            </section>
          </div>

          {/* Row 3: AI Financial Insights + Upcoming Bills + Recent Transactions */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* AI Financial Insights & Upcoming Bills */}
            <div className="lg:col-span-5 min-w-0 space-y-6">
              <section className="p-6 glass-card rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                        AI Financial Insights
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Derived from your real SQL history
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('recommendations')}
                    className="text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                  >
                    All Insights
                  </button>
                </div>

                {insights.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Continue recording transactions to unlock personalized month-over-month savings insights.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.slice(0, 2).map((ins) => (
                      <div
                        key={ins.id}
                        className="p-3.5 rounded-xl bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-900/8 dark:border-white/8"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-blue-600 dark:text-sky-400">
                            {ins.category} · {ins.metricLabel}
                          </span>
                          {ins.potentialMonthlySavings > 0 && (
                            <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              +{formatINR(ins.potentialMonthlySavings)}/mo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                          {ins.title}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ins.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p-6 glass-card rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                      Upcoming Recurring Bills
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('recurring')}
                    className="text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                  >
                    Manage
                  </button>
                </div>

                {recurring.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No recurring bills tracked yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recurring.slice(0, 3).map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between gap-3 py-2 border-b border-slate-900/8 dark:border-white/8 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {bill.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Due {formatDateShort(bill.nextExpectedDate)} · {bill.categoryName}
                          </div>
                        </div>
                        <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                          {formatINR(bill.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Recent Transactions with Clean Icons */}
            <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                    Recent Transactions
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Latest verified entries from your ledger
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('transactions')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-slate-900/8 dark:divide-white/8">
                {data.recentTransactions.map((tx) => {
                  const CatIcon = getCategoryIcon(tx.categoryName);
                  return (
                    <div
                      key={tx.id}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.03] -mx-2 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            tx.type === 'income'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-blue-500/12 text-blue-600 dark:text-sky-400'
                          }`}
                        >
                          <CatIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {tx.merchant || tx.description}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <span>{tx.categoryName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{tx.paymentMethod}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{formatDateShort(tx.transactionDate)}</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-sm font-mono font-semibold whitespace-nowrap tabular-nums shrink-0 ${
                          tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatINR(tx.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
