import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import type { ForecastResult } from '../types/finance';
import { formatINR } from '../utils/format';
import { AnimatedNumber, ErrorStateCard } from '../components/MotionPrimitives';

export function ForecastPage() {
  const { chartTheme } = useTheme();
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForecast = () => {
    setLoading(true);
    api
      .getForecast()
      .then((res) => {
        setForecast(res.forecast);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to compute forecast.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadForecast();
  }, []);

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl glass-card glass-skeleton" />
          ))}
        </div>
        <div className="h-96 rounded-2xl glass-card glass-skeleton" />
      </div>
    );
  }

  if (error || !forecast) {
    return <ErrorStateCard message={error || 'Forecast unavailable.'} onRetry={loadForecast} />;
  }

  const chartData = forecast.series.map((pt) => ({
    ...pt,
    label: pt.date.slice(5),
    bandRange: pt.lowerBound !== null && pt.upperBound !== null ? [pt.lowerBound, pt.upperBound] : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
          30-Day Predictive Expense Analytics
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Time-series forecasting trained directly on your historical daily expenses with held-out backtesting validation.
        </p>
      </div>

      {/* Honest Insufficient-Data Gate */}
      {forecast.insufficientData ? (
        <div className="p-8 glass-card rounded-2xl max-w-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Insufficient Historical Data for Forecasting
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {forecast.insufficientReason}
              </p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                LedgerIQ never fabricates predictions without sufficient training observations. Continue logging daily expenses—or explore the clearly labelled Demo Dataset account—to inspect full 30-day forecasts and MAE/RMSE validation.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Overrun Warning Banner */}
          {forecast.overrunWarning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="p-4 rounded-2xl bg-rose-500/12 border border-rose-500/30 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200"
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Projected Monthly Budget Overrun</div>
                <p className="mt-0.5 text-xs sm:text-sm">{forecast.overrunWarning}</p>
              </div>
            </motion.div>
          )}

          {/* Key Forecast KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Next 7 Days Forecast</div>
              <div className="mt-2 text-2xl font-mono font-bold text-slate-900 dark:text-white">
                <AnimatedNumber value={forecast.next7DaysTotal} format={(n) => formatINR(n)} />
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Predicted short-term outflow</div>
            </div>

            <div className="p-5 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Next 30 Days Forecast</div>
              <div className="mt-2 text-2xl font-mono font-bold text-blue-600 dark:text-sky-400">
                <AnimatedNumber value={forecast.next30DaysTotal} format={(n) => formatINR(n)} />
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Rolling 30-day projection</div>
            </div>

            <div className="p-5 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Predicted End-of-Month</div>
              <div
                className={`mt-2 text-2xl font-mono font-bold ${
                  forecast.projectedOverrun > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <AnimatedNumber value={forecast.predictedEndOfMonthTotal} format={(n) => formatINR(n)} />
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                MTD: {formatINR(forecast.currentMonthSpent)} · Cap: {formatINR(forecast.monthlyBudget)}
              </div>
            </div>

            <div className="p-5 glass-card glass-card-hover rounded-2xl">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Held-Out Model Error</span>
                <TrendingUp className="w-4 h-4 text-violet-500 dark:text-violet-400" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                ±{formatINR(forecast.evaluation.mae)}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                MAE/day · RMSE {formatINR(forecast.evaluation.rmse)} ({forecast.evaluation.testDays}d test)
              </div>
            </div>
          </div>

          {/* Main Forecast Chart: Historical vs Backtest vs Future + Uncertainty Band */}
          <section className="p-6 glass-card rounded-2xl min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                  Actual vs. Predicted Daily Spending (with 95% Uncertainty Range)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Model: {forecast.modelName} · Trained on {forecast.historicalDaysCount} continuous daily observations
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-slate-900 dark:bg-white inline-block" /> Actual
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-blue-600 dark:bg-sky-400 inline-block" /> Predicted / Backtest
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-2.5 bg-blue-400/30 border border-blue-400/50 inline-block rounded-xs" /> Uncertainty Range
                </span>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tickFill }} minTickGap={18} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    formatter={(val: unknown, name: unknown) => {
                      if (Array.isArray(val)) {
                        return [`${formatINR(Number(val[0]))} – ${formatINR(Number(val[1]))}`, 'Uncertainty Range'];
                      }
                      return [formatINR(Number(val ?? 0)), String(name ?? '')];
                    }}
                    contentStyle={chartTheme.tooltipStyle}
                    labelStyle={chartTheme.tooltipLabelStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="bandRange"
                    name="Uncertainty Range"
                    fill={chartTheme.uncertaintyFill}
                    stroke="none"
                    fillOpacity={1}
                    connectNulls={false}
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
                    name="Predicted Spend"
                    stroke={chartTheme.accentBlue}
                    strokeWidth={2.3}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Backtesting Evaluation & Category Forecasts */}
          <div className="grid lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl space-y-4">
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Held-Out Model Validation Metrics
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                To prevent overfitting, the last <strong>{forecast.evaluation.testDays} days</strong> of your history were held out during training, then predicted out-of-sample and compared against actual spend.
              </p>

              <dl className="divide-y divide-slate-900/8 dark:divide-white/10 text-sm">
                <div className="py-2.5 flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Mean Absolute Error (MAE)</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatINR(forecast.evaluation.mae, true)} / day
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Root Mean Squared Error (RMSE)</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatINR(forecast.evaluation.rmse, true)} / day
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">Mean Naive Baseline MAE</dt>
                  <dd className="font-mono font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                    {formatINR(forecast.evaluation.baselineMae, true)} / day
                  </dd>
                </div>
                {forecast.evaluation.mape !== null && (
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-600 dark:text-slate-400">Active-Day MAPE</dt>
                    <dd className="font-mono font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                      {forecast.evaluation.mape}%
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white mb-1">
                Category-Wise 30-Day Projections
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Displayed only for categories with at least 3 historical observations
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-900/10 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3 text-right">Samples</th>
                      <th className="py-2 pr-3 text-right">Historical Monthly Avg</th>
                      <th className="py-2 text-right">Predicted Next 30 Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/8 dark:divide-white/8">
                    {forecast.categoryForecasts.map((cf) => (
                      <tr key={cf.category}>
                        <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white">{cf.category}</td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {cf.sampleCount}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                          {formatINR(cf.historicalMonthlyAvg)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-blue-600 dark:text-sky-400 tabular-nums">
                          {formatINR(cf.predictedNext30Days)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
