import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Download, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { AnimatedNumber, AnimatedProgressBar, ErrorStateCard } from '../components/MotionPrimitives';
import type { Transaction } from '../types/finance';
import { formatDateShort, formatINR, todayIsoDate } from '../utils/format';

type ReportTab = 'monthly' | 'daily' | 'weekly' | 'yearly' | 'category' | 'savings';

export function ReportsPage() {
  const { chartTheme } = useTheme();
  const { pushToast } = useToast();

  const defaultStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [activeTab, setActiveTab] = useState<ReportTab>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    totals: { income: number; expense: number; savings: number; savingsRate: number; transactionCount: number };
    daily: Array<{ date: string; amount: number }>;
    weekly: Array<{ week: string; amount: number }>;
    monthly: Array<{ month: string; income: number; expense: number; savings: number }>;
    yearly: Array<{ year: string; income: number; expense: number; savings: number }>;
    byCategory: Array<{ category: string; amount: number; share: number }>;
    predictedMonthlySpending: number;
    next30DaysForecast: number;
    transactions: Transaction[];
  } | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getReports(startDate, endDate);
      setReport(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compile financial report.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleDownloadCsv = async () => {
    try {
      const blob = await api.downloadCsvBlob(startDate, endDate);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ledgeriq_report_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushToast({
        title: 'CSV Export Started',
        description: `Downloading transactions from ${formatDateShort(startDate)} to ${formatDateShort(endDate)}.`,
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'CSV Export Failed',
        description: err instanceof Error ? err.message : 'Could not export CSV report.',
        variant: 'error',
      });
    }
  };

  const handleDownloadPdf = () => {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('LedgerIQ Financial Report Summary', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date Range: ${startDate} to ${endDate}  |  Generated: ${todayIsoDate()}`, 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [['Metric', 'Value (INR)']],
      body: [
        ['Total Income', `Rs. ${report.totals.income.toLocaleString('en-IN')}`],
        ['Total Expenses', `Rs. ${report.totals.expense.toLocaleString('en-IN')}`],
        ['Net Savings', `Rs. ${report.totals.savings.toLocaleString('en-IN')} (${report.totals.savingsRate}%)`],
        ['Predicted End-of-Month Spend', `Rs. ${report.predictedMonthlySpending.toLocaleString('en-IN')}`],
        ['Next 30-Day Forecast', `Rs. ${report.next30DaysForecast.toLocaleString('en-IN')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [11, 19, 43] },
    });

    const afterSummaryY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 85;
    doc.setFontSize(12);
    doc.setTextColor(15);
    doc.text('Category Breakdown', 14, afterSummaryY + 12);

    autoTable(doc, {
      startY: afterSummaryY + 16,
      head: [['Category', 'Total Spent (INR)', 'Share (%)']],
      body: report.byCategory.map((c) => [
        c.category,
        `Rs. ${c.amount.toLocaleString('en-IN')}`,
        `${c.share}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [29, 78, 216] },
    });

    const afterCatY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140;
    doc.setFontSize(12);
    doc.text('Recent Transactions (Top 25)', 14, afterCatY + 12);
    autoTable(doc, {
      startY: afterCatY + 16,
      head: [['Date', 'Type', 'Category', 'Merchant / Description', 'Amount (INR)']],
      body: report.transactions.slice(0, 25).map((t) => [
        t.transactionDate,
        t.type,
        t.categoryName,
        (t.merchant || t.description).slice(0, 32),
        `Rs. ${t.amount.toLocaleString('en-IN')}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [11, 19, 43] },
    });

    doc.save(`ledgeriq_summary_${startDate}_to_${endDate}.pdf`);
    pushToast({
      title: 'PDF Summary Generated',
      description: `Saved ledgeriq_summary_${startDate}_to_${endDate}.pdf.`,
      variant: 'success',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Reports & Exports
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Generate date-filtered daily, weekly, monthly, yearly, category, savings, and forecast summaries in CSV or PDF format.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!report}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 glass-card hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl whitespace-nowrap transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!report}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 whitespace-nowrap transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download PDF Summary</span>
          </button>
        </div>
      </div>

      {/* Date Range Controls + Report Tabs */}
      <div className="p-4 glass-card rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label
              htmlFor="rep-start"
              className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              From Date
            </label>
            <input
              id="rep-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 glass-input rounded-xl text-xs font-mono"
            />
          </div>
          <div>
            <label
              htmlFor="rep-end"
              className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              To Date
            </label>
            <input
              id="rep-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 glass-input rounded-xl text-xs font-mono"
            />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Report granularity"
          className="flex flex-wrap gap-1 p-1 bg-slate-900/5 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 rounded-xl"
        >
          {(
            [
              ['monthly', 'Monthly'],
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
              ['yearly', 'Yearly'],
              ['category', 'Category'],
              ['savings', 'Savings'],
            ] as Array<[ReportTab, string]>
          ).map(([id, label]) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="report-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-white/14 shadow-sm border border-slate-200/80 dark:border-white/15"
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <ErrorStateCard message={error} onRetry={() => void loadReport()} />
      ) : loading || !report ? (
        <div className="space-y-5" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl glass-card p-4 space-y-2.5">
                <div className="h-3 w-20 rounded glass-skeleton" />
                <div className="h-6 w-24 rounded-lg glass-skeleton" />
              </div>
            ))}
          </div>
          <div className="h-80 rounded-2xl glass-card glass-skeleton" />
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs text-slate-500 dark:text-slate-400">Income</div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                <AnimatedNumber value={report.totals.income} format={formatINR} />
              </div>
            </div>
            <div className="p-4 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs text-slate-500 dark:text-slate-400">Expenses</div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                <AnimatedNumber value={report.totals.expense} format={formatINR} />
              </div>
            </div>
            <div className="p-4 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs text-slate-500 dark:text-slate-400">Net Savings</div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-blue-600 dark:text-sky-400 tabular-nums">
                <AnimatedNumber value={report.totals.savings} format={formatINR} />
              </div>
            </div>
            <div className="p-4 glass-card glass-card-hover rounded-2xl">
              <div className="text-xs text-slate-500 dark:text-slate-400">Predicted Monthly Spend</div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
                <AnimatedNumber value={report.predictedMonthlySpending} format={formatINR} />
              </div>
            </div>
            <div className="p-4 glass-card glass-card-hover rounded-2xl col-span-2 lg:col-span-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Records Included</div>
              <div className="mt-1.5 text-lg font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                <AnimatedNumber value={report.totals.transactionCount} format={(n) => String(n)} />
              </div>
            </div>
          </div>

          {/* Active Report Visualization */}
          <section className="p-6 glass-card rounded-2xl min-w-0">
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white mb-4 capitalize">
              {activeTab === 'category'
                ? 'Category-Wise Expenditure Report'
                : activeTab === 'savings'
                  ? 'Monthly Savings History'
                  : `${activeTab} Financial Summary`}
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'daily' ? (
                  <BarChart data={report.daily.slice(-30)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: chartTheme.tickFill }}
                      tickFormatter={(d) => String(d).slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      tickFormatter={(v) => `₹${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(v: unknown) => [formatINR(Number(v ?? 0)), 'Expense']}
                    />
                    <Bar dataKey="amount" fill={chartTheme.accentBlue} radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : activeTab === 'weekly' ? (
                  <BarChart data={report.weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10, fill: chartTheme.tickFill }}
                      tickFormatter={(w) => String(w).replace('Week of ', '')}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      tickFormatter={(v) => `₹${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(v: unknown) => [formatINR(Number(v ?? 0)), 'Weekly Expense']}
                    />
                    <Bar dataKey="amount" fill={chartTheme.expenseBar} radius={[5, 5, 0, 0]} />
                  </BarChart>
                ) : activeTab === 'category' ? (
                  <BarChart data={report.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      tickFormatter={(v) => `₹${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(v: unknown) => [formatINR(Number(v ?? 0)), 'Category Spend']}
                    />
                    <Bar dataKey="amount" fill={chartTheme.accentViolet} radius={[5, 5, 0, 0]} />
                  </BarChart>
                ) : activeTab === 'savings' ? (
                  <BarChart data={report.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      tickFormatter={(v) => `₹${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(v: unknown) => [formatINR(Number(v ?? 0)), 'Net Savings']}
                    />
                    <Bar dataKey="savings" fill={chartTheme.incomeBar} radius={[5, 5, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart
                    data={
                      activeTab === 'yearly'
                        ? report.yearly.map((y) => ({ period: y.year, income: y.income, expense: y.expense }))
                        : report.monthly.map((m) => ({ period: m.month, income: m.income, expense: m.expense }))
                    }
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                      tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      labelStyle={chartTheme.tooltipLabelStyle}
                      formatter={(v: unknown, name: unknown) => [formatINR(Number(v ?? 0)), String(name ?? '')]}
                    />
                    <Bar dataKey="income" name="Income" fill={chartTheme.incomeBar} radius={[5, 5, 0, 0]} />
                    <Bar dataKey="expense" name="Expenses" fill={chartTheme.expenseBar} radius={[5, 5, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          {/* Category Breakdown Table */}
          <section className="p-6 glass-card rounded-2xl min-w-0">
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white mb-4">
              Category Summary ({formatDateShort(startDate)} – {formatDateShort(endDate)})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Category</th>
                    <th className="py-2.5 pr-4 w-44 hidden sm:table-cell">Distribution</th>
                    <th className="py-2.5 pr-4 text-right">Amount Spent</th>
                    <th className="py-2.5 text-right">Share of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
                  {report.byCategory.map((c) => (
                    <tr
                      key={c.category}
                      className="hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                        {c.category}
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <AnimatedProgressBar
                          percent={c.share}
                          colorClass="bg-gradient-to-r from-blue-500 to-cyan-400"
                          heightClass="h-1.5"
                        />
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatINR(c.amount)}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {c.share}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
