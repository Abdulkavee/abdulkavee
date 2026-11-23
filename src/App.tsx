import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell, type AppPageId } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { AuthPages } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionFormPage } from './pages/TransactionFormPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ReceiptScannerPage } from './pages/ReceiptScannerPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ForecastPage } from './pages/ForecastPage';
import { AssistantPage } from './pages/AssistantPage';
import { BudgetPlannerPage } from './pages/BudgetPlannerPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { RecurringPage } from './pages/RecurringPage';
import { ReportsPage } from './pages/ReportsPage';
import { ProfilePage } from './pages/ProfilePage';

type PublicView = 'landing' | 'login' | 'register';

function MainRouter() {
  const { user, loading, login } = useAuth();
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [activePage, setActivePage] = useState<AppPageId>('dashboard');
  const [demoLoading, setDemoLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Support ?autostart=1 to jump directly into the demo workspace for instant inspection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !loading && !user && !demoLoading) {
      setDemoLoading(true);
      login('aarav.sharma@demo.fin', 'Demo@2026')
        .then(() => setActivePage('dashboard'))
        .catch(() => setPublicView('login'))
        .finally(() => setDemoLoading(false));
    }
  }, [loading, user, demoLoading, login]);

  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      await login('aarav.sharma@demo.fin', 'Demo@2026');
      setActivePage('dashboard');
    } catch {
      setPublicView('login');
    } finally {
      setDemoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen app-canvas flex items-center justify-center">
        <div className="glass-card rounded-2xl px-6 py-4 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-display font-bold text-xs flex items-center justify-center">
            LQ
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Loading LedgerIQ…
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    if (publicView === 'login' || publicView === 'register') {
      return (
        <AuthPages
          mode={publicView}
          onSwitchMode={(m) => setPublicView(m)}
          onBackLanding={() => setPublicView('landing')}
          onSuccess={() => {
            setPublicView('login');
            setActivePage('dashboard');
          }}
        />
      );
    }
    return (
      <LandingPage
        onGoLogin={() => setPublicView('login')}
        onGoRegister={() => setPublicView('register')}
        onTryDemo={handleTryDemo}
        demoLoading={demoLoading}
      />
    );
  }

  const bumpRefresh = () => setRefreshNonce((n) => n + 1);

  return (
    <AppShell activePage={activePage} onNavigate={setActivePage} refreshNonce={refreshNonce}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activePage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {activePage === 'dashboard' && <DashboardPage key={refreshNonce} onNavigate={setActivePage} />}
          {activePage === 'add-expense' && <TransactionFormPage mode="expense" onSaved={bumpRefresh} />}
          {activePage === 'add-income' && <TransactionFormPage mode="income" onSaved={bumpRefresh} />}
          {activePage === 'receipt-scanner' && <ReceiptScannerPage onSaved={bumpRefresh} />}
          {activePage === 'transactions' && <TransactionsPage key={refreshNonce} />}
          {activePage === 'analytics' && <AnalyticsPage key={refreshNonce} />}
          {activePage === 'forecast' && <ForecastPage key={refreshNonce} />}
          {activePage === 'assistant' && <AssistantPage />}
          {activePage === 'budgets' && <BudgetPlannerPage key={refreshNonce} />}
          {activePage === 'simulator' && <SimulatorPage key={refreshNonce} />}
          {activePage === 'recommendations' && <RecommendationsPage key={refreshNonce} />}
          {activePage === 'recurring' && <RecurringPage key={refreshNonce} />}
          {activePage === 'reports' && <ReportsPage key={refreshNonce} />}
          {activePage === 'profile' && <ProfilePage />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <MainRouter />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
