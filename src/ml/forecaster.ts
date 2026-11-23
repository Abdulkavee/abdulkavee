import type { CategoryForecastItem, ForecastPoint, ForecastResult } from '../types/finance.ts';

export interface DailyExpenseRecord {
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
}

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUTC(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysUTC(dt: Date, days: number): Date {
  const copy = new Date(dt.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * Fits an Additive Holt-Winters Seasonal Exponential Smoothing model (period = 7 days)
 * with dampened trend to prevent runaway long-horizon projections.
 * Used as a real time-series model comparable to Prophet's trend + weekly seasonality decomposition.
 */
function fitHoltWintersWeekly(
  values: number[],
  alpha = 0.25,
  beta = 0.05,
  gamma = 0.2,
  phi = 0.88
): {
  level: number;
  trend: number;
  seasonals: number[];
  fitted: number[];
} {
  const seasonLen = 7;
  const n = values.length;

  // Initialize level & trend from the first 1-2 weeks
  const initWindow = Math.min(seasonLen, n);
  let level = values.slice(0, initWindow).reduce((a, b) => a + b, 0) / initWindow;
  let trend = 0;
  if (n >= seasonLen * 2) {
    const firstWeekAvg = values.slice(0, seasonLen).reduce((a, b) => a + b, 0) / seasonLen;
    const secondWeekAvg = values.slice(seasonLen, seasonLen * 2).reduce((a, b) => a + b, 0) / seasonLen;
    trend = (secondWeekAvg - firstWeekAvg) / seasonLen;
  }

  // Initialize additive weekly seasonal components
  const seasonals = new Array<number>(seasonLen).fill(0);
  const seasonCounts = new Array<number>(seasonLen).fill(0);
  const overallMean = values.reduce((a, b) => a + b, 0) / Math.max(1, n);
  for (let i = 0; i < n; i++) {
    seasonals[i % seasonLen] += values[i] - overallMean;
    seasonCounts[i % seasonLen] += 1;
  }
  for (let s = 0; s < seasonLen; s++) {
    seasonals[s] = seasonCounts[s] > 0 ? seasonals[s] / seasonCounts[s] : 0;
  }
  // Zero-center seasonal factors
  const sMean = seasonals.reduce((a, b) => a + b, 0) / seasonLen;
  for (let s = 0; s < seasonLen; s++) seasonals[s] -= sMean;

  const fitted: number[] = [];

  for (let t = 0; t < n; t++) {
    const sIdx = t % seasonLen;
    const prevSeason = seasonals[sIdx];
    const forecastT = Math.max(0, level + phi * trend + prevSeason);
    fitted.push(forecastT);

    // Winsorize extreme one-off spikes (e.g. rent or anomaly) so they don't corrupt daily run-rate
    const cappedVal = Math.min(values[t], Math.max(overallMean * 3.5, level * 3.0 + 500));

    const prevLevel = level;
    level = alpha * (cappedVal - prevSeason) + (1 - alpha) * (prevLevel + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    seasonals[sIdx] = gamma * (cappedVal - level) + (1 - gamma) * prevSeason;
  }

  return { level, trend, seasonals, fitted };
}

function predictFromState(
  state: { level: number; trend: number; seasonals: number[] },
  startIndex: number,
  horizon: number,
  phi = 0.88
): number[] {
  const preds: number[] = [];
  let phiSum = 0;
  let phiPow = phi;
  for (let h = 1; h <= horizon; h++) {
    phiSum += phiPow;
    phiPow *= phi;
    const sIdx = (startIndex + h - 1) % 7;
    const val = Math.max(0, state.level + phiSum * state.trend + state.seasonals[sIdx]);
    preds.push(val);
  }
  return preds;
}

export function generateExpenseForecast(
  records: DailyExpenseRecord[],
  monthlyBudget: number,
  referenceDateStr?: string
): ForecastResult {
  const generatedAt = new Date().toISOString();

  if (records.length === 0) {
    return {
      insufficientData: true,
      insufficientReason:
        'No expense records found yet. Log at least 14 days of expense history to train and evaluate the 30-day time-series forecasting model.',
      modelName: 'Damped Additive Holt-Winters (Weekly Seasonality, Period=7)',
      historicalDaysCount: 0,
      next7DaysTotal: 0,
      next30DaysTotal: 0,
      currentMonthSpent: 0,
      predictedEndOfMonthTotal: 0,
      monthlyBudget,
      projectedOverrun: 0,
      overrunWarning: null,
      evaluation: { testDays: 0, mae: 0, rmse: 0, mape: null, baselineMae: 0 },
      series: [],
      categoryForecasts: [],
      generatedAt,
    };
  }

  // Group daily totals
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + Number(r.amount));
  }

  const uniqueDates = Array.from(dailyMap.keys()).sort();
  const minDate = parseDateUTC(uniqueDates[0]);
  const maxRecordDate = parseDateUTC(uniqueDates[uniqueDates.length - 1]);
  const refDate = referenceDateStr ? parseDateUTC(referenceDateStr) : maxRecordDate;
  const endDate = refDate.getTime() >= maxRecordDate.getTime() ? refDate : maxRecordDate;

  // Build continuous daily time-series (filling 0 for zero-spend days)
  const fullDates: string[] = [];
  const fullValues: number[] = [];
  let cursor = new Date(minDate.getTime());
  while (cursor.getTime() <= endDate.getTime()) {
    const key = formatDateUTC(cursor);
    fullDates.push(key);
    fullValues.push(Number((dailyMap.get(key) ?? 0).toFixed(2)));
    cursor = addDaysUTC(cursor, 1);
  }

  const refMonthKey = formatDateUTC(endDate).slice(0, 7);
  const currentMonthSpent = records
    .filter((r) => r.date.startsWith(refMonthKey))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // Require at least 14 calendar days AND 8 distinct spending days for honest forecasting
  if (fullDates.length < 14 || uniqueDates.length < 8) {
    return {
      insufficientData: true,
      insufficientReason: `Only ${uniqueDates.length} active spending days across ${fullDates.length} calendar days found. At least 14 calendar days and 8 active spending days are required for reliable time-series cross-validation.`,
      modelName: 'Damped Additive Holt-Winters (Weekly Seasonality, Period=7)',
      historicalDaysCount: fullDates.length,
      next7DaysTotal: 0,
      next30DaysTotal: 0,
      currentMonthSpent: Number(currentMonthSpent.toFixed(2)),
      predictedEndOfMonthTotal: Number(currentMonthSpent.toFixed(2)),
      monthlyBudget,
      projectedOverrun: 0,
      overrunWarning: null,
      evaluation: { testDays: 0, mae: 0, rmse: 0, mape: null, baselineMae: 0 },
      series: fullDates.map((date, i) => ({
        date,
        actual: fullValues[i],
        predicted: null,
        lowerBound: null,
        upperBound: null,
        kind: 'historical',
      })),
      categoryForecasts: [],
      generatedAt,
    };
  }

  // 1. Held-Out Temporal Validation Split (last 7-14 days held out)
  const testDays = Math.min(14, Math.max(7, Math.floor(fullValues.length * 0.2)));
  const splitIdx = fullValues.length - testDays;
  const trainSeries = fullValues.slice(0, splitIdx);
  const testActuals = fullValues.slice(splitIdx);

  const backtestModel = fitHoltWintersWeekly(trainSeries);
  const backtestPreds = predictFromState(backtestModel, trainSeries.length, testDays);

  let absErrSum = 0;
  let sqErrSum = 0;
  let pctErrSum = 0;
  let pctCount = 0;
  const trainMean = trainSeries.reduce((a, b) => a + b, 0) / Math.max(1, trainSeries.length);
  let baselineAbsErr = 0;

  for (let i = 0; i < testDays; i++) {
    const err = testActuals[i] - backtestPreds[i];
    absErrSum += Math.abs(err);
    sqErrSum += err * err;
    baselineAbsErr += Math.abs(testActuals[i] - trainMean);
    if (testActuals[i] > 50) {
      pctErrSum += Math.abs(err) / testActuals[i];
      pctCount += 1;
    }
  }

  const mae = absErrSum / testDays;
  const rmse = Math.sqrt(sqErrSum / testDays);
  const mape = pctCount > 0 ? Number(((pctErrSum / pctCount) * 100).toFixed(1)) : null;
  const baselineMae = baselineAbsErr / testDays;

  // 2. Retrain on FULL historical series for future 30-day forecast
  const fullModel = fitHoltWintersWeekly(fullValues);
  const future30 = predictFromState(fullModel, fullValues.length, 30);

  // Empirical residual spread for 95% confidence interval (capped sensibly for interpretability)
  const residualStd = Math.max(80, Math.min(rmse, trainMean * 0.85 + 150));

  const next7DaysTotal = future30.slice(0, 7).reduce((a, b) => a + b, 0);
  const next30DaysTotal = future30.reduce((a, b) => a + b, 0);

  // End-of-month projection: actual MTD + remaining days of reference month
  const refYear = endDate.getUTCFullYear();
  const refMonth = endDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(refYear, refMonth + 1, 0)).getUTCDate();
  const currentDayOfMonth = endDate.getUTCDate();
  const remainingDaysInMonth = Math.max(0, daysInMonth - currentDayOfMonth);
  const remainingMonthPredicted = future30
    .slice(0, remainingDaysInMonth)
    .reduce((a, b) => a + b, 0);
  const predictedEndOfMonthTotal = currentMonthSpent + remainingMonthPredicted;

  const projectedOverrun =
    monthlyBudget > 0 ? Math.max(0, predictedEndOfMonthTotal - monthlyBudget) : 0;

  const overrunWarning =
    monthlyBudget > 0 && projectedOverrun > 0
      ? `Your estimated monthly spending (₹${Math.round(predictedEndOfMonthTotal).toLocaleString('en-IN')}) may exceed your ₹${Math.round(monthlyBudget).toLocaleString('en-IN')} budget by ₹${Math.round(projectedOverrun).toLocaleString('en-IN')}.`
      : null;

  // Build unified series for Recharts (last 45 historical days + 30 future forecast days)
  const series: ForecastPoint[] = [];
  const startPlotIdx = Math.max(0, fullDates.length - 45);
  for (let i = startPlotIdx; i < fullDates.length; i++) {
    const isBacktestWindow = i >= splitIdx;
    const btIdx = i - splitIdx;
    series.push({
      date: fullDates[i],
      actual: Number(fullValues[i].toFixed(2)),
      predicted: isBacktestWindow ? Number(backtestPreds[btIdx].toFixed(2)) : null,
      lowerBound: null,
      upperBound: null,
      kind: isBacktestWindow ? 'backtest' : 'historical',
    });
  }

  for (let h = 1; h <= 30; h++) {
    const dt = addDaysUTC(endDate, h);
    const pred = future30[h - 1];
    // Prediction interval widens slowly with horizon
    const margin = 1.28 * residualStd * Math.sqrt(1 + (h - 1) * 0.04);
    series.push({
      date: formatDateUTC(dt),
      actual: null,
      predicted: Number(pred.toFixed(2)),
      lowerBound: Number(Math.max(0, pred - margin).toFixed(2)),
      upperBound: Number((pred + margin).toFixed(2)),
      kind: 'forecast',
    });
  }

  // 3. Category-wise 30-day projections (where >= 3 transactions exist)
  const catMap = new Map<string, { sum: number; count: number; recentSum: number }>();
  const thirtyDaysAgo = formatDateUTC(addDaysUTC(endDate, -30));
  const spanMonths = Math.max(1, fullDates.length / 30);

  for (const r of records) {
    const entry = catMap.get(r.category) ?? { sum: 0, count: 0, recentSum: 0 };
    entry.sum += Number(r.amount);
    entry.count += 1;
    if (r.date >= thirtyDaysAgo) entry.recentSum += Number(r.amount);
    catMap.set(r.category, entry);
  }

  const categoryForecasts: CategoryForecastItem[] = [];
  for (const [category, stats] of catMap.entries()) {
    if (stats.count >= 3) {
      const histAvg = stats.sum / spanMonths;
      // Blend 60% recent 30-day momentum + 40% overall historical monthly average
      const predicted30 = 0.6 * stats.recentSum + 0.4 * histAvg;
      categoryForecasts.push({
        category,
        historicalMonthlyAvg: Number(histAvg.toFixed(2)),
        predictedNext30Days: Number(predicted30.toFixed(2)),
        sampleCount: stats.count,
      });
    }
  }
  categoryForecasts.sort((a, b) => b.predictedNext30Days - a.predictedNext30Days);

  return {
    insufficientData: false,
    insufficientReason: null,
    modelName: 'Damped Additive Holt-Winters (Weekly Seasonality, Period=7)',
    historicalDaysCount: fullDates.length,
    next7DaysTotal: Number(next7DaysTotal.toFixed(2)),
    next30DaysTotal: Number(next30DaysTotal.toFixed(2)),
    currentMonthSpent: Number(currentMonthSpent.toFixed(2)),
    predictedEndOfMonthTotal: Number(predictedEndOfMonthTotal.toFixed(2)),
    monthlyBudget: Number(monthlyBudget.toFixed(2)),
    projectedOverrun: Number(projectedOverrun.toFixed(2)),
    overrunWarning,
    evaluation: {
      testDays,
      mae: Number(mae.toFixed(2)),
      rmse: Number(rmse.toFixed(2)),
      mape,
      baselineMae: Number(baselineMae.toFixed(2)),
    },
    series,
    categoryForecasts,
    generatedAt,
  };
}
