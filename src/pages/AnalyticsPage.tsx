import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { SpendingAnomaly } from '../types/finance';
import { formatDateShort, formatINR, formatMonthLabel } from '../utils/format';
import { ErrorStateCard } from '../components/MotionPrimitives';

export function AnalyticsPage() {
  const { chartTheme, resolveCategoryColor } = useTheme();
  const [anomalies, setAnomalies] = useState<SpendingAnomaly[]>([]);
  const [dayOfWeekSpend, setDayOfWeekSpend] = useState<Array<{ day: string; total: number; average: number }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ method: string; amount: number }>>([]);
  const [categoryAllTime, setCategoryAllTime] = useState<Array<{ category: string; amount: number; color: string }>>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<Array<{ month: string; income: number; expense: number; savings: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = () => {
    setLoading(true);
    api
      .getAnalytics()
      .then((res) => {
        setAnomalies(res.anomalies);
        setDayOfWeekSpend(res.dayOfWeekSpend);
        setPaymentMethods(res.paymentMethods);
        setCategoryAllTime(res.categoryAllTime);
        setMonthlyTrend(res.monthlyTrend);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-44 rounded-2xl glass-card glass-skeleton" />
        <div className="h-80 rounded-2xl glass-card glass-skeleton" />
      </div>
    );
  }
  if (error) {
    return <ErrorStateCard message={error} onRetry={loadAnalytics} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
          Analytics & Spending Anomaly Detection
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Statistical outlier monitoring (Modified Z-Score / MAD + IQR fences) alongside category, weekday, and payment-channel distributions.
        </p>
      </div>

      {/* Anomaly Detection Section */}
      <section className="p-6 glass-card rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Smart Spending Anomaly Detection
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Flags unusual spending activity relative to your historical category median—never classifies transactions as fraud automatically.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            {anomalies.length} alert{anomalies.length === 1 ? '' : 's'} detected
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-900/10 dark:border-white/10 text-sm text-slate-600 dark:text-slate-400">
            No unusual spending spikes detected across your recorded history.
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((a) => (
              <div
                key={`${a.transactionId}-${a.anomalyType}`}
                className="p-4 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-900/10 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      a.severity === 'High'
                        ? 'text-rose-500 dark:text-rose-400'
                        : a.severity === 'Medium'
                          ? 'text-amber-500 dark:text-amber-400'
                          : 'text-blue-500 dark:text-sky-400'
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold">
                      <span
                        className={
                          a.severity === 'High'
                            ? 'text-rose-600 dark:text-rose-400'
                            : a.severity === 'Medium'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-blue-600 dark:text-sky-400'
                        }
                      >
                        {a.severity} Severity · {a.label}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-400 font-normal">
                        {formatDateShort(a.date)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-400 font-normal">{a.category}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {a.merchant} — {a.description}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{a.reason}</p>
                  </div>
                </div>
                <div className="text-left md:text-right shrink-0 font-mono tabular-nums">
                  <div className="text-base font-bold text-slate-900 dark:text-white">{formatINR(a.amount)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Baseline median: {formatINR(a.baselineMedian)} · Z={a.zScore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Monthly Income vs Expense vs Savings Line Chart */}
      <section className="p-6 glass-card rounded-2xl min-w-0">
        <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
          Monthly Financial Trajectory
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Income, expenses, and net monthly savings across recorded months
        </p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={monthlyTrend.map((m) => ({ ...m, label: formatMonthLabel(m.month) }))}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
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
              <Line type="monotone" dataKey="income" name="Income" stroke={chartTheme.incomeBar} strokeWidth={2.3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="expense" name="Expenses" stroke={chartTheme.actualStroke} strokeWidth={2.3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="savings" name="Net Savings" stroke={chartTheme.accentBlue} strokeWidth={2.1} strokeDasharray="4 4" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Category All-Time & Day-of-Week */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Category Spending Comparison
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Cumulative expenses across categories</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryAllTime} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                  tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                />
                <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11, fill: chartTheme.tickFill }} />
                <Tooltip
                  formatter={(val: unknown) => formatINR(Number(val ?? 0))}
                  contentStyle={chartTheme.tooltipStyle}
                />
                <Bar dataKey="amount" name="Total Spent" radius={[0, 6, 6, 0]}>
                  {categoryAllTime.map((c) => (
                    <Cell key={c.category} fill={resolveCategoryColor(c.color)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl space-y-6">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Average Spend by Weekday
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Weekly seasonality pattern used by the forecasting engine
            </p>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekSpend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: unknown) => [formatINR(Number(val ?? 0)), 'Avg Transaction']}
                    contentStyle={chartTheme.tooltipStyle}
                  />
                  <Bar dataKey="average" fill={chartTheme.accentBlue} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-900/10 dark:border-white/10">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Payment Method Breakdown
            </h4>
            <div className="space-y-1.5 text-xs">
              {paymentMethods.map((p) => (
                <div key={p.method} className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{p.method}</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatINR(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
