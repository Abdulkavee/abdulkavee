import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function AnimatedNumber({
  value,
  format,
  durationMs = 680,
  className = '',
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || durationMs <= 0) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    let frameId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // Smooth Apple ease-out expo curve
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className}`}>{format(Math.round(display))}</span>;
}

export function AnimatedProgressBar({
  percent,
  colorClass,
  heightClass = 'h-2',
}: {
  percent: number;
  colorClass: string;
  heightClass?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`${heightClass} w-full bg-slate-900/10 dark:bg-white/10 rounded-full overflow-hidden`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={`h-full rounded-full ${colorClass}`}
      />
    </div>
  );
}

export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="glass-card rounded-2xl p-10 text-center max-w-xl mx-auto"
    >
      <div className="w-12 h-12 rounded-2xl bg-blue-500/12 dark:bg-blue-500/15 text-blue-600 dark:text-sky-400 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </motion.div>
  );
}

export function ErrorStateCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="glass-card rounded-2xl p-8 text-center max-w-lg mx-auto border-rose-500/25"
    >
      <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-500 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="w-5 h-5" />
      </div>
      <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
        Unable to Load Data
      </h3>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all active:scale-[0.98]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      )}
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-44 rounded-3xl glass-card p-6 space-y-4">
        <div className="h-4 w-36 rounded-lg glass-skeleton" />
        <div className="h-10 w-56 rounded-xl glass-skeleton" />
        <div className="grid grid-cols-3 gap-4 pt-3">
          <div className="h-12 rounded-xl glass-skeleton" />
          <div className="h-12 rounded-xl glass-skeleton" />
          <div className="h-12 rounded-xl glass-skeleton" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl glass-card p-5 space-y-3">
            <div className="h-3 w-24 rounded glass-skeleton" />
            <div className="h-7 w-32 rounded-lg glass-skeleton" />
            <div className="h-3 w-40 rounded glass-skeleton" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 h-80 rounded-2xl glass-card glass-skeleton" />
        <div className="lg:col-span-5 h-80 rounded-2xl glass-card glass-skeleton" />
      </div>
    </div>
  );
}
