import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategorizer } from './categorizer.ts';
import { generateExpenseForecast } from './forecaster.ts';
import { detectSpendingAnomalies } from './anomalyDetector.ts';
import {
  detectRecurringPatterns,
  generateSavingsRecommendations,
  runWhatIfSimulation,
} from './recommendations.ts';

test('ML Categorizer classifies core Indian & global merchants accurately', () => {
  const model = createCategorizer();
  assert.equal(model.predict('Swiggy Biryani Dinner Order').predictedCategory, 'Food');
  assert.equal(model.predict('Uber Auto Ride Commute').predictedCategory, 'Transport');
  assert.equal(model.predict('Amazon Online Shopping Headphones').predictedCategory, 'Shopping');
  assert.equal(model.predict('Electricity Board BESCOM Power Bill').predictedCategory, 'Bills');
  assert.equal(model.predict('College Fees Semester Tuition').predictedCategory, 'Education');

  const res = model.predict('Swiggy Dinner');
  assert.equal(res.calibrated, true);
  assert.ok(res.confidence > 0.25 && res.confidence <= 0.96);
});

test('ML Categorizer adapts via online user feedback corrections', () => {
  const model = createCategorizer([
    { text: 'Campus Print Hub Spiral Binding', category: 'Education' },
    { text: 'Campus Print Hub Project Report', category: 'Education' },
  ]);
  assert.equal(model.predict('Campus Print Hub').predictedCategory, 'Education');
});

test('30-Day Forecaster handles insufficient data honestly', () => {
  const tinyHistory = [
    { date: '2026-11-18', amount: 250, category: 'Food' },
    { date: '2026-11-19', amount: 300, category: 'Transport' },
  ];
  const res = generateExpenseForecast(tinyHistory, 15000, '2026-11-20');
  assert.equal(res.insufficientData, true);
  assert.ok(res.insufficientReason && res.insufficientReason.includes('14'));
});

test('30-Day Forecaster computes valid forecasts, held-out MAE/RMSE, and overrun warnings', () => {
  const records = [];
  const start = new Date(Date.UTC(2026, 8, 1)); // Sep 1, 2026 -> 80 days
  for (let i = 0; i < 80; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    const dow = dt.getUTCDay();
    const amt = dow === 0 || dow === 6 ? 780 : 480;
    records.push({ date: iso, amount: amt, category: i % 2 === 0 ? 'Food' : 'Shopping' });
  }

  const forecast = generateExpenseForecast(records, 12000, '2026-11-20');
  assert.equal(forecast.insufficientData, false);
  assert.ok(forecast.next7DaysTotal > 2000);
  assert.ok(forecast.next30DaysTotal > 10000);
  assert.ok(forecast.evaluation.testDays >= 7);
  assert.ok(forecast.evaluation.mae >= 0);
  assert.ok(forecast.evaluation.rmse >= forecast.evaluation.mae);
  assert.ok(forecast.projectedOverrun > 0);
  assert.ok(forecast.overrunWarning && forecast.overrunWarning.includes('exceed'));

  const futurePoints = forecast.series.filter((p) => p.kind === 'forecast');
  assert.equal(futurePoints.length, 30);
  for (const pt of futurePoints) {
    assert.ok((pt.lowerBound ?? 0) <= (pt.predicted ?? 0));
    assert.ok((pt.predicted ?? 0) <= (pt.upperBound ?? 0));
  }
});

test('Anomaly Detector flags severe category outlier as Unusual Spending Activity (never fraud)', () => {
  const txs = [
    { id: 1, date: '2026-10-01', merchant: 'Swiggy', description: 'Lunch', category: 'Food', amount: 240, type: 'expense' as const },
    { id: 2, date: '2026-10-05', merchant: 'Zomato', description: 'Dinner', category: 'Food', amount: 290, type: 'expense' as const },
    { id: 3, date: '2026-10-10', merchant: 'Canteen', description: 'Meal', category: 'Food', amount: 180, type: 'expense' as const },
    { id: 4, date: '2026-10-15', merchant: 'Swiggy', description: 'Biryani', category: 'Food', amount: 310, type: 'expense' as const },
    { id: 5, date: '2026-10-20', merchant: 'Cafe', description: 'Coffee', category: 'Food', amount: 220, type: 'expense' as const },
    { id: 6, date: '2026-11-12', merchant: 'Grand Banquet', description: 'Large Catering Bill', category: 'Food', amount: 6800, type: 'expense' as const },
  ];
  const anomalies = detectSpendingAnomalies(txs);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].transactionId, 6);
  assert.equal(anomalies[0].label, 'Unusual Spending Activity');
  assert.ok(!anomalies[0].reason.toLowerCase().includes('fraud'));
});

test('What-If Budget Simulator reproduces exact prompt example math', () => {
  const result = runWhatIfSimulation({
    currentIncome: 25000,
    simulatedIncome: 25000,
    currentMonthlyBudget: 20000,
    simulatedMonthlyBudget: 20000,
    categories: [
      { category: 'Shopping', actualSpent: 6000, simulatedBudget: 4500 }, // -1500
      { category: 'Food', actualSpent: 5000, simulatedBudget: 4500 },     // -500
      { category: 'Rent', actualSpent: 9000, simulatedBudget: 9000 },
    ],
  });
  assert.equal(result.currentExpenses, 20000);
  assert.equal(result.currentSavings, 5000);
  assert.equal(result.simulatedExpenses, 18000);
  assert.equal(result.simulatedSavings, 7000);
  assert.equal(result.savingsDelta, 2000);
});

test('Recurring Pattern Detector identifies monthly rent and broadband bills', () => {
  const txs = [
    { id: 1, date: '2026-09-05', merchant: 'Airtel Fiber', description: 'Broadband', category: 'Bills', amount: 999, type: 'expense' as const },
    { id: 2, date: '2026-10-05', merchant: 'Airtel Fiber', description: 'Broadband', category: 'Bills', amount: 999, type: 'expense' as const },
    { id: 3, date: '2026-11-05', merchant: 'Airtel Fiber', description: 'Broadband', category: 'Bills', amount: 999, type: 'expense' as const },
  ];
  const detected = detectRecurringPatterns(txs);
  assert.equal(detected.length, 1);
  assert.equal(detected[0].frequency, 'monthly');
  assert.equal(detected[0].estimatedAmount, 999);
  assert.equal(detected[0].nextExpectedDate, '2026-12-05');
});

test('Savings Recommendations engine detects month-over-month spending increases', () => {
  const txs = [
    { id: 1, date: '2026-10-10', merchant: 'Swiggy', description: 'Food', category: 'Food', amount: 2000, type: 'expense' as const },
    { id: 2, date: '2026-11-10', merchant: 'Swiggy', description: 'Food', category: 'Food', amount: 2800, type: 'expense' as const },
  ];
  const out = generateSavingsRecommendations(txs, '2026-11', '2026-10', 25000);
  assert.ok(out.recommendations.some((r) => r.category === 'Food' && r.title.includes('40%')));
});
