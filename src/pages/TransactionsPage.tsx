import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Category, Transaction } from '../types/finance';
import { formatDateShort, formatINR, formatMonthLabel } from '../utils/format';

const PAYMENT_METHODS = ['ALL', 'UPI', 'Debit Card', 'Credit Card', 'Cash', 'Net Banking', 'Wallet'];

export function TransactionsPage() {
  const { pushToast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState({ count: 0, totalIncome: 0, totalExpense: 0, net: 0 });
  const [monthlySummary, setMonthlySummary] = useState<Array<{ period: string; income: number; expense: number }>>([]);
  const [yearlySummary, setYearlySummary] = useState<Array<{ period: string; income: number; expense: number }>>([]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, catRes] = await Promise.all([
        api.getTransactions({
          search,
          type: typeFilter,
          category: categoryFilter,
          paymentMethod: paymentFilter,
          startDate,
          endDate,
        }),
        api.getCategories(),
      ]);
      setTransactions(txRes.transactions);
      setSummary(txRes.summary);
      setMonthlySummary(txRes.monthlySummary);
      setYearlySummary(txRes.yearlySummary);
      setCategories(catRes.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, categoryFilter, paymentFilter, startDate, endDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const confirmDelete = async () => {
    if (!deletingTx) return;
    try {
      await api.deleteTransaction(deletingTx.id);
      setTransactions((prev) => prev.filter((item) => item.id !== deletingTx.id));
      pushToast({
        title: 'Transaction deleted',
        description: `${deletingTx.merchant || deletingTx.description} removed from ledger.`,
        variant: 'info',
      });
      setDeletingTx(null);
      void fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
      setDeletingTx(null);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    try {
      await api.updateTransaction(editing.id, {
        type: editing.type,
        amount: editing.amount,
        categoryName: editing.categoryName,
        description: editing.description,
        merchant: editing.merchant,
        paymentMethod: editing.paymentMethod,
        transactionDate: editing.transactionDate,
      });
      pushToast({ title: 'Transaction updated', variant: 'success' });
      setEditing(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setEditSaving(false);
    }
  };

  const uniqueCatNames = Array.from(new Set(categories.map((c) => c.name)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
          Transaction History
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Search, filter, edit, or delete your persisted income and expense records.
        </p>
      </div>

      {/* Filter Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Matching Entries</div>
          <div className="mt-1 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {summary.count}
          </div>
        </div>
        <div className="p-4 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Filtered Income</div>
          <div className="mt-1 text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatINR(summary.totalIncome)}
          </div>
        </div>
        <div className="p-4 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Filtered Expenses</div>
          <div className="mt-1 text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatINR(summary.totalExpense)}
          </div>
        </div>
        <div className="p-4 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Net Cash Flow</div>
          <div
            className={`mt-1 text-xl font-mono font-bold tabular-nums ${
              summary.net >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {summary.net >= 0 ? '+' : ''}
            {formatINR(summary.net)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 glass-card rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2 relative">
          <label htmlFor="tx-search" className="sr-only">
            Search transactions
          </label>
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="tx-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant, description, category…"
            className="w-full pl-9 pr-3 py-2 glass-input rounded-xl text-sm"
          />
        </div>

        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 glass-input rounded-xl text-sm"
        >
          <option value="ALL">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </select>

        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 glass-input rounded-xl text-sm"
        >
          <option value="ALL">All Categories</option>
          {uniqueCatNames.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by payment method"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 glass-input rounded-xl text-sm"
        >
          {PAYMENT_METHODS.map((pm) => (
            <option key={pm} value={pm}>
              {pm === 'ALL' ? 'All Payment Methods' : pm}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            aria-label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-1/2 px-2 py-2 glass-input rounded-xl text-xs font-mono"
          />
          <input
            aria-label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-1/2 px-2 py-2 glass-input rounded-xl text-xs font-mono"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Main Transaction Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/[0.03] dark:bg-white/[0.04] border-b border-slate-900/10 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Merchant & Description</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Payment</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/8 dark:divide-white/8 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    Loading transactions…
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    No transactions match your active filters.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.035] transition-colors"
                  >
                    <td className="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {formatDateShort(tx.transactionDate)}
                    </td>
                    <td className="py-3 px-4 min-w-[200px]">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {tx.merchant ? `${tx.merchant} — ${tx.description}` : tx.description}
                      </div>
                      {tx.receiptId && (
                        <div className="text-xs text-blue-600 dark:text-sky-400 mt-0.5">
                          Verified OCR Receipt #{tx.receiptId}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {tx.categoryName}
                      <span className="text-slate-400 dark:text-slate-500">
                        {' '}· {tx.type === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.paymentMethod}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatINR(tx.amount)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${tx.description}`}
                          onClick={() => setEditing({ ...tx })}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${tx.description}`}
                          onClick={() => setDeletingTx(tx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly & Yearly Summaries */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="p-5 glass-card rounded-2xl">
          <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3">
            Monthly Summary
          </h3>
          <div className="space-y-2 text-xs">
            {monthlySummary.map((m) => (
              <div
                key={m.period}
                className="flex items-center justify-between py-2 border-b border-slate-900/8 dark:border-white/8 last:border-0"
              >
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatMonthLabel(m.period)}
                </span>
                <div className="flex gap-4 font-mono tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{formatINR(m.income)}</span>
                  <span className="text-slate-900 dark:text-white">-{formatINR(m.expense)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 glass-card rounded-2xl">
          <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white mb-3">
            Yearly Summary
          </h3>
          <div className="space-y-2 text-xs">
            {yearlySummary.map((y) => (
              <div
                key={y.period}
                className="flex items-center justify-between py-2 border-b border-slate-900/8 dark:border-white/8 last:border-0"
              >
                <span className="font-medium text-slate-700 dark:text-slate-300">Year {y.period}</span>
                <div className="flex gap-4 font-mono tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{formatINR(y.income)}</span>
                  <span className="text-slate-900 dark:text-white">-{formatINR(y.expense)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Glass Edit Modal */}
      <AnimatePresence>
        {editing && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit Transaction"
            className="fixed inset-0 z-[75] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditing(null)}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="relative z-10 glass-popover rounded-2xl max-w-lg w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
                  Edit Transaction
                </h3>
                <button
                  type="button"
                  aria-label="Close edit modal"
                  onClick={() => setEditing(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleEditSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-amount" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Amount (₹)
                    </label>
                    <input
                      id="edit-amount"
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={editing.amount}
                      onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Date
                    </label>
                    <input
                      id="edit-date"
                      type="date"
                      required
                      value={editing.transactionDate}
                      onChange={(e) => setEditing({ ...editing, transactionDate: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-merchant" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Merchant
                  </label>
                  <input
                    id="edit-merchant"
                    type="text"
                    value={editing.merchant}
                    onChange={(e) => setEditing({ ...editing, merchant: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="edit-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description
                  </label>
                  <input
                    id="edit-desc"
                    type="text"
                    required
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-cat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      id="edit-cat"
                      value={editing.categoryName}
                      onChange={(e) => setEditing({ ...editing, categoryName: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                    >
                      {categories
                        .filter((c) => c.type === editing.type)
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-pm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Payment Method
                    </label>
                    <select
                      id="edit-pm"
                      value={editing.paymentMethod}
                      onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                    >
                      {PAYMENT_METHODS.filter((p) => p !== 'ALL').map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-900/5 dark:bg-white/10 hover:bg-slate-900/10 dark:hover:bg-white/15 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl disabled:opacity-60"
                  >
                    {editSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deletingTx)}
        title="Delete transaction?"
        description={
          deletingTx
            ? `Permanently remove "${deletingTx.merchant || deletingTx.description}" (${formatINR(deletingTx.amount)}) from your ledger?`
            : ''
        }
        confirmLabel="Delete Transaction"
        destructive
        onCancel={() => setDeletingTx(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
