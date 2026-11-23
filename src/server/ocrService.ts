import { createWorker } from 'tesseract.js';
import { parseReceiptText } from '../utils/receiptParser.ts';
import type { ParsedReceiptData } from '../types/finance.ts';

let sharedWorkerPromise: ReturnType<typeof createWorker> | null = null;

async function getOcrWorker() {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = createWorker('eng').catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

/**
 * Runs genuine local Tesseract OCR over an uploaded receipt image buffer
 * and extracts structured merchant, date, line items, tax, payment method,
 * and total validation without requiring any paid API.
 */
export async function extractReceiptFromImageBuffer(
  imageBuffer: Buffer,
  imageUrl: string
): Promise<ParsedReceiptData> {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(imageBuffer);
    const rawText = (data.text || '').trim();
    const confidence = typeof data.confidence === 'number' ? data.confidence / 100 : 0.7;

    if (!rawText || rawText.length < 4) {
      return {
        merchant: '',
        receiptDate: new Date().toISOString().slice(0, 10),
        items: [],
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        paymentMethod: 'UPI',
        suggestedCategory: 'Shopping',
        categoryConfidence: 0.4,
        rawText: '',
        ocrConfidence: Number(confidence.toFixed(2)),
        validation: {
          status: 'no_items',
          itemsSum: 0,
          expectedTotal: 0,
          difference: 0,
          message: 'OCR could not read clear text from this image. Please try a sharper, well-lit photo or enter the receipt fields manually below.',
        },
        warnings: [
          'Image text was unreadable or too blurry for Tesseract OCR. You can still enter the details manually in the confirmation form below.',
        ],
        imageUrl,
      };
    }

    const parsed = parseReceiptText(rawText, confidence);
    return {
      ...parsed,
      imageUrl,
    };
  } catch (err) {
    console.error('Tesseract OCR error:', err);
    throw new Error(
      'OCR engine encountered an error while processing the uploaded receipt image. Ensure the file is a valid JPG or PNG.'
    );
  }
}
