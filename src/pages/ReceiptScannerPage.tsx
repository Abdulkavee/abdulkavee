import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Plus,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { Category, ParsedReceiptData, ReceiptItem, ReceiptRecord } from '../types/finance';
import { formatDateShort, formatINR, todayIsoDate } from '../utils/format';

async function renderSampleReceiptFile(sample: 'supermarket' | 'pharmacy'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 580;
  canvas.height = 660;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#111827';
  const lines =
    sample === 'supermarket'
      ? [
          { text: 'ABC SUPERMARKET', size: 30, bold: true, y: 70 },
          { text: 'MG Road, Bengaluru', size: 18, bold: false, y: 105 },
          { text: 'Date: 20 November 2026', size: 20, bold: false, y: 155 },
          { text: '-----------------------------------------', size: 18, bold: false, y: 195 },
          { text: 'Milk                         Rs. 60.00', size: 22, bold: false, y: 245 },
          { text: 'Bread                        Rs. 40.00', size: 22, bold: false, y: 290 },
          { text: 'Rice                         Rs. 120.00', size: 22, bold: false, y: 335 },
          { text: '-----------------------------------------', size: 18, bold: false, y: 380 },
          { text: 'Subtotal                     Rs. 220.00', size: 22, bold: false, y: 425 },
          { text: 'Total                        Rs. 220.00', size: 26, bold: true, y: 475 },
          { text: 'Paid via UPI', size: 20, bold: false, y: 535 },
          { text: 'Thank you for shopping with us', size: 18, bold: false, y: 590 },
        ]
      : [
          { text: 'APOLLO PHARMACY', size: 30, bold: true, y: 70 },
          { text: 'Indiranagar, Bengaluru', size: 18, bold: false, y: 105 },
          { text: 'Date: 19 November 2026', size: 20, bold: false, y: 155 },
          { text: '-----------------------------------------', size: 18, bold: false, y: 195 },
          { text: 'Vitamin D3 Tablets           Rs. 210.00', size: 22, bold: false, y: 245 },
          { text: 'Paracetamol Strip            Rs. 45.00', size: 22, bold: false, y: 290 },
          { text: 'Cough Syrup                  Rs. 125.00', size: 22, bold: false, y: 335 },
          { text: '-----------------------------------------', size: 18, bold: false, y: 380 },
          { text: 'GST                          Rs. 20.00', size: 21, bold: false, y: 425 },
          { text: 'Total                        Rs. 400.00', size: 26, bold: true, y: 475 },
          { text: 'Paid via Debit Card', size: 20, bold: false, y: 535 },
        ];

  for (const line of lines) {
    ctx.font = `${line.bold ? 'bold ' : ''}${line.size}px "Courier New", monospace`;
    ctx.fillText(line.text, 44, line.y);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to render receipt PNG');
  return new File(
    [blob],
    sample === 'supermarket' ? 'abc_supermarket_receipt.png' : 'apollo_pharmacy_receipt.png',
    { type: 'image/png' }
  );
}

export function ReceiptScannerPage({ onSaved }: { onSaved: () => void }) {
  const { pushToast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedReceiptData | null>(null);

  const [merchant, setMerchant] = useState('');
  const [receiptDate, setReceiptDate] = useState(todayIsoDate());
  const [categoryName, setCategoryName] = useState('Shopping');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedReceipts, setSavedReceipts] = useState<ReceiptRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const loadMetadata = async () => {
    try {
      const [catRes, recRes] = await Promise.all([api.getCategories(), api.getReceipts()]);
      setCategories(catRes.categories.filter((c) => c.type === 'expense'));
      setSavedReceipts(recRes.receipts);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadMetadata();
  }, []);

  const processFile = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      const msg = 'Please upload a JPG, JPEG, or PNG receipt image.';
      setError(msg);
      pushToast({ title: 'Unsupported file', description: msg, variant: 'warning' });
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setScanning(true);

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    try {
      const res = await api.scanReceipt(file);
      setFileName(res.fileName);
      setParsed(res.parsed);
      setMerchant(res.parsed.merchant);
      setReceiptDate(res.parsed.receiptDate || todayIsoDate());
      setCategoryName(res.parsed.suggestedCategory || 'Shopping');
      setPaymentMethod(res.parsed.paymentMethod || 'UPI');
      setTaxAmount(res.parsed.taxAmount || 0);
      setTotalAmount(res.parsed.totalAmount || 0);
      setItems(res.parsed.items || []);
      pushToast({
        title: 'OCR extraction complete',
        description: `Detected ${res.parsed.merchant} (${formatINR(res.parsed.totalAmount, true)}). Verify before saving.`,
        variant: 'info',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR scanning failed. Please try a clearer image.';
      setError(msg);
      pushToast({ title: 'OCR failed', description: msg, variant: 'error' });
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleScanSample = async (sample: 'supermarket' | 'pharmacy') => {
    try {
      const sampleFile = await renderSampleReceiptFile(sample);
      await processFile(sampleFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not render sample receipt.');
    }
  };

  const itemsSum = Number(items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0).toFixed(2));
  const expectedTotalFromItems = Number((itemsSum + (Number(taxAmount) || 0)).toFixed(2));
  const discrepancy = Number(Math.abs((Number(totalAmount) || 0) - expectedTotalFromItems).toFixed(2));
  const isTotalMatched =
    items.length > 0 && (discrepancy <= 1.5 || Math.abs((Number(totalAmount) || 0) - itemsSum) <= 1.5);

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!merchant.trim()) {
      setError('Please enter the merchant or shop name.');
      return;
    }
    if (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) <= 0) {
      setError('Total amount must be greater than ₹0.');
      return;
    }

    setSaving(true);
    try {
      await api.confirmReceipt({
        fileName,
        imageUrl: parsed?.imageUrl || '',
        merchant: merchant.trim(),
        receiptDate,
        items,
        subtotal: itemsSum || totalAmount,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount),
        paymentMethod,
        categoryName,
        suggestedCategory: parsed?.suggestedCategory || categoryName,
        categoryConfidence: parsed?.categoryConfidence || 0.8,
        rawText: parsed?.rawText || '',
        ocrConfidence: parsed?.ocrConfidence || 0.85,
      });

      const msg = `Verified receipt from ${merchant.trim()} (${formatINR(Number(totalAmount), true)}) saved to your ledger.`;
      setSuccessMsg(msg);
      pushToast({ title: 'Receipt verified & saved', description: msg, variant: 'success' });
      setParsed(null);
      setPreviewUrl(null);
      await loadMetadata();
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save verified receipt.';
      setError(msg);
      pushToast({ title: 'Save failed', description: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            AI Receipt Scanner (Tesseract OCR)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Drag and drop a receipt photo or capture with your camera. Review and verify extracted items before saving—unverified scans are never auto-saved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleScanSample('supermarket')}
            className="px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-sky-300 bg-blue-500/12 hover:bg-blue-500/20 border border-blue-500/25 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap disabled:opacity-60"
          >
            Test Real OCR: ABC Supermarket
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleScanSample('pharmacy')}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap disabled:opacity-60"
          >
            Test Real OCR: Apollo Pharmacy
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-emerald-500/12 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Drag-and-Drop Upload / Camera Capture & Animated Scan Preview */}
        <section className="lg:col-span-5 min-w-0 p-6 glass-card rounded-2xl space-y-4">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            1. Upload or Capture Receipt
          </h3>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`p-7 border-2 border-dashed rounded-2xl text-center transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-500/12 scale-[1.01]'
                : 'border-slate-300 dark:border-white/15 bg-slate-900/[0.02] dark:bg-white/[0.03]'
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
              <ScanLine className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Drop receipt image here or choose file
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              JPG, JPEG, or PNG up to 5 MB · Flat surface in bright lighting gives highest OCR precision
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Image</span>
              </button>
              <button
                type="button"
                disabled={scanning}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-400/50 rounded-xl transition-all active:scale-[0.98] disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Use Camera</span>
              </button>
            </div>
          </div>

          {scanning && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-blue-500/12 border border-blue-500/30 text-xs sm:text-sm text-blue-800 dark:text-sky-200 flex items-center gap-3"
            >
              <ScanLine className="w-4 h-4 text-blue-600 dark:text-sky-400 animate-pulse shrink-0" />
              <span>Running local Tesseract OCR on receipt pixels… extracting merchant, items & total.</span>
            </motion.div>
          )}

          {previewUrl && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Uploaded Receipt Preview
              </div>
              <div className="relative rounded-2xl border border-slate-900/10 dark:border-white/15 overflow-hidden bg-slate-950/80 max-h-[420px] flex items-center justify-center p-2">
                <img
                  src={previewUrl}
                  alt="Uploaded receipt preview"
                  className="max-h-[400px] w-auto object-contain rounded-lg"
                />
                {scanning && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="h-14 w-full bg-gradient-to-b from-transparent via-sky-400/35 to-transparent border-b-2 border-sky-400 animate-scan-beam" />
                  </div>
                )}
              </div>
            </div>
          )}

          {parsed && (
            <div>
              <button
                type="button"
                onClick={() => setShowRawText((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showRawText ? 'Hide Raw OCR Output' : 'Inspect Raw OCR Output'}</span>
              </button>
              {showRawText && (
                <pre className="mt-2 p-3.5 rounded-xl bg-slate-950 text-slate-200 border border-white/10 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {parsed.rawText || '(Empty OCR text)'}
                </pre>
              )}
            </div>
          )}
        </section>

        {/* Right: Editable Confirmation Form */}
        <section className="lg:col-span-7 min-w-0 p-6 glass-card rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              2. Verify & Confirm Extracted Details
            </h3>
            {parsed && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                OCR Confidence: {Math.round(parsed.ocrConfidence * 100)}%
              </span>
            )}
          </div>

          {!parsed ? (
            <div className="py-14 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/12 text-blue-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Awaiting Receipt Scan
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Upload a receipt image or click <strong>Test Real OCR: ABC Supermarket</strong> above to run Tesseract OCR and populate this editable confirmation ledger.
              </p>
            </div>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleConfirmSave}
              className="space-y-5"
            >
              {parsed.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/12 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  {parsed.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                  isTotalMatched
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                    : items.length === 0
                      ? 'bg-slate-900/[0.03] dark:bg-white/[0.04] border-slate-900/10 dark:border-white/10 text-slate-700 dark:text-slate-300'
                      : 'bg-amber-500/12 border-amber-500/30 text-amber-900 dark:text-amber-200'
                }`}
              >
                <span>
                  {items.length === 0
                    ? 'No individual items listed. Confirm the total amount manually.'
                    : isTotalMatched
                      ? `Total validated: ${items.length} items (₹${itemsSum.toFixed(2)}) + tax (₹${Number(taxAmount).toFixed(2)}) match ₹${Number(totalAmount).toFixed(2)}.`
                      : `Mismatch: items + tax = ₹${expectedTotalFromItems.toFixed(2)} vs total ₹${Number(totalAmount).toFixed(2)} (diff ₹${discrepancy.toFixed(2)}).`}
                </span>
                {items.length > 0 && !isTotalMatched && (
                  <button
                    type="button"
                    onClick={() => setTotalAmount(expectedTotalFromItems)}
                    className="font-semibold underline underline-offset-2 whitespace-nowrap"
                  >
                    Set Total to ₹{expectedTotalFromItems.toFixed(2)}
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ocr-merchant" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Merchant / Shop Name
                  </label>
                  <input
                    id="ocr-merchant"
                    type="text"
                    required
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Receipt Date
                  </label>
                  <input
                    id="ocr-date"
                    type="date"
                    required
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ocr-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Expense Category (Suggested: {parsed.suggestedCategory})
                  </label>
                  <select
                    id="ocr-category"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ocr-pm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    id="ocr-pm"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  >
                    {['UPI', 'Debit Card', 'Credit Card', 'Cash', 'Net Banking', 'Wallet'].map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Editable Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Extracted Line Items
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => [...prev, { name: '', quantity: 1, unitPrice: 0, totalPrice: 0 }])
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                {items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          aria-label={`Item ${idx + 1} name`}
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setItems(next);
                          }}
                          placeholder="Item name"
                          className="col-span-7 px-2.5 py-1.5 glass-input rounded-lg text-sm"
                        />
                        <input
                          aria-label={`Item ${idx + 1} price`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.totalPrice}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const next = [...items];
                            next[idx] = { ...next[idx], totalPrice: val, unitPrice: val };
                            setItems(next);
                          }}
                          className="col-span-4 px-2.5 py-1.5 glass-input rounded-lg text-sm font-mono tabular-nums"
                        />
                        <button
                          type="button"
                          aria-label={`Remove item ${idx + 1}`}
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="col-span-1 p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No line items extracted—click “Add Item” if you wish to itemize.
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-slate-900/10 dark:border-white/10">
                <div>
                  <label htmlFor="ocr-tax" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tax / GST (₹)
                  </label>
                  <input
                    id="ocr-tax"
                    type="number"
                    min="0"
                    step="0.01"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-total" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Verified Total Amount (₹)
                  </label>
                  <input
                    id="ocr-total"
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setParsed(null);
                    setPreviewUrl(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-900/5 dark:bg-white/10 hover:bg-slate-900/10 dark:hover:bg-white/15 rounded-xl transition-colors"
                >
                  Discard Scan
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? 'Saving Verified Receipt…' : 'Verify & Save Transaction'}
                </button>
              </div>
            </motion.form>
          )}
        </section>
      </div>

      {/* Saved Verified Receipts Archive */}
      <section className="p-6 glass-card rounded-2xl">
        <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white mb-4">
          Verified Receipt Archive ({savedReceipts.length})
        </h3>
        {savedReceipts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No receipts verified and saved yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedReceipts.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-2xl bg-slate-900/[0.03] dark:bg-white/[0.04] border border-slate-900/8 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white text-sm">
                      {rec.merchantName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDateShort(rec.receiptDate)} · {rec.paymentInfo}
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-white text-sm tabular-nums">
                    {formatINR(rec.totalAmount, true)}
                  </div>
                </div>
                {rec.items.length > 0 && (
                  <ul className="mt-3 pt-2.5 border-t border-slate-900/8 dark:border-white/10 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {rec.items.map((it, idx) => (
                      <li key={idx} className="flex justify-between gap-2">
                        <span className="truncate">{it.name}</span>
                        <span className="font-mono tabular-nums">{formatINR(it.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
