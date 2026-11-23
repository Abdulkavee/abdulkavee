import type {
  DetectedRecurringPattern,
  SavingsRecommendation,
  WhatIfInput,
  WhatIfResult,
} from '../types/finance.ts';

export interface SimpleTransaction {
  id: number;
  date: string;
  merchant: string;
  description: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

const DISCRETIONARY_CATEGORIES = new Set([
  'Shopping',
  'Food',
  'Entertainment',
  'Travel',
  'Other',
]);

/**
 * Computes data-grounded savings recommendations from actual monthly spending history.
 * Never fabricates numbers or promises unrealistic savings.
 */
export function generateSavingsRecommendations(
  transactions: SimpleTransaction[],
  currentMonthKey: string,
  prevMonthKey: string,
  monthlyIncome: number
): {
  recommendations: SavingsRecommendation[];
  suggestedMonthlySavingsTarget: number;
  discretionaryTotal: number;
  essentialTotal: number;
} {
  const expenses = transactions.filter((t) => t.type === 'expense');
  const currentMonthTxs = expenses.filter((t) => t.date.startsWith(currentMonthKey));
  const prevMonthTxs = expenses.filter((t) => t.date.startsWith(prevMonthKey));

  const currentByCat = new Map<string, number>();
  const prevByCat = new Map<string, number>();

  for (const tx of currentMonthTxs) {
    currentByCat.set(tx.category, (currentByCat.get(tx.category) ?? 0) + tx.amount);
  }
  for (const tx of prevMonthTxs) {
    prevByCat.set(tx.category, (prevByCat.get(tx.category) ?? 0) + tx.amount);
  }

  let discretionaryTotal = 0;
  let essentialTotal = 0;
  for (const [cat, amt] of currentByCat.entries()) {
    if (DISCRETIONARY_CATEGORIES.has(cat)) discretionaryTotal += amt;
    else essentialTotal += amt;
  }

  const recommendations: SavingsRecommendation[] = [];

  // 1. Month-over-Month category surge insights
  for (const [cat, curAmt] of currentByCat.entries()) {
    const prevAmt = prevByCat.get(cat) ?? 0;
    if (prevAmt >= 300 && curAmt > prevAmt * 1.15) {
      const pctIncrease = Math.round(((curAmt - prevAmt) / prevAmt) * 100);
      const excess = Math.round(curAmt - prevAmt);
      recommendations.push({
        id: `mom-increase-${cat.toLowerCase()}`,
        category: cat,
        severity: pctIncrease >= 35 ? 'warning' : 'opportunity',
        title: `${cat} spending increased by ${pctIncrease}% compared with last month`,
        detail: `You spent ₹${Math.round(curAmt).toLocaleString('en-IN')} on ${cat} this month versus ₹${Math.round(prevAmt).toLocaleString('en-IN')} last month. Bringing ${cat} back toward last month's level could save roughly ₹${Math.round(excess * 0.7).toLocaleString('en-IN')}/month.`,
        potentialMonthlySavings: Math.round(excess * 0.7),
        metricLabel: `+${pctIncrease}% MoM`,
      });
    }
  }

  // 2. Highest discretionary expense insight
  const discretionaryEntries = Array.from(currentByCat.entries())
    .filter(([cat]) => DISCRETIONARY_CATEGORIES.has(cat))
    .sort((a, b) => b[1] - a[1]);

  if (discretionaryEntries.length > 0) {
    const [topCat, topAmt] = discretionaryEntries[0];
    const suggestedCut = Math.round(topAmt * 0.15);
    recommendations.push({
      id: `top-discretionary-${topCat.toLowerCase()}`,
      category: topCat,
      severity: 'opportunity',
      title: `${topCat} is your highest discretionary expense`,
      detail: `${topCat} accounts for ₹${Math.round(topAmt).toLocaleString('en-IN')} this month (${discretionaryTotal > 0 ? Math.round((topAmt / discretionaryTotal) * 100) : 0}% of discretionary spend). Setting a 15% lower cap saves ₹${suggestedCut.toLocaleString('en-IN')} without disrupting essential bills.`,
      potentialMonthlySavings: suggestedCut,
      metricLabel: `₹${Math.round(topAmt).toLocaleString('en-IN')} spent`,
    });
  }

  // 3. Entertainment / dining frequency insight
  const foodOrders = currentMonthTxs.filter((t) => t.category === 'Food');
  if (foodOrders.length >= 10) {
    const foodTotal = currentByCat.get('Food') ?? 0;
    const avgOrder = foodTotal / foodOrders.length;
    const saveEst = Math.round(avgOrder * 3);
    recommendations.push({
      id: 'food-frequency-trim',
      category: 'Food',
      severity: 'info',
      title: `${foodOrders.length} separate Food transactions logged this month`,
      detail: `Your average Food spend is ₹${Math.round(avgOrder).toLocaleString('en-IN')} per transaction. Replacing just 3 takeout or cafe orders per month with home meals can preserve about ₹${saveEst.toLocaleString('en-IN')}.`,
      potentialMonthlySavings: saveEst,
      metricLabel: `${foodOrders.length} orders`,
    });
  }

  // 4. Overall savings ratio check
  const totalCurrentExpense = discretionaryTotal + essentialTotal;
  const actualSavings = Math.max(0, monthlyIncome - totalCurrentExpense);
  const savingsRate = monthlyIncome > 0 ? (actualSavings / monthlyIncome) * 100 : 0;

  if (monthlyIncome > 0 && savingsRate < 20) {
    const target20 = Math.round(monthlyIncome * 0.2);
    const gap = Math.max(0, target20 - actualSavings);
    recommendations.push({
      id: 'savings-rate-target',
      category: 'Overall',
      severity: 'warning',
      title: `Current savings rate is ${savingsRate.toFixed(1)}% (below 20% benchmark)`,
      detail: `Aiming for a 20% monthly saving target (₹${target20.toLocaleString('en-IN')}) requires trimming ₹${gap.toLocaleString('en-IN')} across discretionary categories.`,
      potentialMonthlySavings: gap,
      metricLabel: `${savingsRate.toFixed(1)}% saved`,
    });
  } else if (monthlyIncome > 0) {
    recommendations.push({
      id: 'savings-rate-healthy',
      category: 'Overall',
      severity: 'info',
      title: `Healthy ${savingsRate.toFixed(1)}% monthly savings rate`,
      detail: `You are currently retaining ₹${Math.round(actualSavings).toLocaleString('en-IN')} this month. Consider allocating a portion directly to your active savings goals.`,
      potentialMonthlySavings: 0,
      metricLabel: `${savingsRate.toFixed(1)}% saved`,
    });
  }

  // Realistic suggested monthly saving target: current surplus + 12% of discretionary spend, capped at 40% of income
  const suggestedMonthlySavingsTarget =
    monthlyIncome > 0
      ? Math.round(
          Math.min(monthlyIncome * 0.4, actualSavings + discretionaryTotal * 0.12)
        )
      : Math.round(discretionaryTotal * 0.15);

  return {
    recommendations: recommendations.slice(0, 6),
    suggestedMonthlySavingsTarget: Math.max(0, suggestedMonthlySavingsTarget),
    discretionaryTotal: Number(discretionaryTotal.toFixed(2)),
    essentialTotal: Number(essentialTotal.toFixed(2)),
  };
}

/**
 * Pure What-If Budget Simulator math.
 * Clearly separates simulated estimates from actual transactions.
 */
export function runWhatIfSimulation(input: WhatIfInput): WhatIfResult {
  const currentExpenses = input.categories.reduce((sum, c) => sum + c.actualSpent, 0);
  const simulatedExpenses = input.categories.reduce((sum, c) => sum + c.simulatedBudget, 0);

  const currentSavings = input.currentIncome - currentExpenses;
  const simulatedSavings = input.simulatedIncome - simulatedExpenses;
  const savingsDelta = simulatedSavings - currentSavings;

  const remainingBudget = Math.max(0, input.simulatedMonthlyBudget - simulatedExpenses);
  const potentialOverspending = Math.max(0, simulatedExpenses - input.simulatedMonthlyBudget);
  const simulatedSavingsRate =
    input.simulatedIncome > 0
      ? Number(((simulatedSavings / input.simulatedIncome) * 100).toFixed(1))
      : 0;

  const categoryComparison = input.categories.map((c) => ({
    category: c.category,
    current: Number(c.actualSpent.toFixed(2)),
    simulated: Number(c.simulatedBudget.toFixed(2)),
    delta: Number((c.simulatedBudget - c.actualSpent).toFixed(2)),
  }));

  return {
    currentExpenses: Number(currentExpenses.toFixed(2)),
    simulatedExpenses: Number(simulatedExpenses.toFixed(2)),
    currentSavings: Number(currentSavings.toFixed(2)),
    simulatedSavings: Number(simulatedSavings.toFixed(2)),
    savingsDelta: Number(savingsDelta.toFixed(2)),
    remainingBudget: Number(remainingBudget.toFixed(2)),
    potentialOverspending: Number(potentialOverspending.toFixed(2)),
    simulatedSavingsRate,
    categoryComparison,
  };
}

/**
 * Detects recurring expense patterns across transaction history
 * (same normalized merchant/title, consistent amount within ±15%, regular monthly or weekly cadence).
 */
export function detectRecurringPatterns(
  transactions: SimpleTransaction[],
  trackedTitles: string[] = []
): DetectedRecurringPattern[] {
  const trackedSet = new Set(trackedTitles.map((t) => t.trim().toLowerCase()));
  const expenses = transactions
    .filter((t) => t.type === 'expense')
    .sort((a, b) => a.date.localeCompare(b.date));

  const groups = new Map<string, SimpleTransaction[]>();
  for (const tx of expenses) {
    const key = (tx.merchant || tx.description)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|month|monthly|bill|payment)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (key.length < 3) continue;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const patterns: DetectedRecurringPattern[] = [];

  for (const [signature, list] of groups.entries()) {
    if (list.length < 2) continue;

    // Calculate inter-transaction day gaps
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) {
      const t1 = new Date(list[i - 1].date + 'T00:00:00Z').getTime();
      const t2 = new Date(list[i].date + 'T00:00:00Z').getTime();
      const days = Math.round((t2 - t1) / 86400000);
      if (days >= 5) gaps.push(days);
    }
    if (gaps.length === 0) continue;

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const amounts = list.map((l) => l.amount);
    const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const maxDev = Math.max(...amounts.map((a) => Math.abs(a - avgAmt) / Math.max(1, avgAmt)));

    let frequency: 'monthly' | 'weekly' | null = null;
    if (avgGap >= 24 && avgGap <= 36 && maxDev <= 0.22) {
      frequency = 'monthly';
    } else if (avgGap >= 6 && avgGap <= 9 && list.length >= 3 && maxDev <= 0.18) {
      frequency = 'weekly';
    }

    if (!frequency) continue;

    const latest = list[list.length - 1];
    const nextDateObj = new Date(latest.date + 'T00:00:00Z');
    if (frequency === 'monthly') {
      nextDateObj.setUTCMonth(nextDateObj.getUTCMonth() + 1);
    } else {
      nextDateObj.setUTCDate(nextDateObj.getUTCDate() + 7);
    }

    const title = latest.merchant || latest.description;
    patterns.push({
      signature,
      title,
      categoryName: latest.category,
      estimatedAmount: Number(avgAmt.toFixed(2)),
      frequency,
      occurrences: list.length,
      lastPaidDate: latest.date,
      nextExpectedDate: nextDateObj.toISOString().slice(0, 10),
      alreadyTracked: trackedSet.has(title.trim().toLowerCase()),
    });
  }

  patterns.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
  return patterns;
}
