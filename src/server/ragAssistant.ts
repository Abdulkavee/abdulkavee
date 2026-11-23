import { GoogleGenAI } from '@google/genai';
import type { DatabaseSync } from 'node:sqlite';
import { generateExpenseForecast } from '../ml/forecaster.ts';
import { detectSpendingAnomalies } from '../ml/anomalyDetector.ts';
import { generateSavingsRecommendations } from '../ml/recommendations.ts';

export interface RagContextSummary {
  monthKey: string;
  prevMonthKey: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  prevMonthExpenses: number;
  monthlyBudget: number;
  remainingBudget: number;
  savingsAmount: number;
  categoryTotalsThisMonth: Record<string, number>;
  categoryTotalsLastMonth: Record<string, number>;
  topCategory: { name: string; amount: number } | null;
  predictedEndOfMonth: number;
  projectedOverrun: number;
  next30DaysForecast: number;
  recurringMonthlyTotal: number;
  anomalyCount: number;
  matchingTransactions: Array<{
    date: string;
    merchant: string;
    description: string;
    category: string;
    amount: number;
    type: string;
  }>;
}

function getPrevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return dt.toISOString().slice(0, 7);
}

/**
 * Retrieves strictly user-owned financial aggregates and keyword-matched
 * transaction records from the SQL database for Retrieval-Augmented Generation.
 */
export function retrieveUserFinancialContext(
  db: DatabaseSync,
  userId: number,
  question: string
): RagContextSummary {
  const todayIso = new Date().toISOString().slice(0, 10);
  const monthKey = todayIso.slice(0, 7);
  const prevMonthKey = getPrevMonthKey(monthKey);

  const allTxs = db
    .prepare(
      `SELECT id, transaction_date as date, merchant, description, category_name as category, amount, type
       FROM transactions
       WHERE user_id = ?
       ORDER BY transaction_date DESC`
    )
    .all(userId) as Array<{
    id: number;
    date: string;
    merchant: string;
    description: string;
    category: string;
    amount: number;
    type: 'income' | 'expense';
  }>;

  const userRow = db
    .prepare('SELECT monthly_budget_limit FROM users WHERE id = ?')
    .get(userId) as { monthly_budget_limit: number } | undefined;

  const overallBudgetRow = db
    .prepare(
      `SELECT amount_limit FROM budgets WHERE user_id = ? AND category_name = 'OVERALL' AND month_key = ?`
    )
    .get(userId, monthKey) as { amount_limit: number } | undefined;

  const monthlyBudget = overallBudgetRow?.amount_limit ?? userRow?.monthly_budget_limit ?? 20000;

  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let prevMonthExpenses = 0;
  const catThis: Record<string, number> = {};
  const catPrev: Record<string, number> = {};

  for (const tx of allTxs) {
    if (tx.date.startsWith(monthKey)) {
      if (tx.type === 'income') monthlyIncome += tx.amount;
      else {
        monthlyExpenses += tx.amount;
        catThis[tx.category] = (catThis[tx.category] ?? 0) + tx.amount;
      }
    } else if (tx.date.startsWith(prevMonthKey) && tx.type === 'expense') {
      prevMonthExpenses += tx.amount;
      catPrev[tx.category] = (catPrev[tx.category] ?? 0) + tx.amount;
    }
  }

  const topCatEntry = Object.entries(catThis).sort((a, b) => b[1] - a[1])[0] ?? null;

  const expenseRecords = allTxs
    .filter((t) => t.type === 'expense')
    .map((t) => ({ date: t.date, amount: t.amount, category: t.category }));

  const forecast = generateExpenseForecast(expenseRecords, monthlyBudget, todayIso);
  const anomalies = detectSpendingAnomalies(allTxs);

  const recRows = db
    .prepare('SELECT amount, frequency FROM recurring_expenses WHERE user_id = ?')
    .all(userId) as Array<{ amount: number; frequency: string }>;
  const recurringMonthlyTotal = recRows.reduce((sum, r) => {
    if (r.frequency === 'weekly') return sum + r.amount * 4.33;
    if (r.frequency === 'quarterly') return sum + r.amount / 3;
    if (r.frequency === 'yearly') return sum + r.amount / 12;
    return sum + r.amount;
  }, 0);

  // Keyword-based retrieval of top 12 relevant transactions
  const qTokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const scoredTxs = allTxs.map((tx) => {
    const hay = `${tx.category} ${tx.merchant} ${tx.description} ${tx.type} ${tx.date}`.toLowerCase();
    let score = tx.date.startsWith(monthKey) ? 1 : 0;
    for (const tok of qTokens) {
      if (hay.includes(tok)) score += 3;
    }
    return { tx, score };
  });
  scoredTxs.sort((a, b) => b.score - a.score || b.tx.date.localeCompare(a.tx.date));

  return {
    monthKey,
    prevMonthKey,
    monthlyIncome: Number(monthlyIncome.toFixed(2)),
    monthlyExpenses: Number(monthlyExpenses.toFixed(2)),
    prevMonthExpenses: Number(prevMonthExpenses.toFixed(2)),
    monthlyBudget: Number(monthlyBudget.toFixed(2)),
    remainingBudget: Number(Math.max(0, monthlyBudget - monthlyExpenses).toFixed(2)),
    savingsAmount: Number((monthlyIncome - monthlyExpenses).toFixed(2)),
    categoryTotalsThisMonth: catThis,
    categoryTotalsLastMonth: catPrev,
    topCategory: topCatEntry ? { name: topCatEntry[0], amount: Number(topCatEntry[1].toFixed(2)) } : null,
    predictedEndOfMonth: forecast.predictedEndOfMonthTotal,
    projectedOverrun: forecast.projectedOverrun,
    next30DaysForecast: forecast.next30DaysTotal,
    recurringMonthlyTotal: Number(recurringMonthlyTotal.toFixed(2)),
    anomalyCount: anomalies.length,
    matchingTransactions: scoredTxs.slice(0, 12).map((s) => ({
      date: s.tx.date,
      merchant: s.tx.merchant,
      description: s.tx.description,
      category: s.tx.category,
      amount: s.tx.amount,
      type: s.tx.type,
    })),
  };
}

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Transparent local SQL analytics fallback used ONLY when GEMINI_API_KEY is not configured
 * or upstream Gemini API is unreachable. Never fabricates data.
 */
function buildSqlFallbackAnswer(
  db: DatabaseSync,
  userId: number,
  question: string,
  ctx: RagContextSummary
): string {
  const q = question.toLowerCase();

  // Check if asking about a specific category
  const allCats = Array.from(
    new Set([
      ...Object.keys(ctx.categoryTotalsThisMonth),
      ...Object.keys(ctx.categoryTotalsLastMonth),
      'food',
      'shopping',
      'transport',
      'rent',
      'bills',
      'education',
      'healthcare',
      'entertainment',
      'travel',
    ])
  );
  const matchedCat = allCats.find((c) => q.includes(c.toLowerCase()));

  if (matchedCat && (q.includes('spend') || q.includes('spent') || q.includes('how much'))) {
    const canonical =
      Object.keys(ctx.categoryTotalsThisMonth).find((k) => k.toLowerCase() === matchedCat.toLowerCase()) ||
      matchedCat.charAt(0).toUpperCase() + matchedCat.slice(1);
    const thisAmt = ctx.categoryTotalsThisMonth[canonical] ?? 0;
    const lastAmt = ctx.categoryTotalsLastMonth[canonical] ?? 0;
    const diff = thisAmt - lastAmt;
    const pct = lastAmt > 0 ? Math.round((diff / lastAmt) * 100) : null;
    const share = ctx.monthlyExpenses > 0 ? ((thisAmt / ctx.monthlyExpenses) * 100).toFixed(1) : '0';

    return [
      `**${canonical} Spending (${ctx.monthKey})**`,
      `- You spent **${fmt(thisAmt)}** on **${canonical}** this month (${share}% of your total ${fmt(ctx.monthlyExpenses)} monthly expenses).`,
      `- Last month (${ctx.prevMonthKey}), you spent **${fmt(lastAmt)}** on ${canonical}${pct !== null ? ` (${diff >= 0 ? '+' : ''}${pct}% change)` : ''}.`,
      thisAmt > lastAmt && lastAmt > 0
        ? `- **Suggestion:** Trimming ${canonical} back to last month's level would save approximately **${fmt(diff)}** this month.`
        : `- **Status:** Your ${canonical} spend is currently controlled relative to last month.`,
    ].join('\n');
  }

  if (q.includes('compare') || q.includes('last month')) {
    const diff = ctx.monthlyExpenses - ctx.prevMonthExpenses;
    const pct = ctx.prevMonthExpenses > 0 ? ((diff / ctx.prevMonthExpenses) * 100).toFixed(1) : '0';
    const topShifts = Object.keys(ctx.categoryTotalsThisMonth)
      .map((cat) => ({
        cat,
        cur: ctx.categoryTotalsThisMonth[cat] ?? 0,
        prev: ctx.categoryTotalsLastMonth[cat] ?? 0,
        delta: (ctx.categoryTotalsThisMonth[cat] ?? 0) - (ctx.categoryTotalsLastMonth[cat] ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    return [
      `**Month-over-Month Comparison (${ctx.monthKey} vs ${ctx.prevMonthKey})**`,
      `- **This Month Expenses (to date):** ${fmt(ctx.monthlyExpenses)}`,
      `- **Last Month Total Expenses:** ${fmt(ctx.prevMonthExpenses)}`,
      `- **Difference:** ${diff >= 0 ? '+' : '-'}${fmt(Math.abs(diff))} (${diff >= 0 ? '+' : ''}${pct}%)`,
      '',
      '**Largest Category Shifts:**',
      ...topShifts.map(
        (s) => `- **${s.cat}:** ${fmt(s.cur)} vs ${fmt(s.prev)} (${s.delta >= 0 ? '+' : '-'}${fmt(Math.abs(s.delta))})`
      ),
    ].join('\n');
  }

  if (q.includes('highest') || q.includes('top') || q.includes('biggest')) {
    const ranked = Object.entries(ctx.categoryTotalsThisMonth).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) {
      return `No expenses have been recorded for ${ctx.monthKey} yet.`;
    }
    return [
      `**Highest Expense Categories (${ctx.monthKey})**`,
      ...ranked.slice(0, 5).map(
        ([cat, amt], i) =>
          `${i + 1}. **${cat}:** ${fmt(amt)} (${ctx.monthlyExpenses > 0 ? ((amt / ctx.monthlyExpenses) * 100).toFixed(1) : 0}% of total)`
      ),
    ].join('\n');
  }

  if (q.includes('exceed') || q.includes('budget') || q.includes('overrun') || q.includes('forecast')) {
    const pctUsed = ctx.monthlyBudget > 0 ? ((ctx.monthlyExpenses / ctx.monthlyBudget) * 100).toFixed(1) : '0';
    return [
      `**Budget & End-of-Month Forecast (${ctx.monthKey})**`,
      `- **Monthly Budget:** ${fmt(ctx.monthlyBudget)}`,
      `- **Spent So Far:** ${fmt(ctx.monthlyExpenses)} (${pctUsed}% used, ${fmt(ctx.remainingBudget)} remaining)`,
      `- **Predicted End-of-Month Total:** ${fmt(ctx.predictedEndOfMonth)}`,
      ctx.projectedOverrun > 0
        ? `- **Warning:** At your current pace, you are projected to **exceed your monthly budget by ${fmt(ctx.projectedOverrun)}**. Consider pausing non-essential Shopping and dining orders for the rest of the month.`
        : `- **Status:** You are currently projected to finish **within budget** with roughly ${fmt(Math.max(0, ctx.monthlyBudget - ctx.predictedEndOfMonth))} to spare.`,
    ].join('\n');
  }

  if (q.includes('reduce') || q.includes('save') || q.includes('cut') || q.includes('suggest')) {
    const txs = db
      .prepare(
        `SELECT id, transaction_date as date, merchant, description, category_name as category, amount, type
         FROM transactions WHERE user_id = ?`
      )
      .all(userId) as Array<{
      id: number;
      date: string;
      merchant: string;
      description: string;
      category: string;
      amount: number;
      type: 'income' | 'expense';
    }>;
    const rec = generateSavingsRecommendations(txs, ctx.monthKey, ctx.prevMonthKey, ctx.monthlyIncome);
    return [
      `**Personalized Savings Analysis (${ctx.monthKey})**`,
      `- **Current Monthly Income:** ${fmt(ctx.monthlyIncome)} | **Expenses:** ${fmt(ctx.monthlyExpenses)} | **Current Net Savings:** ${fmt(ctx.savingsAmount)}`,
      `- **Discretionary Spend:** ${fmt(rec.discretionaryTotal)} vs **Essential Spend:** ${fmt(rec.essentialTotal)}`,
      `- **Realistic Next-Month Savings Target:** **${fmt(rec.suggestedMonthlySavingsTarget)}**`,
      '',
      '**Data-Backed Reduction Opportunities:**',
      ...rec.recommendations.slice(0, 3).map((r) => `- **${r.title}:** ${r.detail}`),
    ].join('\n');
  }

  // General summary response grounded strictly in SQL data
  return [
    `**Financial Snapshot (${ctx.monthKey})**`,
    `- **Monthly Income:** ${fmt(ctx.monthlyIncome)}`,
    `- **Monthly Expenses:** ${fmt(ctx.monthlyExpenses)} (Budget: ${fmt(ctx.monthlyBudget)}, Remaining: ${fmt(ctx.remainingBudget)})`,
    `- **Net Savings This Month:** ${fmt(ctx.savingsAmount)}`,
    ctx.topCategory ? `- **Top Expense Category:** ${ctx.topCategory.name} (${fmt(ctx.topCategory.amount)})` : '',
    `- **Predicted End-of-Month Spend:** ${fmt(ctx.predictedEndOfMonth)}`,
    `- **Recurring Monthly Commitments:** ${fmt(ctx.recurringMonthlyTotal)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateRagFinancialReply(
  db: DatabaseSync,
  userId: number,
  userQuestion: string,
  recentHistory: Array<{ role: string; content: string }>
): Promise<{
  reply: string;
  mode: 'gemini' | 'sql_fallback';
  retrievedSummary: RagContextSummary;
  notice?: string;
}> {
  const ctx = retrieveUserFinancialContext(db, userId, userQuestion);
  const rawKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  const isPlaceholderKey =
    !rawKey ||
    rawKey === 'MY_GEMINI_API_KEY' ||
    /^(your_|my_|replace_|placeholder|<)/i.test(rawKey) ||
    rawKey.length < 20;
  const apiKey = isPlaceholderKey ? '' : rawKey;

  if (!isPlaceholderKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const historyText = recentHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const prompt = [
        'RETRIEVED DATABASE CONTEXT (Authenticated User Only — Ground Truth):',
        JSON.stringify(ctx, null, 2),
        '',
        historyText ? `RECENT CONVERSATION:\n${historyText}\n` : '',
        `USER QUESTION: ${userQuestion}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are LedgerIQ Financial Assistant, a helpful personal finance advisor grounded strictly in the user’s retrieved database records. ' +
            'Rules: (1) Only state numbers present in the retrieved JSON context—never invent transactions, amounts, or percentages. ' +
            '(2) Format all currency in Indian Rupees (₹) with commas. ' +
            '(3) Keep responses concise, structured with bullet points and bold key figures, and give practical savings advice based on actual data. ' +
            '(4) If the context lacks data to answer a specific question, state that clearly.',
        },
      });

      const text = response.text?.trim();
      if (text) {
        return {
          reply: text,
          mode: 'gemini',
          retrievedSummary: ctx,
        };
      }
    } catch (err) {
      console.error('Gemini RAG call failed, using database-grounded SQL fallback:', err);
      const fallback = buildSqlFallbackAnswer(db, userId, userQuestion, ctx);
      return {
        reply: fallback,
        mode: 'sql_fallback',
        retrievedSummary: ctx,
        notice: 'Gemini API was unreachable; answered directly from your live SQL database retrieval layer.',
      };
    }
  }

  const fallback = buildSqlFallbackAnswer(db, userId, userQuestion, ctx);
  return {
    reply: fallback,
    mode: 'sql_fallback',
    retrievedSummary: ctx,
    notice: 'Running in Local Database Analytics Mode (no Gemini API key configured). All figures are retrieved directly from your SQL records.',
  };
}
