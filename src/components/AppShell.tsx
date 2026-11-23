import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Camera,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Plus,
  PlusCircle,
  Repeat,
  Settings,
  Sliders,
  Sun,
  TrendingUp,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

export type AppPageId =
  | 'dashboard'
  | 'add-expense'
  | 'add-income'
  | 'receipt-scanner'
  | 'transactions'
  | 'analytics'
  | 'forecast'
  | 'assistant'
  | 'budgets'
  | 'simulator'
  | 'recommendations'
  | 'recurring'
  | 'reports'
  | 'profile';

interface NavGroup {
  label: string;
  items: Array<{ id: AppPageId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'transactions', label: 'Transactions', icon: ListOrdered },
    ],
  },
  {
    label: 'Capture & Entry',
    items: [
      { id: 'add-expense', label: 'Add Expense', icon: PlusCircle },
      { id: 'add-income', label: 'Add Income', icon: Wallet },
      { id: 'receipt-scanner', label: 'Receipt Scanner', icon: Camera },
    ],
  },
  {
    label: 'AI & Analytics',
    items: [
      { id: 'forecast', label: '30-Day Forecast', icon: TrendingUp },
      { id: 'analytics', label: 'Analytics & Anomalies', icon: BarChart3 },
      { id: 'assistant', label: 'AI Financial Assistant', icon: Bot },
      { id: 'recommendations', label: 'Savings Insights', icon: Lightbulb },
    ],
  },
  {
    label: 'Planning & Exports',
    items: [
      { id: 'budgets', label: 'Budget Planner', icon: PieChart },
      { id: 'simulator', label: 'What-If Simulator', icon: Sliders },
      { id: 'recurring', label: 'Recurring Bills', icon: Repeat },
      { id: 'reports', label: 'Reports & Exports', icon: FileSpreadsheet },
      { id: 'profile', label: 'Profile & Settings', icon: Settings },
    ],
  },
];

const PAGE_TITLES: Record<AppPageId, string> = {
  dashboard: 'Financial Dashboard',
  'add-expense': 'Log Expense',
  'add-income': 'Log Income',
  'receipt-scanner': 'OCR Receipt Scanner',
  transactions: 'Transaction History',
  analytics: 'Analytics & Anomaly Detection',
  forecast: '30-Day Expense Forecast',
  assistant: 'AI Financial Assistant',
  budgets: 'Budget Planner',
  simulator: 'What-If Budget Simulator',
  recommendations: 'Smart Savings Recommendations',
  recurring: 'Recurring Expense Tracker',
  reports: 'Reports & Exports',
  profile: 'Profile & Settings',
};

const MOBILE_PRIMARY_TABS: Array<{ id: AppPageId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'receipt-scanner', label: 'Scan', icon: Camera },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
  { id: 'assistant', label: 'AI Chat', icon: Bot },
  { id: 'transactions', label: 'Ledger', icon: ListOrdered },
];

interface AlertItem {
  id: string;
  title: string;
  detail: string;
  severity: 'warning' | 'exceeded' | 'info';
  targetPage: AppPageId;
}

interface AppShellProps {
  activePage: AppPageId;
  onNavigate: (page: AppPageId) => void;
  refreshNonce?: number;
  children: React.ReactNode;
}

export function AppShell({ activePage, onNavigate, refreshNonce = 0, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  const notifRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  // Fetch real live budget & forecast alerts for the top-bar Notification bell
  useEffect(() => {
    let active = true;
    api
      .getDashboard()
      .then((dash) => {
        if (!active) return;
        const next: AlertItem[] = [];
        if (dash.upcomingPredicted.overrunWarning) {
          next.push({
            id: 'forecast-overrun',
            title: 'Projected Monthly Overrun',
            detail: dash.upcomingPredicted.overrunWarning,
            severity: 'exceeded',
            targetPage: 'forecast',
          });
        }
        for (const w of dash.budgetWarnings) {
          next.push({
            id: `budget-${w.categoryName}`,
            title: `${w.categoryName === 'OVERALL' ? 'Monthly Budget' : w.categoryName} Alert`,
            detail: w.message,
            severity: w.status === 'exceeded' ? 'exceeded' : 'warning',
            targetPage: 'budgets',
          });
        }
        setAlerts(next);
      })
      .catch(() => {
        // ignore quietly
      });
    return () => {
      active = false;
    };
  }, [refreshNonce]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSelect = (id: AppPageId) => {
    onNavigate(id);
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  };

  const unreadCount = alertsDismissed ? 0 : alerts.length;

  return (
    <div className="min-h-screen app-canvas text-slate-900 dark:text-slate-100 flex transition-colors duration-300">
      {/* Desktop Collapsible Frosted Glass Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 glass-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarCollapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {/* Brand Header + Collapse Toggle */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-900/8 dark:border-white/8">
          <button
            type="button"
            onClick={() => handleSelect('dashboard')}
            className="flex items-center gap-2.5 min-w-0"
            title="LedgerIQ Dashboard"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 text-white font-display font-bold text-sm flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              LQ
            </div>
            {!sidebarCollapsed && (
              <span className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white truncate">
                LedgerIQ
              </span>
            )}
          </button>

          {!sidebarCollapsed && (
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <div className="px-3 pt-3 pb-1 flex justify-center">
            <button
              type="button"
              aria-label="Expand sidebar"
              onClick={() => setSidebarCollapsed(false)}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Groups with Animated Active Pill */}
        <nav aria-label="Main Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.label}
                </div>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={sidebarCollapsed ? item.label : undefined}
                        onClick={() => handleSelect(item.id)}
                        className={`relative w-full flex items-center ${
                          sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                        } py-2.5 text-sm rounded-xl transition-colors whitespace-nowrap ${
                          active
                            ? 'text-blue-700 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="sidebar-active-pill"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-xl bg-blue-500/12 dark:bg-gradient-to-r dark:from-blue-600/90 dark:to-indigo-600/80 border border-blue-500/25 dark:border-white/15 shadow-sm dark:shadow-lg dark:shadow-blue-600/20"
                          />
                        )}
                        <Icon
                          className={`relative z-10 w-4 h-4 shrink-0 ${
                            active ? 'text-blue-600 dark:text-white' : ''
                          }`}
                        />
                        {!sidebarCollapsed && <span className="relative z-10 truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer Profile Card */}
        <div className="p-3 border-t border-slate-900/8 dark:border-white/8">
          <div
            className={`flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } p-2 rounded-xl bg-slate-900/[0.03] dark:bg-white/[0.04]`}
          >
            <img
              src="/src/assets/images/avatar_student_profile_1795172228443.jpg"
              alt={user?.fullName || 'User profile'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30 shrink-0"
            />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {user?.fullName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user?.email}
                </div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 bg-slate-900/[0.03] dark:bg-white/[0.05] hover:bg-rose-500/10 rounded-xl transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="relative w-72 max-w-[85vw] glass-popover flex flex-col h-full"
            >
              <div className="h-14 px-5 flex items-center justify-between border-b border-slate-900/10 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-display font-bold text-xs flex items-center justify-center">
                    LQ
                  </div>
                  <span className="text-base font-display font-bold text-slate-900 dark:text-white">
                    LedgerIQ
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav aria-label="Mobile Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </div>
                    <ul className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = activePage === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => handleSelect(item.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors ${
                                active
                                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/25'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10'
                              }`}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span>{item.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-slate-900/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLogoutConfirmOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-300 bg-rose-500/10 hover:bg-rose-500/15 rounded-xl"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        }`}
      >
        {/* Premium Glass Top Navigation Bar (56px mobile / 64px desktop) */}
        <header className="sticky top-0 z-20 h-14 lg:h-16 glass-header px-4 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base lg:text-lg font-display font-semibold text-slate-900 dark:text-white truncate">
                {PAGE_TITLES[activePage]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activePage !== 'receipt-scanner' && (
              <button
                type="button"
                onClick={() => handleSelect('receipt-scanner')}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                <span>Scan Receipt</span>
              </button>
            )}
            {activePage !== 'add-expense' && (
              <button
                type="button"
                onClick={() => handleSelect('add-expense')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25 transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Expense</span>
              </button>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-900/[0.04] dark:bg-white/[0.06] hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.12] border border-slate-900/8 dark:border-white/10 transition-all active:scale-95"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            {/* Notifications Bell Popover */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                aria-label="Open notifications"
                aria-expanded={notifOpen}
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
                className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-900/[0.04] dark:bg-white/[0.06] hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.12] border border-slate-900/8 dark:border-white/10 transition-all active:scale-95"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-mono font-bold flex items-center justify-center shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] glass-popover rounded-2xl p-3 z-50"
                  >
                    <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-900/10 dark:border-white/10">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Financial Alerts ({alerts.length})
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setAlertsDismissed(true)}
                          className="text-[11px] font-medium text-blue-600 dark:text-sky-400 hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <div className="mt-2 max-h-72 overflow-y-auto space-y-1.5">
                      {alerts.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          All budgets and spending projections are on track.
                        </div>
                      ) : (
                        alerts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleSelect(a.targetPage)}
                            className="w-full text-left p-2.5 rounded-xl hover:bg-slate-900/5 dark:hover:bg-white/[0.07] transition-colors flex items-start gap-2.5"
                          >
                            <AlertTriangle
                              className={`w-4 h-4 shrink-0 mt-0.5 ${
                                a.severity === 'exceeded'
                                  ? 'text-rose-500 dark:text-rose-400'
                                  : 'text-amber-500 dark:text-amber-400'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                                {a.title}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                                {a.detail}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown Menu */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl bg-slate-900/[0.04] dark:bg-white/[0.06] hover:bg-slate-900/[0.08] dark:hover:bg-white/[0.12] border border-slate-900/8 dark:border-white/10 transition-colors"
              >
                <img
                  src="/src/assets/images/avatar_student_profile_1795172228443.jpg"
                  alt={user?.fullName || 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover"
                />
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hidden sm:block" />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 mt-2 w-60 glass-popover rounded-2xl p-2 z-50"
                  >
                    <div className="px-3 py-2.5 border-b border-slate-900/10 dark:border-white/10">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {user?.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {user?.email}
                      </div>
                    </div>
                    <div className="py-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => handleSelect('profile')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        <span>Profile & Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelect('reports')}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Reports & Exports</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleTheme();
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                      >
                        {isDark ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
                        <span>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                      </button>
                    </div>
                    <div className="pt-1 border-t border-slate-900/10 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          setLogoutConfirmOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Demo Dataset Transparency Notice */}
        {user?.isDemoAccount && (
          <div className="bg-blue-600/10 dark:bg-blue-500/12 border-b border-blue-500/20 text-slate-800 dark:text-blue-100 px-4 lg:px-8 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <span>
              Demo Dataset Active · Fictional 90-day student records
              <span className="hidden sm:inline">
                {' '}for demonstration. All edits, receipts, and forecasts persist to SQL.
              </span>
            </span>
            <button
              type="button"
              onClick={() => handleSelect('profile')}
              className="text-blue-700 dark:text-sky-300 hover:underline underline-offset-2 font-medium whitespace-nowrap"
            >
              Manage Account
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-x-clip p-4 lg:p-8 pb-24 lg:pb-10 max-w-[1380px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating Quick-Add Glass Action Button on Mobile when not already on Add Expense */}
      {activePage !== 'add-expense' && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Quick add expense"
          onClick={() => handleSelect('add-expense')}
          className="sm:hidden fixed bottom-[70px] right-4 z-20 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl shadow-blue-600/35 border border-white/25 flex items-center justify-center"
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      )}

      {/* Mobile Bottom Navigation Bar (56px height -> strictly <=15% sticky height alongside 56px header) */}
      <nav
        aria-label="Mobile Quick Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 h-14 glass-header border-t border-b-0 border-slate-900/10 dark:border-white/10 grid grid-cols-5 z-20"
      >
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activePage === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-sky-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sign Out Confirmation Modal */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Sign out of LedgerIQ?"
        description="Your session token will be cleared from this browser. All saved transactions, receipts, and budgets remain safely stored in SQL."
        confirmLabel="Sign Out"
        destructive
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          logout();
        }}
      />
    </div>
  );
}
