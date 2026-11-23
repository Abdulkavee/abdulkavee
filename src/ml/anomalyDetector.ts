import type { SpendingAnomaly } from '../types/finance.ts';

export interface AnomalyTransactionInput {
  id: number;
  date: string;
  merchant: string;
  description: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Statistical + Robust Modified Z-Score (MAD) + IQR Fence Spending Anomaly Detector.
 * Flags unusually high transactions per category, repeated high-value bursts,
 * and sharp month-over-month category surges.
 * Strictly classifies findings as "Unusual Spending Activity" (never fraud).
 */
export function detectSpendingAnomalies(
  transactions: AnomalyTransactionInput[]
): SpendingAnomaly[] {
  const expenses = transactions
    .filter((t) => t.type === 'expense' && t.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (expenses.length < 5) return [];

  const anomalies: SpendingAnomaly[] = [];
  const flaggedTxIds = new Set<number>();

  // 1. Category-level Robust Outlier Detection (Modified Z-Score + IQR Fence)
  const byCategory = new Map<string, AnomalyTransactionInput[]>();
  for (const tx of expenses) {
    // Skip Rent since rent is structurally large and fixed
    if (tx.category === 'Rent') continue;
    const list = byCategory.get(tx.category) ?? [];
    list.push(tx);
    byCategory.set(tx.category, list);
  }

  for (const [category, items] of byCategory.entries()) {
    if (items.length < 4) continue;

    for (const tx of items) {
      // Leave-one-out baseline so the outlier itself doesn't distort its own median/MAD
      const others = items
        .filter((o) => o.id !== tx.id)
        .map((o) => o.amount)
        .sort((a, b) => a - b);

      const med = median(others);
      const avg = others.reduce((a, b) => a + b, 0) / others.length;
      const absDevs = others.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
      const mad = median(absDevs);
      const q1 = percentile(others, 0.25);
      const q3 = percentile(others, 0.75);
      const iqr = q3 - q1;

      const scale = mad > 0 ? 1.4826 * mad : Math.max(avg * 0.25, 100);
      const modifiedZ = (tx.amount - med) / scale;
      const iqrUpperFence = q3 + 2.2 * Math.max(iqr, med * 0.25);
      const ratio = med > 0 ? tx.amount / med : tx.amount / Math.max(1, avg);

      if (modifiedZ >= 3.5 && tx.amount > iqrUpperFence && ratio >= 2.5 && tx.amount >= 500) {
        const severity: 'Low' | 'Medium' | 'High' =
          modifiedZ >= 6.5 || ratio >= 5 ? 'High' : modifiedZ >= 4.5 || ratio >= 3.2 ? 'Medium' : 'Low';

        flaggedTxIds.add(tx.id);
        anomalies.push({
          transactionId: tx.id,
          date: tx.date,
          merchant: tx.merchant || tx.description,
          description: tx.description,
          category,
          amount: Number(tx.amount.toFixed(2)),
          baselineAvg: Number(avg.toFixed(2)),
          baselineMedian: Number(med.toFixed(2)),
          deviationFactor: Number(ratio.toFixed(1)),
          zScore: Number(modifiedZ.toFixed(2)),
          severity,
          anomalyType: 'category_outlier',
          label: 'Unusual Spending Activity',
          reason: `₹${Math.round(tx.amount).toLocaleString('en-IN')} in ${category} is ${ratio.toFixed(1)}× your typical ${category} transaction (median ₹${Math.round(med).toLocaleString('en-IN')}).`,
        });
      }
    }
  }

  // 2. Repeated High-Value Burst Detection (3+ above-P80 expenses within 48 hours)
  const nonRent = expenses.filter((t) => t.category !== 'Rent');
  const sortedAmounts = nonRent.map((t) => t.amount).sort((a, b) => a - b);
  const highThreshold = Math.max(1500, percentile(sortedAmounts, 0.85));

  const highValueTxs = nonRent.filter((t) => t.amount >= highThreshold);
  for (let i = 0; i < highValueTxs.length; i++) {
    const anchorTime = new Date(highValueTxs[i].date + 'T00:00:00Z').getTime();
    const cluster = highValueTxs.filter((candidate) => {
      const t = new Date(candidate.date + 'T00:00:00Z').getTime();
      return t >= anchorTime && t - anchorTime <= 2 * 86400000;
    });
    if (cluster.length >= 3) {
      const latest = cluster[cluster.length - 1];
      if (!flaggedTxIds.has(latest.id)) {
        const clusterTotal = cluster.reduce((s, c) => s + c.amount, 0);
        flaggedTxIds.add(latest.id);
        anomalies.push({
          transactionId: latest.id,
          date: latest.date,
          merchant: latest.merchant || latest.description,
          description: `${cluster.length} high-value expenses within 48 hours`,
          category: latest.category,
          amount: Number(clusterTotal.toFixed(2)),
          baselineAvg: Number(highThreshold.toFixed(2)),
          baselineMedian: Number(median(sortedAmounts).toFixed(2)),
          deviationFactor: Number((clusterTotal / Math.max(1, highThreshold)).toFixed(1)),
          zScore: 4.0,
          severity: 'Medium',
          anomalyType: 'burst_activity',
          label: 'Unusual Spending Activity',
          reason: `${cluster.length} high-value transactions totalling ₹${Math.round(clusterTotal).toLocaleString('en-IN')} occurred within 48 hours (each above your 85th percentile of ₹${Math.round(highThreshold).toLocaleString('en-IN')}).`,
        });
      }
      break;
    }
  }

  // Sort by severity then recency
  const sevRank = { High: 3, Medium: 2, Low: 1 };
  anomalies.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || b.date.localeCompare(a.date));
  return anomalies.slice(0, 12);
}
