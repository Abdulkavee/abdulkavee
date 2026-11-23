import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

interface AuthPageProps {
  mode: 'login' | 'register';
  onSwitchMode: (mode: 'login' | 'register') => void;
  onBackLanding: () => void;
  onSuccess: () => void;
}

export function AuthPages({
  mode,
  onSwitchMode,
  onBackLanding,
  onSuccess,
}: AuthPageProps) {
  const { login, register, forgotPassword, resendConfirmation } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { pushToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [monthlyIncomeTarget, setMonthlyIncomeTarget] = useState('30000');
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState('18000');
  const [showPassword, setShowPassword] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const resetMessages = () => {
    setError(null);
    setStatusMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    const trimmedEmail = email.trim().toLowerCase();

    if (forgotMode) {
      setSubmitting(true);
      try {
        const msg = await forgotPassword(trimmedEmail);
        setStatusMessage(msg);
        pushToast({
          title: 'Password Reset Sent',
          description: 'Check your email inbox for your reset link.',
          variant: 'success',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send reset email.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter your password.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(trimmedEmail, password);
        pushToast({
          title: 'Welcome back',
          description: 'Signed in securely to your financial ledger.',
          variant: 'success',
        });
        onSuccess();
      } else {
        const result = await register({
          fullName: fullName.trim(),
          email: trimmedEmail,
          password,
          monthlyIncomeTarget: Number(monthlyIncomeTarget) || 30000,
          monthlyBudgetLimit: Number(monthlyBudgetLimit) || 18000,
        });

        if (result.requiresEmailConfirmation) {
          setPendingConfirmEmail(result.email);
          setStatusMessage(
            result.message ||
              'Verification email sent! Please check your inbox and click the confirmation link before signing in.'
          );
          pushToast({
            title: 'Verify Your Email',
            description: `Confirmation link sent to ${result.email}.`,
            variant: 'info',
          });
          return;
        }

        pushToast({
          title: 'Account created',
          description: 'Your private LedgerIQ workspace is ready.',
          variant: 'success',
        });
        onSuccess();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
      if (msg.toLowerCase().includes('confirm your email')) {
        setPendingConfirmEmail(trimmedEmail);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    const target = pendingConfirmEmail || email.trim().toLowerCase();
    if (!target) return;
    setResending(true);
    setError(null);
    try {
      const msg = await resendConfirmation(target);
      setStatusMessage(msg);
      pushToast({ title: 'Confirmation Email Sent', description: msg, variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend confirmation email.');
    } finally {
      setResending(false);
    }
  };

  const handleDemoLogin = async () => {
    resetMessages();
    setPendingConfirmEmail(null);
    setSubmitting(true);
    try {
      await login('aarav.sharma@demo.fin', 'Demo@2026');
      pushToast({
        title: 'Demo workspace ready',
        description: 'Loaded 90-day fictional dataset for Aarav Sharma.',
        variant: 'info',
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign into demo account.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchAuthTab = (next: 'login' | 'register') => {
    resetMessages();
    setForgotMode(false);
    setPendingConfirmEmail(null);
    setConfirmPassword('');
    onSwitchMode(next);
  };

  return (
    <div className="min-h-screen app-canvas grid lg:grid-cols-12 text-slate-900 dark:text-slate-100">
      {/* Left Brand Glass Panel */}
      <div className="hidden lg:flex lg:col-span-5 glass-balance-hero text-white p-12 flex-col justify-between m-4 rounded-3xl">
        <div>
          <button
            type="button"
            onClick={onBackLanding}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <div className="mt-12 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 text-white font-display font-bold flex items-center justify-center shadow-lg shadow-blue-500/30">
              LQ
            </div>
            <span className="text-2xl font-display font-bold tracking-tight">LedgerIQ</span>
          </div>
          <h1 className="mt-6 text-3xl font-display font-bold leading-tight text-balance">
            Track Smarter. Predict Spending. Save Better.
          </h1>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-md">
            Sign up or sign in with Email Authentication backed by Supabase Auth & server-verified sessions so your receipts, transactions, and forecasts stay strictly private.
          </p>
          <div className="mt-8 space-y-2.5 text-xs text-slate-200/90">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Supabase Email Authentication & per-user Row Level Security</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Email verification & password recovery built in</span>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/15 text-xs text-slate-300 space-y-1.5">
          <div>OCR Receipt Parsing · 30-Day Time-Series Forecast</div>
          <div>ML Categorization · Anomaly Detection · Gemini RAG Assistant</div>
        </div>
      </div>

      {/* Right Frosted Form Panel */}
      <div className="lg:col-span-7 flex flex-col justify-center px-6 py-10 sm:px-12 relative">
        <div className="absolute top-6 right-6">
          <button
            type="button"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
            className="p-2.5 rounded-xl glass-card text-slate-600 dark:text-slate-200 hover:border-blue-400/50 transition-all"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>

        <motion.div
          key={forgotMode ? 'forgot' : mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md w-full mx-auto glass-card rounded-3xl p-7 sm:p-8"
        >
          <div className="lg:hidden mb-5">
            <button
              type="button"
              onClick={onBackLanding}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>LedgerIQ Home</span>
            </button>
          </div>

          {/* Login / Sign Up Segmented Control */}
          {!forgotMode && (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-2xl bg-slate-900/5 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => switchAuthTab('login')}
                className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => switchAuthTab('register')}
                className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                  mode === 'register'
                    ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            {forgotMode
              ? 'Reset your password'
              : mode === 'login'
                ? 'Sign in to LedgerIQ'
                : 'Create your account'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {forgotMode
              ? 'Enter the email address associated with your account to receive a Supabase reset link.'
              : mode === 'login'
                ? 'Access your personal dashboard, receipts, and spending forecasts.'
                : 'Register with your email to create your private LedgerIQ workspace.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-600 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="mt-5 p-4 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
            </div>
          )}

          {pendingConfirmEmail && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={resending}
                onClick={() => void handleResendConfirmation()}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-sky-400 hover:underline disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                <span>{resending ? 'Resending…' : 'Resend confirmation email'}</span>
              </button>
              <button
                type="button"
                onClick={() => switchAuthTab('login')}
                className="font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Back to Sign In
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!forgotMode && mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Verma"
                    className="w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                />
              </div>
            </div>

            {!forgotMode && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setForgotMode(true);
                      }}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 glass-input rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {!forgotMode && mode === 'register' && (
              <>
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label
                      htmlFor="auth-income"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Monthly Income (₹)
                    </label>
                    <input
                      id="auth-income"
                      type="number"
                      min="1000"
                      step="500"
                      value={monthlyIncomeTarget}
                      onChange={(e) => setMonthlyIncomeTarget(e.target.value)}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auth-budget"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Monthly Budget (₹)
                    </label>
                    <input
                      id="auth-budget"
                      type="number"
                      min="500"
                      step="500"
                      value={monthlyBudgetLimit}
                      onChange={(e) => setMonthlyBudgetLimit(e.target.value)}
                      className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono tabular-nums"
                    />
                  </div>
                </div>
              </>
            )}

            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition-all disabled:opacity-60"
            >
              {submitting
                ? forgotMode
                  ? 'Sending reset link…'
                  : mode === 'login'
                    ? 'Signing in…'
                    : 'Creating account…'
                : forgotMode
                  ? 'Send Reset Link'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
            </motion.button>
          </form>

          {forgotMode ? (
            <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setForgotMode(false);
                }}
                className="font-semibold text-blue-600 dark:text-sky-400 hover:underline"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              {mode === 'login' && (
                <div className="mt-5 p-4 rounded-2xl bg-blue-500/8 dark:bg-white/[0.04] border border-blue-500/20 dark:border-white/10">
                  <div className="text-xs font-semibold text-slate-800 dark:text-white">
                    Instant Demo Account (90-Day Fictional Dataset)
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Sign in with sample student data to explore OCR receipts, 30-day forecasting, anomaly detection, and RAG chat immediately.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDemoLogin()}
                    disabled={submitting}
                    className="mt-3 w-full py-2 px-3 text-xs font-semibold text-blue-700 dark:text-sky-300 bg-blue-500/12 hover:bg-blue-500/20 rounded-xl transition-colors"
                  >
                    Sign In with Demo Dataset
                  </button>
                </div>
              )}

              <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                {mode === 'login' ? (
                  <>
                    New to LedgerIQ?{' '}
                    <button
                      type="button"
                      onClick={() => switchAuthTab('register')}
                      className="font-semibold text-blue-600 dark:text-sky-400 hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchAuthTab('login')}
                      className="font-semibold text-blue-600 dark:text-sky-400 hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
