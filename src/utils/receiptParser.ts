import { createCategorizer } from '../ml/categorizer.ts';
import type { ParsedReceiptData, ReceiptItem } from '../types/finance.ts';

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function cleanPriceToken(raw: string): number | null {
  // Handle common OCR confusions in numeric price fields (O -> 0, l/I -> 1, S -> 5)
  const normalized = raw
    .replace(/[₹$€£]/g, '')
    .replace(/\b(?:rs\.?|inr)\b/gi, '')
    .replace(/[()]/g, '')
    .replace(/,/g, '')
    .replace(/[oO](?=\d|\.)/g, '0')
    .replace(/(?<=\d|\.)[oO]/g, '0')
    .trim();

  const val = Number.parseFloat(normalized);
  if (!Number.isFinite(val) || val <= 0 || val > 500000) return null;
  return Number(val.toFixed(2));
}

export function extractReceiptDate(rawText: string, fallbackDate?: string): string {
  const defaultDate = fallbackDate ?? new Date().toISOString().slice(0, 10);

  // Format 1: 20 November 2026 or 20 Nov 2026
  const dmyWord = rawText.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(\d{4})\b/i
  );
  if (dmyWord) {
    const day = dmyWord[1].padStart(2, '0');
    const month = MONTH_MAP[dmyWord[2].toLowerCase()];
    const year = dmyWord[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // Format 2: OCT 26, 2024 or November 20, 2026
  const mdyWord = rawText.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})[,\s]+(\d{4})\b/i
  );
  if (mdyWord) {
    const month = MONTH_MAP[mdyWord[1].toLowerCase()];
    const day = mdyWord[2].padStart(2, '0');
    const year = mdyWord[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // Format 3: YYYY-MM-DD or YYYY/MM/DD
  const iso = rawText.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  // Format 4: DD/MM/YYYY or DD-MM-YYYY
  const dmyNum = rawText.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (dmyNum) {
    const a = Number(dmyNum[1]);
    const b = Number(dmyNum[2]);
    // Assume DD/MM/YYYY (standard in India) unless second number > 12
    const day = b > 12 ? String(b).padStart(2, '0') : String(a).padStart(2, '0');
    const month = b > 12 ? String(a).padStart(2, '0') : String(b).padStart(2, '0');
    return `${dmyNum[3]}-${month}-${day}`;
  }

  return defaultDate;
}

export function extractPaymentMethod(rawText: string): string {
  const lower = rawText.toLowerCase();
  if (/\b(upi|gpay|phonepe|paytm|bhim)\b/.test(lower)) return 'UPI';
  if (/\b(credit\s*card|visa|mastercard|amex|rupay)\b/.test(lower)) return 'Credit Card';
  if (/\b(debit\s*card)\b/.test(lower)) return 'Debit Card';
  if (/\b(net\s*banking|neft|imps)\b/.test(lower)) return 'Net Banking';
  if (/\b(cash|tendered|change\s*due)\b/.test(lower)) return 'Cash';
  return 'UPI';
}

const NON_ITEM_LINE_REGEX =
  /\b(total|grand\s*total|net\s*total|sub\s*total|subtotal|amount\s*payable|balance\s*due|tax|gst|cgst|sgst|igst|vat|discount|savings|round\s*off|paid|change|cash|visa|mastercard|upi|invoice|bill\s*no|receipt|date|time|phone|tel|gstin|thank\s*you|visit\s*again|items?\s*:)\b/i;

/**
 * Parses raw Tesseract/EasyOCR receipt text into structured merchant, date,
 * line items, tax, total, payment method, and ML-suggested category,
 * and cross-checks item sum against extracted total.
 */
export function parseReceiptText(
  rawText: string,
  ocrConfidence = 0.85,
  fallbackDate?: string
): ParsedReceiptData {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const warnings: string[] = [];

  if (lines.length === 0) {
    warnings.push('No readable text detected. Try retaking the photo with better lighting and flat alignment.');
  }

  // 1. Extract Merchant Name (first meaningful non-numeric, non-header line)
  let merchant = 'Unknown Merchant';
  for (const line of lines.slice(0, 6)) {
    const explicitMerchant = line.match(/^(?:merchant|shop|store)\s*[:\-]\s*(.+)$/i);
    if (explicitMerchant) {
      merchant = explicitMerchant[1].trim();
      break;
    }
    if (
      line.length >= 3 &&
      !/^[\d\s\-/:.]+$/.test(line) &&
      !/^(tax\s*invoice|cash\s*memo|receipt|date|bill|gstin|tel|phone|welcome)/i.test(line)
    ) {
      merchant = line.replace(/[^a-zA-Z0-9\s&'.-]/g, '').trim() || merchant;
      break;
    }
  }

  // 2. Extract Receipt Date & Payment Method
  const receiptDate = extractReceiptDate(rawText, fallbackDate);
  const paymentMethod = extractPaymentMethod(rawText);

  // 3. Extract Total, Subtotal, Tax, and Individual Line Items
  let extractedTotal = 0;
  let extractedSubtotal = 0;
  let taxAmount = 0;
  const items: ReceiptItem[] = [];

  for (const line of lines) {
    // Match trailing price token on line: e.g. "Milk ₹60", "Milk: Rs. 60.00", "ALMOND MILK ($4.49)"
    const priceMatch = line.match(
      /^(.*?)(?:[:\-]|\s)\s*\(?((?:₹|rs\.?|inr|\$|€|£)?\s*[0-9oO]+(?:,[0-9]{2,3})*(?:\.[0-9oO]{1,2})?)\)?\s*$/i
    );

    if (!priceMatch) continue;
    const labelPart = priceMatch[1].replace(/[:\-]+$/, '').trim();
    const amountVal = cleanPriceToken(priceMatch[2]);
    if (amountVal === null || !labelPart) continue;

    // Classify summary lines vs actual purchased items
    if (/\b(grand\s*total|net\s*total|total\s*amount|amount\s*payable|final\s*total|^total$)\b/i.test(labelPart)) {
      extractedTotal = Math.max(extractedTotal, amountVal);
      continue;
    }
    if (/\b(sub\s*total|subtotal)\b/i.test(labelPart)) {
      extractedSubtotal = amountVal;
      continue;
    }
    if (/\b(tax|gst|cgst|sgst|igst|vat|sales\s*tax)\b/i.test(labelPart)) {
      taxAmount = Number((taxAmount + amountVal).toFixed(2));
      continue;
    }
    if (NON_ITEM_LINE_REGEX.test(labelPart)) {
      continue;
    }

    // Parse optional quantity prefix/suffix like "2 x Milk" or "Bread (2)"
    let quantity = 1;
    let itemName = labelPart;
    const qtyPrefix = labelPart.match(/^(\d+)\s*[xX*]\s+(.+)$/);
    if (qtyPrefix) {
      quantity = Math.max(1, Number(qtyPrefix[1]));
      itemName = qtyPrefix[2].trim();
    }

    // Ignore very short garbage OCR artifacts
    if (itemName.replace(/[^a-zA-Z]/g, '').length < 2) continue;

    items.push({
      name: itemName,
      quantity,
      unitPrice: Number((amountVal / quantity).toFixed(2)),
      totalPrice: amountVal,
    });
  }

  const itemsSum = Number(items.reduce((sum, it) => sum + it.totalPrice, 0).toFixed(2));
  const subtotal = extractedSubtotal > 0 ? extractedSubtotal : itemsSum;
  const totalAmount =
    extractedTotal > 0
      ? extractedTotal
      : Number((subtotal + taxAmount).toFixed(2));

  // 4. Cross-check validation between items sum (+ tax) and extracted total
  let validationStatus: 'matched' | 'mismatch' | 'no_items' = 'no_items';
  let difference = 0;
  let validationMessage = 'No individual line items were detected. Please review and confirm the total manually.';

  if (items.length > 0) {
    const expectedFromItems = Number((itemsSum + taxAmount).toFixed(2));
    difference = Number(Math.abs(totalAmount - expectedFromItems).toFixed(2));
    const matchesWithTax = difference <= 1.5;
    const matchesWithoutTax = Math.abs(totalAmount - itemsSum) <= 1.5;

    if (matchesWithTax || matchesWithoutTax) {
      validationStatus = 'matched';
      difference = 0;
      validationMessage = `Verified: ${items.length} extracted items (${taxAmount > 0 ? `₹${itemsSum.toFixed(2)} + ₹${taxAmount.toFixed(2)} tax` : `₹${itemsSum.toFixed(2)}`}) match the receipt total of ₹${totalAmount.toFixed(2)}.`;
    } else {
      validationStatus = 'mismatch';
      validationMessage = `OCR discrepancy detected: items sum + tax is ₹${expectedFromItems.toFixed(2)}, while extracted total is ₹${totalAmount.toFixed(2)} (difference ₹${difference.toFixed(2)}). Please correct before saving.`;
      warnings.push(validationMessage);
    }
  }

  if (ocrConfidence < 0.65) {
    warnings.push('Low OCR confidence (image may be blurry, rotated, or dimly lit). Please double-check all extracted fields.');
  }

  // 5. Predict category from merchant + item descriptions
  const categorizer = createCategorizer();
  const itemText = items.map((i) => i.name).join(' ');
  const prediction = categorizer.predict(`${merchant} ${itemText}`, merchant);

  return {
    merchant,
    receiptDate,
    items,
    subtotal,
    taxAmount,
    totalAmount,
    paymentMethod,
    suggestedCategory: prediction.predictedCategory,
    categoryConfidence: prediction.confidence,
    rawText,
    ocrConfidence: Number(ocrConfidence.toFixed(2)),
    validation: {
      status: validationStatus,
      itemsSum,
      expectedTotal: totalAmount,
      difference,
      message: validationMessage,
    },
    warnings,
  };
}
