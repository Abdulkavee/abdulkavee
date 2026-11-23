import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { Category, CategoryPrediction } from '../types/finance';
import { todayIsoDate } from '../utils/format';

const PAYMENT_METHODS = [
  'UPI',
  'Debit Card',
  'Credit Card',
  'Cash',
  'Net Banking',
  'Wallet',
];

interface TransactionFormPageProps {
  mode: 'expense' | 'income';
  onSaved: () => void;
}

export function TransactionFormPage({ mode, onSaved }: TransactionFormPageProps) {
  const { pushToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [categoryName, setCategoryName] = useState(mode === 'income' ? 'Salary' : 'Food');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [transactionDate, setTransactionDate] = useState(todayIsoDate());
  const [prediction, setPrediction] = useState<CategoryPrediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [manualCategoryTouched, setManualCategoryTouched] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setCategoryName(mode === 'income' ? 'Salary' : 'Food');
    setManualCategoryTouched(false);
    setPrediction(null);
    setSuccessMsg(null);
    setError(null);
  }, [mode]);

  useEffect(() => {
    api
      .getCategories()
      .then((res) => {
        const filtered = res.categories.filter((c) => c.type === mode);
        setCategories(filtered);
        if (filtered.length > 0 && !filtered.some((c) => c.name === categoryName)) {
          setCategoryName(filtered[0].name);
        }
      })
      .catch(() => {
        // fallback silently
      });
  }, [mode]);

  useEffect(() => {
    if (mode !== 'expense') return;
    const text = `${merchant} ${description}`.trim();
    if (text.length < 3) {
      setPrediction(null);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPredicting(true);
      api
        .predictCategory(description, merchant)
        .then(({ prediction: pred }) => {
          setPrediction(pred);
          if (!manualCategoryTouched && pred.predictedCategory) {
            setCategoryName(pred.predictedCategory);
          }
        })
        .catch(() => {
          // ignore transient error
        })
        .finally(() => setPredicting(false));
    }, 280);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [description, merchant, mode, manualCategoryTouched]);

  const handleAddCustomCategory = async () => {
    if (newCategoryName.trim().length < 2) return;
    setAddingCategory(true);
    setError(null);
    try {
      const { category } = await api.createCategory({
        name: newCategoryName.trim(),
        type: mode,
      });
      setCategories((prev) => [...prev, category]);
      setCategoryName(category.name);
      setManualCategoryTouched(true);
      setNewCategoryName('');
      pushToast({ title: 'Category added', description: `Created "${category.name}".`, variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category.');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Please enter an amount greater than ₹0.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a short description.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createTransaction({
        type: mode,
        amount: amt,
        categoryName,
        description: description.trim(),
        merchant: merchant.trim(),
        paymentMethod,
        transactionDate,
        predictedCategory: mode === 'expense' ? prediction?.predictedCategory ?? null : null,
        predictionConfidence: mode === 'expense' ? prediction?.confidence ?? null : null,
      });
      const msg =
        mode === 'expense'
          ? `Expense of ₹${amt.toLocaleString('en-IN')} saved under ${categoryName}.${
              prediction && prediction.predictedCategory !== categoryName
                ? ' Your manual correction has been logged for ML retraining.'
                : ''
            }`
          : `Income of ₹${amt.toLocaleString('en-IN')} recorded under ${categoryName}.`;
      setSuccessMsg(msg);
      pushToast({
        title: mode === 'expense' ? 'Expense recorded' : 'Income recorded',
        description: msg,
        variant: 'success',
      });
      setAmount('');
      setMerchant('');
      setDescription('');
      setManualCategoryTouched(false);
      setPrediction(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
          {mode === 'expense' ? 'Add New Expense' : 'Add New Income'}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {mode === 'expense'
            ? 'Enter a merchant or description and our Naive Bayes classifier automatically predicts the most suitable category.'
            : 'Log salary, stipends, freelance payments, or scholarships to keep your savings rate accurate.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-emerald-500/12 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 sm:p-7 glass-card rounded-3xl space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Amount (INR ₹)
            </label>
            <input
              id="tx-amount"
              type="number"
              required
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === 'expense' ? 'e.g. 420' : 'e.g. 28000'}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="tx-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Transaction Date
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tx-merchant" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {mode === 'expense' ? 'Merchant / Vendor' : 'Source / Payer'}
            </label>
            <input
              id="tx-merchant"
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={mode === 'expense' ? 'e.g. Swiggy, Uber, Amazon, BESCOM' : 'e.g. TechNova Labs, Upwork'}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
            />
          </div>

          <div>
            <label htmlFor="tx-payment" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Payment Method
            </label>
            <select
              id="tx-payment"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
            >
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tx-description" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Description
          </label>
          <input
            id="tx-description"
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              mode === 'expense'
                ? 'e.g. Swiggy Biryani Dinner Order, College Fees, Electricity Board Bill'
                : 'e.g. Monthly Internship Stipend'
            }
            className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
          />
        </div>

        {/* Live ML Prediction Banner */}
        {mode === 'expense' && (predicting || prediction) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-sky-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ML Auto-Categorizer ({prediction?.modelVersion || 'Naive Bayes'})</span>
              </div>
              {predicting ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Analyzing description tokens…</p>
              ) : (
                prediction && (
                  <p className="text-sm text-slate-800 dark:text-slate-100">
                    Predicted: <strong>{prediction.predictedCategory}</strong>{' '}
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      · {Math.round(prediction.confidence * 100)}% calibrated confidence
                    </span>
                    {prediction.matchedKeywords.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {' '}· Signals: {prediction.matchedKeywords.join(', ')}
                      </span>
                    )}
                  </p>
                )
              )}
            </div>
            {prediction && categoryName !== prediction.predictedCategory && (
              <button
                type="button"
                onClick={() => {
                  setCategoryName(prediction.predictedCategory);
                  setManualCategoryTouched(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-sky-300 bg-blue-500/15 hover:bg-blue-500/25 rounded-xl whitespace-nowrap"
              >
                Use {prediction.predictedCategory}
              </button>
            )}
          </motion.div>
        )}

        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <div>
            <label htmlFor="tx-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Category
            </label>
            <select
              id="tx-category"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setManualCategoryTouched(true);
              }}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tx-new-cat" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Or create custom {mode} category
            </label>
            <div className="flex gap-2">
              <input
                id="tx-new-cat"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Subscriptions, Pets"
                className="flex-1 px-3 py-2.5 glass-input rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => void handleAddCustomCategory()}
                disabled={addingCategory || newCategoryName.trim().length < 2}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-900/5 dark:bg-white/10 hover:bg-slate-900/10 dark:hover:bg-white/15 rounded-xl disabled:opacity-50 whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-900/10 dark:border-white/10">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {submitting
              ? 'Saving…'
              : mode === 'expense'
                ? 'Save Expense'
                : 'Save Income'}
          </button>
        </div>
      </form>
    </div>
  );
}
