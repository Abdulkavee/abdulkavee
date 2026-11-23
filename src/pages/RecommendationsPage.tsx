import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Lightbulb, Plus, Sparkles, Target, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  EmptyStateCard,
  ErrorStateCard,
} from '../components/MotionPrimitives';
import type { SavingsGoal, SavingsRecommendation } from '../types/finance';
import { formatDateShort, formatINR } from '../utils/format';

export function RecommendationsPage() {
  const { pushToast } = useToast();
  const [recommendations, setRecommendations] = useState<SavingsRecommendation[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [targetMonthlySavings, setTargetMonthlySavings] = useState(0);
  const [discretionaryTotal, setDiscretionaryTotal] = useState(0);
  const [essentialTotal, setEssentialTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New goal form
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetDate, setTargetDate] = useState('2027-06-30');
  const [savingGoal, setSavingGoal] = useState(false);

  // Delete confirmation
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getRecommendations();
      setRecommendations(res.recommendations);
      setGoals(res.goals);
      setTargetMonthlySavings(res.suggestedMonthlySavingsTarget);
      setDiscretionaryTotal(res.discretionaryTotal);
      setEssentialTotal(res.essentialTotal);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || Number(targetAmount) <= 0) return;
    setSavingGoal(true);
    try {
      const trimmedTitle = title.trim();
      await api.createGoal({
        title: trimmedTitle,
        targetAmount: Number(targetAmount),
        currentAmount: Number(currentAmount) || 0,
        targetDate,
      });
      setTitle('');
      setTargetAmount('');
      setCurrentAmount('0');
      pushToast({
        title: 'Savings Goal Created',
        description: `Tracking "${trimmedTitle}" toward ${formatINR(Number(targetAmount))}.`,
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create savings goal.';
      setError(msg);
      pushToast({ title: 'Could Not Create Goal', description: msg, variant: 'error' });
    } finally {
      setSavingGoal(false);
    }
  };

  const handleAddContribution = async (goal: SavingsGoal, delta: number) => {
    try {
      await api.updateGoal(goal.id, { currentAmount: goal.currentAmount + delta });
      pushToast({
        title: 'Contribution Recorded',
        description: `Added ${formatINR(delta)} to "${goal.title}".`,
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      pushToast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Could not update goal balance.',
        variant: 'error',
      });
    }
  };

  const confirmDeleteGoal = async () => {
    if (!goalToDelete) return;
    setDeletingGoal(true);
    try {
      const deletedTitle = goalToDelete.title;
      await api.deleteGoal(goalToDelete.id);
      setGoalToDelete(null);
      pushToast({
        title: 'Savings Goal Removed',
        description: `"${deletedTitle}" has been removed from your goals.`,
        variant: 'info',
      });
      await loadData();
    } catch (err) {
      pushToast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Could not delete savings goal.',
        variant: 'error',
      });
    } finally {
      setDeletingGoal(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl glass-card p-5 space-y-3">
              <div className="h-3 w-36 rounded glass-skeleton" />
              <div className="h-7 w-28 rounded-lg glass-skeleton" />
              <div className="h-3 w-44 rounded glass-skeleton" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-2xl glass-card glass-skeleton" />
      </div>
    );
  }

  if (error && recommendations.length === 0 && goals.length === 0) {
    return <ErrorStateCard message={error} onRetry={() => void loadData()} />;
  }

  const totalSpend = discretionaryTotal + essentialTotal;
  const discretionaryPct = totalSpend > 0 ? Math.round((discretionaryTotal / totalSpend) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
          Smart Savings Recommendations
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Personalized insights computed directly from your month-over-month category changes and discretionary spending share.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Savings Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.03 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Recommended Monthly Saving Target
            </span>
            <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            <AnimatedNumber value={targetMonthlySavings} format={formatINR} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Calibrated to your actual surplus + 12% discretionary trim
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Discretionary Spend (This Month)
            </span>
            <span className="text-xs font-mono text-violet-600 dark:text-violet-400 tabular-nums">
              {discretionaryPct}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={discretionaryTotal} format={formatINR} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Food, Shopping, Entertainment, Travel, Other
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.13 }}
          className="p-5 glass-card glass-card-hover rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Essential Spend (This Month)
            </span>
            <span className="text-xs font-mono text-sky-600 dark:text-sky-400 tabular-nums">
              {totalSpend > 0 ? 100 - discretionaryPct : 0}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={essentialTotal} format={formatINR} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Rent, Bills, Transport, Education, Healthcare
          </div>
        </motion.div>
      </div>

      {/* Recommendations List */}
      <section className="p-6 glass-card rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center">
            <Lightbulb className="w-4 h-4" />
          </div>
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Data-Backed Insights
          </h3>
        </div>
        {recommendations.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add more transactions across two months to unlock comparative savings recommendations.
          </p>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-white/8">
            {recommendations.map((rec, idx) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: idx * 0.04 }}
                className="py-4 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-blue-600 dark:text-sky-400">
                    {rec.category} · {rec.metricLabel}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {rec.title}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    {rec.detail}
                  </p>
                </div>
                {rec.potentialMonthlySavings > 0 && (
                  <div className="text-left sm:text-right shrink-0 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Est. Opportunity
                    </div>
                    <div className="text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{formatINR(rec.potentialMonthlySavings)}/mo
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Savings Goals Tracker */}
      <section className="p-6 glass-card rounded-2xl space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Target className="w-4 h-4" />
          </div>
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Savings Goals Progress
          </h3>
        </div>

        <form
          onSubmit={handleAddGoal}
          className="grid sm:grid-cols-12 gap-3 items-end pb-5 border-b border-slate-200/70 dark:border-white/8"
        >
          <div className="sm:col-span-4">
            <label
              htmlFor="goal-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Goal Name
            </label>
            <input
              id="goal-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Emergency Fund"
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="goal-target"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Target (₹)
            </label>
            <input
              id="goal-target"
              type="number"
              required
              min="500"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="50000"
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="goal-current"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Saved So Far (₹)
            </label>
            <input
              id="goal-current"
              type="number"
              min="0"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="goal-date"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Target Date
            </label>
            <input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-2.5 glass-input rounded-xl text-xs font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingGoal}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{savingGoal ? 'Adding…' : 'Add Goal'}</span>
            </button>
          </div>
        </form>

        {goals.length === 0 ? (
          <EmptyStateCard
            icon={Target}
            title="No Savings Goals Yet"
            description="Create a target above—such as an emergency fund, laptop upgrade, or semester travel fund—to track your progress."
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map((g, idx) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                className="p-4 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.03] hover:bg-white/80 dark:hover:bg-white/[0.06] transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                      {g.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Target by {formatDateShort(g.targetDate)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete goal ${g.title}`}
                    onClick={() => setGoalToDelete(g)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex justify-between text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatINR(g.currentAmount)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    of {formatINR(g.targetAmount)} ({g.progressPercent}%)
                  </span>
                </div>

                <AnimatedProgressBar
                  percent={g.progressPercent}
                  colorClass="bg-gradient-to-r from-emerald-500 to-teal-400"
                />

                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void handleAddContribution(g, 1000)}
                    className="flex-1 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all active:scale-[0.98]"
                  >
                    + ₹1,000
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddContribution(g, 5000)}
                    className="flex-1 py-1.5 text-xs font-medium text-blue-700 dark:text-sky-300 bg-blue-500/12 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all active:scale-[0.98]"
                  >
                    + ₹5,000
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(goalToDelete)}
        title="Delete Savings Goal?"
        description={
          goalToDelete
            ? `Remove "${goalToDelete.title}" (${formatINR(goalToDelete.currentAmount)} saved so far)? This will not delete any of your recorded transactions.`
            : ''
        }
        confirmLabel="Delete Goal"
        destructive
        busy={deletingGoal}
        onConfirm={confirmDeleteGoal}
        onCancel={() => setGoalToDelete(null)}
      />
    </div>
  );
}
