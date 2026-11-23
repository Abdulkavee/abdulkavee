import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AnimatedProgressBar } from '../components/MotionPrimitives';
import type { Budget, Category } from '../types/finance';
import { currentMonthKey, formatINR, formatMonthLabel } from '../utils/format';

export function BudgetPlannerPage() {
  const { pushToast } = useToast();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('OVERALL');
  const [amountLimit, setAmountLimit] = useState('22000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([api.getBudgets(monthKey), api.getCategories()]);
      setBudgets(bRes.budgets);
      setCategories(cRes.categories.filter((c) => c.type === 'expense'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budgets.');
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void fetchBudgets();
  }, [fetchBudgets]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const limit = Number(amountLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      setError('Budget limit must be greater than ₹0.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveBudget({
        categoryName: selectedCategory,
        monthKey,
        amountLimit: limit,
      });
      setBudgets(res.budgets);
      const msg = `Saved ${selectedCategory === 'OVERALL' ? 'Overall Monthly Budget' : selectedCategory} limit of ${formatINR(limit)} for ${formatMonthLabel(monthKey)}.`;
      setMessage(msg);
      pushToast({ title: 'Budget saved', description: msg, variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save budget.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingBudget) return;
    await api.deleteBudget(deletingBudget.id);
    pushToast({ title: 'Budget removed', description: `${deletingBudget.categoryName} budget deleted.`, variant: 'info' });
    setDeletingBudget(null);
    await fetchBudgets();
  };

  const overall = budgets.find((b) => b.categoryName === 'OVERALL');
  const categoryBudgets = budgets.filter((b) => b.categoryName !== 'OVERALL');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Budget Planner</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Configure monthly and category spending caps. Warnings trigger automatically at 80% utilization and alerts at 100%.
          </p>
        </div>
        <div>
          <label htmlFor="budget-month" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Billing Month
          </label>
          <input
            id="budget-month"
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="px-3 py-2 glass-input rounded-xl text-sm font-mono"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="p-3.5 rounded-2xl bg-emerald-500/12 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Overall Monthly Budget Card */}
      {overall && (
        <section className="p-6 glass-card rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Overall Monthly Budget · {formatMonthLabel(monthKey)}
              </div>
              <div className="mt-1 text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {formatINR(overall.spent)}{' '}
                <span className="text-base font-normal text-slate-500 dark:text-slate-400">
                  / {formatINR(overall.amountLimit)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-sm font-semibold ${
                  overall.status === 'exceeded'
                    ? 'text-rose-600 dark:text-rose-400'
                    : overall.status === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {overall.status === 'exceeded'
                  ? 'Exceeded Limit'
                  : overall.status === 'warning'
                    ? '80% Warning Threshold'
                    : 'On Track'}
                {' · '}
                <span className="font-mono tabular-nums">{overall.percentUsed}%</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                Remaining: {formatINR(overall.remaining)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <AnimatedProgressBar
              heightClass="h-2.5"
              percent={overall.percentUsed}
              colorClass={
                overall.status === 'exceeded'
                  ? 'bg-gradient-to-r from-rose-500 to-red-500'
                  : overall.status === 'warning'
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-400'
              }
            />
          </div>
        </section>
      )}

      {/* Create / Update Budget Form */}
      <form onSubmit={handleSave} className="p-5 glass-card rounded-2xl grid sm:grid-cols-12 gap-4 items-end">
        <div className="sm:col-span-5">
          <label htmlFor="budget-cat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Budget Scope
          </label>
          <select
            id="budget-cat"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
          >
            <option value="OVERALL">Overall Monthly Budget</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="budget-amt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Monthly Limit (INR ₹)
          </label>
          <input
            id="budget-amt"
            type="number"
            min="100"
            step="100"
            required
            value={amountLimit}
            onChange={(e) => setAmountLimit(e.target.value)}
            className="w-full px-3 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
          />
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25 disabled:opacity-60 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Saving…' : 'Set Budget'}</span>
          </button>
        </div>
      </form>

      {/* Category Budget Progress Cards */}
      <section className="space-y-3">
        <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
          Category Budgets ({categoryBudgets.length})
        </h3>

        {loading ? (
          <div className="p-6 glass-card rounded-2xl text-sm text-slate-500 dark:text-slate-400">
            Loading budgets…
          </div>
        ) : categoryBudgets.length === 0 ? (
          <div className="p-6 glass-card rounded-2xl text-sm text-slate-500 dark:text-slate-400">
            No category budgets configured for {formatMonthLabel(monthKey)} yet. Add one above to monitor limits.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {categoryBudgets.map((b) => (
              <div key={b.id} className="p-5 glass-card glass-card-hover rounded-2xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white text-sm">{b.categoryName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      Spent {formatINR(b.spent)} of {formatINR(b.amountLimit)} · Remaining {formatINR(b.remaining)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold font-mono tabular-nums ${
                        b.status === 'exceeded'
                          ? 'text-rose-600 dark:text-rose-400'
                          : b.status === 'warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {b.percentUsed}%
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${b.categoryName} budget`}
                      onClick={() => setDeletingBudget(b)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatedProgressBar
                  percent={b.percentUsed}
                  colorClass={
                    b.status === 'exceeded'
                      ? 'bg-gradient-to-r from-rose-500 to-red-500'
                      : b.status === 'warning'
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }
                />

                {(b.status === 'warning' || b.status === 'exceeded') && (
                  <div
                    className={`flex items-center gap-1.5 text-xs font-medium ${
                      b.status === 'exceeded'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {b.status === 'exceeded'
                        ? `Exceeded by ${formatINR(b.spent - b.amountLimit)}`
                        : `Approaching limit (${b.percentUsed}% used)`}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deletingBudget)}
        title="Delete category budget?"
        description={
          deletingBudget
            ? `Remove the ${formatINR(deletingBudget.amountLimit)} monthly cap for ${deletingBudget.categoryName}?`
            : ''
        }
        confirmLabel="Remove Budget"
        destructive
        onCancel={() => setDeletingBudget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
