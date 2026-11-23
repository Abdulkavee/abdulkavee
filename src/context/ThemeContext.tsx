import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ChartTheme {
  gridStroke: string;
  tickFill: string;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  actualStroke: string;
  expenseBar: string;
  incomeBar: string;
  accentBlue: string;
  accentViolet: string;
  accentCyan: string;
  uncertaintyFill: string;
}

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  chartTheme: ChartTheme;
  resolveCategoryColor: (hex: string) => string;
}

const DARK_COLOR_MAP: Record<string, string> = {
  '#0B132B': '#818CF8',
  '#0F172A': '#818CF8',
  '#1E293B': '#60A5FA',
  '#111827': '#818CF8',
  '#334155': '#94A3B8',
  '#475569': '#94A3B8',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'ledgeriq_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => setThemeState(mode);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const resolveCategoryColor = (hex: string) => {
    if (theme !== 'dark') return hex;
    const upper = (hex || '').trim().toUpperCase();
    return DARK_COLOR_MAP[upper] || hex;
  };

  const chartTheme = useMemo<ChartTheme>(() => {
    const isDark = theme === 'dark';
    return {
      gridStroke: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.28)',
      tickFill: isDark ? '#94A3B8' : '#64748B',
      tooltipStyle: {
        backgroundColor: isDark ? 'rgba(12, 19, 38, 0.94)' : 'rgba(255, 255, 255, 0.95)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(15, 23, 42, 0.1)',
        borderRadius: 12,
        boxShadow: isDark
          ? '0 16px 36px rgba(0, 0, 0, 0.65)'
          : '0 12px 28px rgba(15, 23, 42, 0.12)',
        color: isDark ? '#F8FAFC' : '#0F172A',
        fontSize: 12,
        backdropFilter: 'blur(16px)',
      },
      tooltipLabelStyle: {
        color: isDark ? '#CBD5E1' : '#334155',
        fontWeight: 600,
        marginBottom: 4,
      },
      actualStroke: isDark ? '#F8FAFC' : '#0B132B',
      expenseBar: isDark ? '#6366F1' : '#0B132B',
      incomeBar: isDark ? '#10B981' : '#059669',
      accentBlue: isDark ? '#38BDF8' : '#2563EB',
      accentViolet: '#8B5CF6',
      accentCyan: '#06B6D4',
      uncertaintyFill: isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(59, 130, 246, 0.16)',
    };
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, isDark: theme === 'dark', setTheme, toggleTheme, chartTheme, resolveCategoryColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
