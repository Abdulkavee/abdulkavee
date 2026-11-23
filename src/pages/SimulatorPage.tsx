import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { runWhatIfSimulation } from '../ml/recommendations';
import { formatINR } from '../utils/format';

const SIM_CATEGORIES = ['Food', 'Shopping', 'Transport', 'Entertainment', 'Bills', 'Other'];

export function SimulatorPage() {
  const { chartTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [actualIncome, setActualIncome] = useState(30000);
  const [simulatedIncome, setSimulatedIncome] = useState(30000);
  const [actualBudget, setActualBudget] = useState(22000);
  const [simulatedBudget, setSimulatedBudget] = useState(22000);
  const [actualByCat, setActualByCat] = useState<Record<string, number>>({});
  const [simByCat, setSimByCat] = useState<Record<string, number>>({});

  useEffect(() => {
    api
      .getDashboard()
      .then((dash) => {
        const inc = dash.kpis.monthlyIncome > 0 ? dash.kpis.monthlyIncome : 30000;
        const bud = dash.kpis.monthlyBudget > 0 ? dash.kpis.monthlyBudget : 20000;
        setActualIncome(inc);
        setSimulatedIncome(inc);
        setActualBudget(bud);
        setSimulatedBudget(bud);

        const actualMap: Record<string, number> = {};
        let otherAccum = 0;
        for (const item of dash.categorySpending) {
          if (SIM_CATEGORIES.includes(item.category)) {
            actualMap[item.category] = Math.round(item.amount);
          } else {
            otherAccum += item.amount;
          }
        }
        actualMap['Fixed & Other'] = Math.round(otherAccum);

        for (const c of SIM_CATEGORIES) {
          if (actualMap[c] === undefined) actualMap[c] = 0;
        }
        setActualByCat(actualMap);
        setSimByCat({ ...actualMap });
      })
      .finally(() => setLoading(false));
  }, []);

  const orderedCategories = useMemo(() => {
    const keys = [...SIM_CATEGORIES, 'Fixed & Other'];
    return keys.filter((k) => (actualByCat[k] ?? 0) > 0 || ['Food', 'Shopping', 'Transport', 'Entertainment'].includes(k));
  }, [actualByCat]);

  const simulation = useMemo(() => {
    return runWhatIfSimulation({
      currentIncome: actualIncome,
      simulatedIncome,
      currentMonthlyBudget: actualBudget,
      simulatedMonthlyBudget: simulatedBudget,
      categories: orderedCategories.map((cat) => ({
        category: cat,
        actualSpent: actualByCat[cat] ?? 0,
        simulatedBudget: simByCat[cat] ?? 0,
      })),
    });
  }, [actualIncome, simulatedIncome, actualBudget, simulatedBudget, orderedCategories, actualByCat, simByCat]);

  const handleReset = () => {
    setSimulatedIncome(actualIncome);
    setSimulatedBudget(actualBudget);
    setSimByCat({ ...actualByCat });
  };

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl glass-card glass-skeleton" />
          ))}
        </div>
        <div className="h-96 rounded-2xl glass-card glass-skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">
            Simulated Estimates Only · Does Not Modify Actual Transactions
          </p>
          <h2 className="mt-1 text-2xl font-display font-bold text-slate-900 dark:text-white">
            What-If Budget Simulator
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Move sliders to test spending cuts or income changes and immediately compare simulated savings against your current monthly baseline.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl self-start sm:self-auto transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset to Actuals</span>
        </button>
      </div>

      {/* Simulation Outcome KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Current Actual Savings</div>
          <div className="mt-2 text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatINR(simulation.currentSavings)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Actual spend: {formatINR(simulation.currentExpenses)}
          </div>
        </div>

        <div className="p-5 glass-card rounded-2xl border-blue-500/35">
          <div className="text-xs font-medium text-blue-600 dark:text-sky-400">Expected Simulated Savings</div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatINR(simulation.simulatedSavings)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {simulation.savingsDelta >= 0 ? '+' : ''}
            {formatINR(simulation.savingsDelta)} vs current · {simulation.simulatedSavingsRate}% rate
          </div>
        </div>

        <div className="p-5 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">Revised Spending Allocation</div>
          <div className="mt-2 text-2xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatINR(simulation.simulatedExpenses)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Target budget: {formatINR(simulatedBudget)}
          </div>
        </div>

        <div className="p-5 glass-card rounded-2xl">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {simulation.potentialOverspending > 0 ? 'Potential Overspending' : 'Remaining Simulated Budget'}
          </div>
          <div
            className={`mt-2 text-2xl font-mono font-bold tabular-nums ${
              simulation.potentialOverspending > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {simulation.potentialOverspending > 0
              ? formatINR(simulation.potentialOverspending)
              : formatINR(simulation.remainingBudget)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {simulation.potentialOverspending > 0 ? 'Exceeds simulated total budget' : 'Buffer within total budget'}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Interactive Sliders */}
        <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl space-y-5">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Adjust Monthly Parameters
          </h3>

          <div className="space-y-4 pb-4 border-b border-slate-900/10 dark:border-white/10">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <label htmlFor="sim-income" className="font-medium text-slate-700 dark:text-slate-300">
                  Expected Monthly Income
                </label>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {formatINR(simulatedIncome)}
                </span>
              </div>
              <input
                id="sim-income"
                type="range"
                min={Math.max(5000, Math.floor((actualIncome * 0.5) / 500) * 500)}
                max={Math.max(60000, Math.ceil((actualIncome * 1.8) / 500) * 500)}
                step={500}
                value={simulatedIncome}
                onChange={(e) => setSimulatedIncome(Number(e.target.value))}
                className="w-full fin-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <label htmlFor="sim-total-budget" className="font-medium text-slate-700 dark:text-slate-300">
                  Total Monthly Budget Target
                </label>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {formatINR(simulatedBudget)}
                </span>
              </div>
              <input
                id="sim-total-budget"
                type="range"
                min={5000}
                max={Math.max(50000, Math.ceil((actualBudget * 1.6) / 500) * 500)}
                step={500}
                value={simulatedBudget}
                onChange={(e) => setSimulatedBudget(Number(e.target.value))}
                className="w-full fin-slider"
              />
            </div>
          </div>

          <div className="space-y-4">
            {orderedCategories.map((cat) => {
              const actual = actualByCat[cat] ?? 0;
              const currentSim = simByCat[cat] ?? 0;
              const maxSlider = Math.max(8000, Math.ceil((actual * 1.6) / 100) * 100);
              const diff = currentSim - actual;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <label htmlFor={`sim-cat-${cat}`} className="font-medium text-slate-700 dark:text-slate-300">
                      {cat}
                    </label>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                      <strong>{formatINR(currentSim)}</strong>{' '}
                      <span
                        className={
                          diff < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : diff > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                        }
                      >
                        ({diff === 0 ? 'actual' : `${diff > 0 ? '+' : ''}${formatINR(diff)}`})
                      </span>
                    </span>
                  </div>
                  <input
                    id={`sim-cat-${cat}`}
                    type="range"
                    min={0}
                    max={maxSlider}
                    step={100}
                    value={currentSim}
                    onChange={(e) =>
                      setSimByCat((prev) => ({ ...prev, [cat]: Number(e.target.value) }))
                    }
                    className="w-full fin-slider"
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Live Comparison Chart */}
        <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Current Actual vs. Simulated Category Allocation
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Updates live as you adjust category sliders
          </p>
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={simulation.categoryComparison} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: chartTheme.tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  formatter={(val: unknown, name: unknown) => [formatINR(Number(val ?? 0)), String(name ?? '')]}
                  contentStyle={chartTheme.tooltipStyle}
                  labelStyle={chartTheme.tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="actual" name="Current Actual" fill={chartTheme.expenseBar} radius={[6, 6, 0, 0]} />
                <Bar dataKey="simulated" name="Simulated Budget" fill={chartTheme.accentBlue} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
