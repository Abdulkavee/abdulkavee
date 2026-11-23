import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Moon,
  ShieldCheck,
  Sliders,
  Sun,
  TrendingUp,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface LandingPageProps {
  onGoLogin: () => void;
  onGoRegister: () => void;
  onTryDemo: () => Promise<void>;
  demoLoading: boolean;
}

export function LandingPage({
  onGoLogin,
  onGoRegister,
  onTryDemo,
  demoLoading,
}: LandingPageProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen app-canvas text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Frosted Glass Top Bar */}
      <header className="sticky top-0 z-30 glass-header">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <a
            href="#top"
            className="flex items-center gap-2.5 text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-blue-500/25">
              LQ
            </span>
            <span>LedgerIQ</span>
          </a>

          <nav
            aria-label="Landing Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#ocr-engine" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              OCR Engine
            </a>
            <a href="#forecasting" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Forecasting
            </a>
            <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-900/[0.04] dark:bg-white/[0.07] border border-slate-900/10 dark:border-white/10 transition-all active:scale-95"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
            <button
              type="button"
              onClick={onGoLogin}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25 transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-6 flex flex-col justify-center"
          >
            <p className="text-sm font-semibold text-blue-600 dark:text-sky-400 mb-3">
              Automated Expense Tracker with OCR Receipt Parsing & Predictive Analytics
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.35rem] font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08] text-balance">
              Track Smarter. Predict Spending. Save Better.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              LedgerIQ unites local Tesseract OCR receipt parsing, backtested 30-day time-series forecasting, adaptive ML categorization, and a private SQL-grounded Gemini assistant in a refined fintech workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onGoRegister}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-blue-600/30 transition-all whitespace-nowrap"
              >
                <span>Create Free Account</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void onTryDemo()}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 glass-card hover:border-blue-400/50 rounded-xl transition-all whitespace-nowrap disabled:opacity-60"
              >
                <span>{demoLoading ? 'Opening Demo Workspace…' : 'Explore Live Demo Account'}</span>
              </motion.button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-900/10 dark:border-white/10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Local SQL Database Persistence</span>
              <span aria-hidden="true">·</span>
              <span>Offline Tesseract OCR</span>
              <span aria-hidden="true">·</span>
              <span>Evaluated MAE & RMSE Backtesting</span>
              <span aria-hidden="true">·</span>
              <span>Capacitor Mobile Ready</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.52, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-6 flex"
          >
            <div className="w-full rounded-3xl overflow-hidden glass-card p-2">
              <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-950">
                <img
                  src="/src/assets/images/hero_fintech_desk_1795172231049.jpg"
                  alt="LedgerIQ fintech workspace displaying expense analytics charts alongside a paper retail receipt"
                  referrerPolicy="no-referrer"
                  className="w-full h-full min-h-[290px] object-cover"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Frosted Key Capabilities Strip */}
      <section className="border-y border-slate-900/8 dark:border-white/8 bg-white/45 dark:bg-white/[0.02] backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">12 Tables</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Normalized relational SQL schema with strict user isolation
            </div>
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-blue-600 dark:text-sky-400 tabular-nums">30-Day</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Seasonal time-series forecast with 95% confidence range
            </div>
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-violet-600 dark:text-violet-400 tabular-nums">7 Modules</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              OCR, Forecasting, RAG AI, Naive Bayes, Anomalies, Simulator, Savings
            </div>
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">CSV & PDF</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Date-filtered daily, monthly, and yearly financial exports
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Glass Bento Grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-blue-600 dark:text-sky-400">Core Capabilities</p>
          <h2 className="mt-2 text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Built for accurate financial tracking and transparent machine learning
          </h2>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
            Every analytical output is computed directly from authenticated user transactions—never hardcoded numbers or black-box estimates.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <article className="lg:col-span-2 p-7 rounded-2xl glass-card glass-card-hover">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-sky-400 border border-blue-500/20 flex items-center justify-center mb-4">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              01. 30-Day Predictive Expense Analytics & Budget Overrun Alerts
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Trains a seasonal exponential smoothing model on your daily transaction history, validates accuracy on held-out historical days using real MAE and RMSE error metrics, and warns you ahead of time if end-of-month spending is projected to cross your budget.
            </p>
          </article>

          <article className="p-7 rounded-2xl glass-card glass-card-hover">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              02. Database-Grounded AI Assistant
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Ask natural questions like “How much did I spend on food this month?” or “Compare this month with last month.” Powered by Google Gemini with a SQL retrieval layer and offline fallback.
            </p>
          </article>

          <article className="p-7 rounded-2xl glass-card glass-card-hover">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              03. Smart Anomaly Detection
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Uses leave-one-out Modified Z-Score (MAD) and IQR fences to highlight unusual spending spikes and 48-hour high-value bursts alongside your historical category median.
            </p>
          </article>

          <article className="p-7 rounded-2xl glass-card glass-card-hover">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center mb-4">
              <Sliders className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              04. What-If Budget Simulator
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Adjust category caps and expected income using interactive sliders to immediately visualize simulated monthly savings without modifying real records.
            </p>
          </article>

          <article className="p-7 rounded-2xl glass-card glass-card-hover">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              05. Auto-Categorization & Recurring Detection
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Multinomial Naive Bayes predicts categories from descriptions like Swiggy, Uber, or BESCOM and learns from manual corrections, while recurring bill detection spots monthly rent automatically.
            </p>
          </article>
        </div>
      </section>

      {/* OCR Technology Spotlight */}
      <section id="ocr-engine" className="border-y border-slate-900/8 dark:border-white/8 bg-white/40 dark:bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5">
            <div className="rounded-3xl overflow-hidden glass-card p-2">
              <div className="rounded-2xl overflow-hidden bg-slate-950">
                <img
                  src="/src/assets/images/ocr_receipt_preview_1795172230266.jpg"
                  alt="Printed grocery receipt aligned for OCR line-item and total extraction"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-sky-400 mb-2">
              <Camera className="w-4 h-4" />
              <span>OCR Receipt Parsing Pipeline</span>
            </div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Snap or upload any receipt—verify every line item before saving
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Upload JPG or PNG receipts or capture directly from your phone camera. Our local Tesseract OCR engine extracts merchant names, dates, individual line items, taxes, and payment info, then runs a mathematical cross-check comparing the sum of extracted items against the receipt total.
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-2xl glass-card">
                <div className="font-semibold text-slate-900 dark:text-white">Human-in-the-Loop Verification</div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  OCR errors are caught early in an editable confirmation form—unverified receipts are never auto-saved.
                </p>
              </div>
              <div className="p-4 rounded-2xl glass-card">
                <div className="font-semibold text-slate-900 dark:text-white">Relational Receipt Storage</div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Confirmed receipts link directly to your transaction ledger alongside itemized line records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Forecasting & AI Assistant Explanation */}
      <section id="forecasting" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="p-8 rounded-2xl glass-card glass-card-hover">
            <p className="text-sm font-semibold text-blue-600 dark:text-sky-400">Predictive Analytics</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-slate-900 dark:text-white">
              Honest time-series forecasting with backtest evaluation
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Instead of guessing future spend, LedgerIQ splits your historical daily expenses into training and held-out test periods, calculates Mean Absolute Error (MAE) and Root Mean Squared Error (RMSE), and projects 7-day, 30-day, and end-of-month totals with uncertainty intervals.
            </p>
            <div className="mt-6 pt-5 border-t border-slate-900/10 dark:border-white/10 grid grid-cols-3 gap-4 font-mono text-sm tabular-nums">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Horizon</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">7 & 30 Days</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Validation</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">Held-Out MAE</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Safeguard</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">Min-Data Gate</div>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-2xl glass-card glass-card-hover">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Retrieval-Augmented Generation</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-slate-900 dark:text-white">
              Private AI Financial Assistant grounded in your SQL records
            </h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Every chat query retrieves strictly your authenticated user’s monthly totals, category shifts, recurring bills, and matching transactions from the database before generating advice with Google Gemini—ensuring zero cross-user leakage and verifiable numbers.
            </p>
            <div className="mt-6 pt-5 border-t border-slate-900/10 dark:border-white/10 grid grid-cols-3 gap-4 font-mono text-sm tabular-nums">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Isolation</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">Per-User JWT</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Grounding</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">Live SQL RAG</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans">Offline Mode</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">SQL Fallback</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-slate-900/8 dark:border-white/8">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-600 dark:text-sky-400">Workflow</p>
            <h2 className="mt-2 text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
              How LedgerIQ works from receipt capture to monthly savings
            </h2>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01. Record or Scan',
                desc: 'Add income or expenses with ML auto-categorization, or scan a paper receipt using local Tesseract OCR.',
              },
              {
                step: '02. Verify & Persist',
                desc: 'Confirm extracted line items and totals, then store records in your private relational SQL database.',
              },
              {
                step: '03. Forecast & Detect',
                desc: 'Review 30-day spending projections, budget overrun warnings, and unusual spending activity alerts.',
              },
              {
                step: '04. Simulate & Save',
                desc: 'Test budget cuts in the What-If Simulator, consult the AI Financial Assistant, and export CSV or PDF reports.',
              },
            ].map((item) => (
              <div key={item.step} className="p-6 rounded-2xl glass-card glass-card-hover">
                <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">{item.step}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 p-8 rounded-3xl glass-balance-hero text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-display font-bold">Ready to inspect your spending with real analytics?</h3>
              <p className="mt-1 text-sm text-slate-300">
                Register a new private account or sign in to the pre-populated demo dataset immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onGoRegister}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 rounded-xl shadow-lg shadow-blue-600/30 transition-all whitespace-nowrap"
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={onGoLogin}
                className="px-5 py-2.5 text-sm font-medium text-white border border-white/20 bg-white/10 hover:bg-white/15 rounded-xl transition-colors whitespace-nowrap"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-900/8 dark:border-white/8 bg-white/40 dark:bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
          <div className="font-display font-semibold text-slate-900 dark:text-white">LedgerIQ</div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a>
            <a href="#ocr-engine" className="hover:text-slate-900 dark:hover:text-white">OCR Engine</a>
            <a href="#forecasting" className="hover:text-slate-900 dark:hover:text-white">Forecasting</a>
            <button type="button" onClick={onGoLogin} className="hover:text-slate-900 dark:hover:text-white">
              Sign In
            </button>
          </div>
          <div>© 2026 LedgerIQ · Track Smarter. Predict Spending. Save Better.</div>
        </div>
      </footer>
    </div>
  );
}
