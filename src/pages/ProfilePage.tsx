import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  History,
  LogIn,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { api } from '../services/api';
import type { Category } from '../types/finance';

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { pushToast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [monthlyIncomeTarget, setMonthlyIncomeTarget] = useState(
    String(user?.monthlyIncomeTarget || 30000)
  );
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState(
    String(user?.monthlyBudgetLimit || 20000)
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense');

  const [authActivities, setAuthActivities] = useState<
    Array<{
      id: string;
      email: string;
      fullName: string;
      eventType: 'signup' | 'login' | 'logout' | 'password_reset';
      authProvider: string;
      source: 'supabase' | 'local';
      supabaseSynced: boolean;
      createdAt: string;
    }>
  >([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Confirmation dialogs
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const loadCats = async () => {
    const res = await api.getCategories();
    setCategories(res.categories);
  };

  const loadAuthActivity = async () => {
    setLoadingActivity(true);
    try {
      const res = await api.getAuthActivity();
      setAuthActivities(res.activities);
    } catch {
      // ignore quietly
    } finally {
      setLoadingActivity(false);
    }
  };

  useEffect(() => {
    void loadCats();
    void loadAuthActivity();
  }, []);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setMonthlyIncomeTarget(String(user.monthlyIncomeTarget));
      setMonthlyBudgetLimit(String(user.monthlyBudgetLimit));
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.updateProfile({
        fullName: fullName.trim(),
        monthlyIncomeTarget: Number(monthlyIncomeTarget),
        monthlyBudgetLimit: Number(monthlyBudgetLimit),
      });
      await refreshUser();
      setMessage('Profile settings and default monthly budget updated.');
      pushToast({
        title: 'Settings Saved',
        description: 'Your profile and monthly budget defaults are updated.',
        variant: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      setError(msg);
      pushToast({ title: 'Update Failed', description: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCatName.trim().length < 2) return;
    setError(null);
    try {
      const name = newCatName.trim();
      await api.createCategory({ name, type: newCatType });
      setNewCatName('');
      pushToast({
        title: 'Category Added',
        description: `Created custom ${newCatType} category "${name}".`,
        variant: 'success',
      });
      await loadCats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add custom category.';
      setError(msg);
      pushToast({ title: 'Could Not Add Category', description: msg, variant: 'error' });
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    try {
      await api.deleteCategory(cat.id);
      pushToast({
        title: 'Category Removed',
        description: `Deleted custom category "${cat.name}".`,
        variant: 'info',
      });
      await loadCats();
    } catch (err) {
      pushToast({
        title: 'Remove Failed',
        description: err instanceof Error ? err.message : 'Could not delete category.',
        variant: 'error',
      });
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    setMessage(null);
    try {
      await api.resetDemoData();
      setShowResetConfirm(false);
      setMessage('Demo 90-day dataset has been restored to its clean baseline.');
      pushToast({
        title: 'Demo Dataset Restored',
        description: 'All 90-day transactions, budgets, goals, and receipts were reset cleanly.',
        variant: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reset demo data.';
      setError(msg);
      pushToast({ title: 'Reset Failed', description: msg, variant: 'error' });
    } finally {
      setResetting(false);
    }
  };

  const handleSyncSupabase = async () => {
    setSyncingSupabase(true);
    setError(null);
    try {
      const res = await api.syncSupabase();
      const s = res.summary;
      pushToast({
        title: 'Synced to Supabase',
        description: `Uploaded ${s.transactionsSynced} transactions, ${s.budgetsSynced} budgets, ${s.recurringSynced} bills, and ${s.goalsSynced} goals.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not sync ledger to Supabase.';
      pushToast({ title: 'Supabase Sync Pending Setup', description: msg, variant: 'warning' });
    } finally {
      setSyncingSupabase(false);
    }
  };

  const handleThemeSelect = (nextMode: 'dark' | 'light') => {
    setTheme(nextMode);
    pushToast({
      title: nextMode === 'dark' ? 'Obsidian Dark Mode Active' : 'Frosted Light Mode Active',
      description: 'Theme preference saved automatically.',
      variant: 'info',
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
          Profile & Settings
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your account details, interface theme, custom categories, and workspace preferences.
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
      {message && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Account Profile Form */}
      <form onSubmit={handleSaveProfile} className="p-6 glass-card rounded-2xl space-y-5">
        <div className="flex items-center gap-4 pb-5 border-b border-slate-200/70 dark:border-white/10">
          <img
            src="/src/assets/images/avatar_student_profile_1795172228443.jpg"
            alt={user?.fullName || 'User avatar'}
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-blue-500/30 border border-white/20"
          />
          <div>
            <div className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              {user?.fullName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {user?.email} · Currency: INR (₹)
              {user?.isDemoAccount ? ' · Demo Dataset Account' : ''}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="prof-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="prof-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="prof-income"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Expected Monthly Income (₹)
            </label>
            <input
              id="prof-income"
              type="number"
              min="1000"
              value={monthlyIncomeTarget}
              onChange={(e) => setMonthlyIncomeTarget(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="prof-budget"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Default Monthly Budget (₹)
            </label>
            <input
              id="prof-budget"
              type="number"
              min="500"
              value={monthlyBudgetLimit}
              onChange={(e) => setMonthlyBudgetLimit(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Appearance & Theme Selector */}
      <section className="p-6 glass-card rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Appearance & Glass Surface
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch instantaneously between Obsidian Dark and Frosted Light modes across charts and cards.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleThemeSelect('dark')}
            aria-pressed={theme === 'dark'}
            className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
              theme === 'dark'
                ? 'border-blue-500/60 bg-blue-500/12 ring-1 ring-blue-500/30'
                : 'border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] hover:bg-white/70 dark:hover:bg-white/[0.06]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-sky-400 border border-white/15 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Obsidian Dark
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Deep charcoal glass with midnight ambient depth
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleThemeSelect('light')}
            aria-pressed={theme === 'light'}
            className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
              theme === 'light'
                ? 'border-blue-500/60 bg-blue-500/12 ring-1 ring-blue-500/30'
                : 'border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] hover:bg-white/70 dark:hover:bg-white/[0.06]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-white text-amber-500 border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Frosted Light
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Airy alabaster glass with high-contrast ink
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Custom Categories Manager */}
      <section className="p-6 glass-card rounded-2xl space-y-4">
        <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
          Manage Categories
        </h3>
        <form onSubmit={handleCreateCategory} className="flex flex-wrap gap-2.5">
          <input
            aria-label="New category name"
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Custom category name (e.g. Pet Care, Hostel Mess)"
            className="flex-1 min-w-[200px] px-3.5 py-2.5 glass-input rounded-xl text-sm"
          />
          <select
            aria-label="New category type"
            value={newCatType}
            onChange={(e) => setNewCatType(e.target.value as 'expense' | 'income')}
            className="px-3.5 py-2.5 glass-input rounded-xl text-sm"
          >
            <option value="expense" className="bg-white dark:bg-slate-900">Expense</option>
            <option value="income" className="bg-white dark:bg-slate-900">Income</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Category</span>
          </button>
        </form>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                <span className="text-slate-400"> · {c.type}</span>
              </div>
              {!c.isDefault ? (
                <button
                  type="button"
                  aria-label={`Delete custom category ${c.name}`}
                  onClick={() => void handleDeleteCategory(c)}
                  className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">Default</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Sign Up, Sign In & Sign Out Activity History */}
      <section className="p-6 glass-card rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Account Sign-In & Session History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Every Sign Up, Sign In, and Sign Out event recorded for your account in Supabase &amp; your local ledger.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loadingActivity}
            onClick={() => void loadAuthActivity()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-900/5 dark:bg-white/10 hover:bg-slate-900/10 dark:hover:bg-white/15 border border-slate-200/70 dark:border-white/10 rounded-xl transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingActivity ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {authActivities.length === 0 ? (
          <div className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] text-xs text-slate-500 dark:text-slate-400">
            No authentication events recorded yet for this account.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-white/10 rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden bg-white/40 dark:bg-white/[0.02]">
            {authActivities.slice(0, 10).map((item) => {
              const eventLabel =
                item.eventType === 'signup'
                  ? 'Sign Up'
                  : item.eventType === 'login'
                    ? 'Sign In'
                    : item.eventType === 'logout'
                      ? 'Sign Out'
                      : 'Password Reset';
              const EventIcon =
                item.eventType === 'signup'
                  ? UserPlus
                  : item.eventType === 'logout'
                    ? LogOut
                    : item.eventType === 'login'
                      ? LogIn
                      : ShieldCheck;
              const toneClass =
                item.eventType === 'signup'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/12'
                  : item.eventType === 'logout'
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-500/12'
                    : 'text-blue-600 dark:text-sky-400 bg-blue-500/12';

              const parsedDate = new Date(
                item.createdAt.includes('T') ? item.createdAt : `${item.createdAt}Z`
              );
              const formattedTime = Number.isNaN(parsedDate.getTime())
                ? item.createdAt
                : parsedDate.toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

              return (
                <div
                  key={item.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}
                    >
                      <EventIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {eventLabel} · {item.email}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {item.supabaseSynced ? 'Recorded in Supabase DB' : 'Recorded in local DB'}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {formattedTime}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Demo Reset & Capacitor Readiness */}
      <div className="grid md:grid-cols-2 gap-4">
        {user?.isDemoAccount && (
          <div className="p-5 glass-card rounded-2xl space-y-3">
            <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
              Reset Demo Dataset
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Restore the fictional 90-day student dataset (income, expenses, recurring bills, OCR receipts, and budgets) to a fresh state before a presentation or viva.
            </p>
            <button
              type="button"
              disabled={resetting}
              onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-900/5 dark:bg-white/10 hover:bg-slate-900/10 dark:hover:bg-white/15 border border-slate-200/70 dark:border-white/10 rounded-xl transition-colors disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{resetting ? 'Restoring…' : 'Restore Clean Demo Data'}</span>
            </button>
          </div>
        )}

        <div className="p-5 glass-card rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-900 dark:text-white">
            <CloudUpload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Supabase Cloud Sync</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Sync your personal transactions, budgets, recurring bills, and savings goals to your Supabase PostgreSQL project once your schema and server secrets are configured.
          </p>
          <button
            type="button"
            disabled={syncingSupabase}
            onClick={() => void handleSyncSupabase()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>{syncingSupabase ? 'Syncing…' : 'Sync Ledger to Supabase'}</span>
          </button>
        </div>

        <div className="p-5 glass-card rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-900 dark:text-white">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-sky-400" />
            <span>Capacitor Android Conversion Ready</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            This frontend uses relative Vite builds, environment-driven API base URLs (
            <code className="font-mono text-slate-800 dark:text-slate-200">VITE_API_BASE_URL</code>),
            touch-friendly mobile navigation, and native camera file capture (
            <code className="font-mono text-slate-800 dark:text-slate-200">capture=&quot;environment&quot;</code>)
            so it can be wrapped into an Android APK via Capacitor without refactoring.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="Restore Clean Demo Dataset?"
        description="This will replace any edits you made in the demo account with the fresh 90-day student finance dataset."
        confirmLabel="Restore Demo Data"
        busy={resetting}
        onConfirm={handleResetDemo}
        onCancel={() => setShowResetConfirm(false)}
      />

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign Out of LedgerIQ?"
        description="You can sign back into the demo account or your personal ledger anytime."
        confirmLabel="Sign Out"
        destructive
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
