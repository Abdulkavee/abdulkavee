import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, CheckCircle2, Plus, Repeat, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AnimatedNumber } from '../components/MotionPrimitives';
import type { DetectedRecurringPattern, RecurringExpense } from '../types/finance';
import { formatDateShort, formatINR } from '../utils/format';

export function RecurringPage() {
  const { pushToast } = useToast();
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [detected, setDetected] = useState<DetectedRecurringPattern[]>([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [categoryName, setCategoryName] = useState('Bills');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextExpectedDate, setNextExpectedDate] = useState('2026-12-05');
  const [paymentMethod] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [itemToDelete, setItemToDelete] = useState<RecurringExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getRecurring();
      setRecurring(res.recurring);
      setDetected(res.detectedPatterns);
      setTotalMonthly(res.totalMonthlyCommitments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recurring expenses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || Number(amount) <= 0) return;
    setSaving(true);
    try {
      const trimmedTitle = title.trim();
      await api.createRecurring({
        title: trimmedTitle,
        categoryName,
        amount: Number(amount),
        frequency,
        nextExpectedDate,
        paymentMethod,
        notes,
      });
      setTitle('');
      setAmount('');
      setNotes('');
      pushToast({
        title: 'Recurring Bill Tracked',
        description: `Added "${trimmedTitle}" (${formatINR(Number(amount))}/${frequency}).`,
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save recurring bill.';
      setError(msg);
      pushToast({ title: 'Could Not Save Bill', description: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTrackDetected = async (p: DetectedRecurringPattern) => {
    try {
      await api.createRecurring({
        title: p.title,
        categoryName: p.categoryName,
        amount: p.estimatedAmount,
        frequency: p.frequency,
        nextExpectedDate: p.nextExpectedDate,
        paymentMethod: 'UPI',
        isAutoDetected: true,
        notes: `Auto-detected across ${p.occurrences} historical transactions`,
      });
      pushToast({
        title: 'Pattern Added to Tracker',
        description: `Now monitoring "${p.title}" (${formatINR(p.estimatedAmount)}).`,
        variant: 'success',
      });
      await loadData();
    } catch (err) {
      pushToast({
        title: 'Could Not Track Pattern',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      const name = itemToDelete.title;
      await api.deleteRecurring(itemToDelete.id);
      setItemToDelete(null);
      pushToast({
        title: 'Commitment Removed',
        description: `"${name}" is no longer tracked.`,
        variant: 'info',
      });
      await loadData();
    } catch (err) {
      pushToast({
        title: 'Remove Failed',
        description: err instanceof Error ? err.message : 'Could not delete recurring item.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
            Recurring Expense Tracker
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Monitor rent, utility bills, broadband, subscriptions, and college fees. Tracking only—LedgerIQ never initiates automatic payments.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="px-5 py-4 glass-card rounded-2xl shrink-0"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Monthly Recurring Commitments
          </div>
          <div className="mt-1 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedNumber value={totalMonthly} format={formatINR} />
          </div>
        </motion.div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Add Recurring Expense Form */}
      <form
        onSubmit={handleAdd}
        className="p-5 glass-card rounded-2xl grid sm:grid-cols-12 gap-3 items-end"
      >
        <div className="sm:col-span-3">
          <label
            htmlFor="rec-title"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Bill / Subscription Name
          </label>
          <input
            id="rec-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Internet Bill, Gym Fee"
            className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="rec-cat"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Category
          </label>
          <select
            id="rec-cat"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
          >
            {['Rent', 'Bills', 'Entertainment', 'Education', 'Healthcare', 'Transport', 'Other'].map(
              (c) => (
                <option key={c} value={c} className="bg-white dark:bg-slate-900">
                  {c}
                </option>
              )
            )}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="rec-amount"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Est. Amount (₹)
          </label>
          <input
            id="rec-amount"
            type="number"
            required
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="999"
            className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="rec-freq"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Cadence
          </label>
          <select
            id="rec-freq"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
          >
            <option value="monthly" className="bg-white dark:bg-slate-900">Monthly</option>
            <option value="weekly" className="bg-white dark:bg-slate-900">Weekly</option>
            <option value="quarterly" className="bg-white dark:bg-slate-900">Quarterly</option>
            <option value="yearly" className="bg-white dark:bg-slate-900">Yearly</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="rec-date"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Next Due Date
          </label>
          <input
            id="rec-date"
            type="date"
            value={nextExpectedDate}
            onChange={(e) => setNextExpectedDate(e.target.value)}
            className="w-full px-3 py-2.5 glass-input rounded-xl text-xs font-mono"
          />
        </div>
        <div className="sm:col-span-1">
          <button
            type="submit"
            disabled={saving}
            aria-label="Add recurring expense"
            className="w-full h-[42px] inline-flex items-center justify-center px-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Tracked Recurring Table */}
      <section className="glass-card rounded-2xl overflow-hidden min-w-0">
        <div className="px-6 py-4 border-b border-slate-200/70 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Tracked Recurring Commitments ({recurring.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/[0.03] dark:bg-white/[0.03] border-b border-slate-200/70 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Commitment</th>
                <th className="py-3 px-4">Category & Cadence</th>
                <th className="py-3 px-4">Next Expected Date</th>
                <th className="py-3 px-4 text-right">Estimated Amount</th>
                <th className="py-3 px-4 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Loading recurring commitments…
                  </td>
                </tr>
              ) : recurring.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No recurring commitments tracked yet.
                  </td>
                </tr>
              ) : (
                recurring.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{r.title}</div>
                      {r.notes && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{r.notes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 capitalize">
                      {r.categoryName} · {r.frequency}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateShort(r.nextExpectedDate)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      {formatINR(r.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${r.title}`}
                        onClick={() => setItemToDelete(r)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Auto-Detected Patterns */}
      <section className="p-6 glass-card rounded-2xl space-y-4">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Auto-Detected Recurring Patterns from History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Identified automatically where the same merchant appears across multiple billing cycles with consistent amounts.
            </p>
          </div>
        </div>

        {detected.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No new recurring patterns detected across your ledger yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {detected.map((p) => (
              <div
                key={p.signature}
                className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.03] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                    {p.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                    {p.categoryName} · {p.frequency} · {p.occurrences} cycles · Next est.{' '}
                    {formatDateShort(p.nextExpectedDate)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold text-slate-900 dark:text-white text-sm tabular-nums">
                    {formatINR(p.estimatedAmount)}
                  </div>
                  {p.alreadyTracked ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Tracked
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleTrackDetected(p)}
                      className="mt-1 text-xs font-semibold text-blue-600 dark:text-sky-400 hover:underline"
                    >
                      + Track Bill
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(itemToDelete)}
        title="Remove Recurring Commitment?"
        description={
          itemToDelete
            ? `Stop tracking "${itemToDelete.title}" (${formatINR(itemToDelete.amount)}/${itemToDelete.frequency})? Past transactions remain intact.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
