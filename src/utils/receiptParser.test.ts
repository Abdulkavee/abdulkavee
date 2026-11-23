import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from './receiptParser.ts';

test('Receipt parser accurately parses the ABC Supermarket example and validates item sum', () => {
  const ocrText = `
    ABC Supermarket
    Date: 20 November 2026
    Milk: ₹60
    Bread: ₹40
    Rice: ₹120
    Total: ₹220
    Paid via UPI
  `;
  const parsed = parseReceiptText(ocrText, 0.92);
  assert.equal(parsed.merchant, 'ABC Supermarket');
  assert.equal(parsed.receiptDate, '2026-11-20');
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].name, 'Milk');
  assert.equal(parsed.items[0].totalPrice, 60);
  assert.equal(parsed.items[1].name, 'Bread');
  assert.equal(parsed.items[1].totalPrice, 40);
  assert.equal(parsed.items[2].name, 'Rice');
  assert.equal(parsed.items[2].totalPrice, 120);
  assert.equal(parsed.totalAmount, 220);
  assert.equal(parsed.paymentMethod, 'UPI');
  assert.equal(parsed.validation.status, 'matched');
  assert.ok(parsed.suggestedCategory === 'Shopping' || parsed.suggestedCategory === 'Food');
});

test('Receipt parser detects item sum vs total mismatch caused by OCR misread', () => {
  const ocrText = `
    City Mart
    15/11/2026
    Coffee Powder 180
    Sugar 65
    Total 345
  `;
  const parsed = parseReceiptText(ocrText, 0.78);
  assert.equal(parsed.merchant, 'City Mart');
  assert.equal(parsed.receiptDate, '2026-11-15');
  assert.equal(parsed.validation.status, 'mismatch');
  assert.equal(parsed.validation.difference, 100);
  assert.ok(parsed.warnings.length > 0);
});
