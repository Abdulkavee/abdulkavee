# LedgerIQ — Automated Expense Tracker with OCR Receipt Parsing & Predictive Analytics

**Tagline:** *Track Smarter. Predict Spending. Save Better.*

A complete full-stack AIML personal finance platform built for practical demonstration and academic viva defense, combining:
- **Real Local OCR Receipt Parsing** (Tesseract.js + OpenCV/EasyOCR companion script) with line-item extraction, total cross-check validation, and mandatory human-in-the-loop editable verification.
- **30-Day Predictive Expense Analytics** (Damped Additive Holt-Winters weekly seasonal time-series model with held-out MAE, RMSE, and MAPE evaluation, 95% uncertainty range, and budget overrun warnings).
- **AI Financial Assistant with Database-Grounded RAG** (Google Gemini API grounded strictly in the authenticated user's SQL records + transparent local SQL fallback when offline).
- **ML Automatic Expense Categorization** (Multinomial Naive Bayes with bigram features, temperature-calibrated probabilities, and online learning from user corrections).
- **Smart Spending Anomaly Detection** (Leave-one-out Modified Z-Score / MAD + IQR fence + 48-hour high-value burst monitoring—labelled as *Unusual Spending Activity*, never fraud).
- **What-If Budget Simulator**, **Smart Savings Recommendations & Goals**, **Recurring Expense Tracker with Pattern Detection**, and **CSV & PDF Financial Reports**.

---

## Demo Account Credentials (Development / Viva)

A clearly labelled **fictional 90-day student demo dataset** is automatically seeded on first run (never claimed as real-world ML accuracy proof):

| Field | Value |
| :--- | :--- |
| **Email** | `aarav.sharma@demo.fin` |
| **Password** | `Demo@2026` |

> Tip: You can also click **"Explore Live Demo Account"** on the Landing Page or **"Sign In with Demo Dataset"** on the Login page, or register a brand-new private account to test user data isolation.

---

## Project Architecture

```text
.
├── server.ts                         # Full-stack Express API + SQLite (12 tables) + Vite server
├── src/
│   ├── App.tsx                       # Application router across all 17 views
│   ├── context/AuthContext.tsx       # JWT session lifecycle
│   ├── services/api.ts               # Capacitor-ready REST client (VITE_API_BASE_URL)
│   ├── components/AppShell.tsx       # Responsive navy sidebar + mobile bottom navigation
│   ├── pages/                        # All 17 frontend screens
│   ├── ml/
│   │   ├── categorizer.ts            # Multinomial Naive Bayes + online correction learning
│   │   ├── forecaster.ts             # Holt-Winters 30-day time-series + MAE/RMSE backtesting
│   │   ├── anomalyDetector.ts        # Modified Z-Score (MAD) + IQR + burst anomaly engine
│   │   ├── recommendations.ts        # MoM savings engine, What-If simulator, recurring detector
│   │   └── ml.test.ts                # Automated node:test ML verification suite
│   ├── utils/
│   │   ├── receiptParser.ts          # Receipt text extraction, date/item/tax parser & validation
│   │   └── receiptParser.test.ts     # Automated node:test OCR parser test suite
│   └── server/
│       ├── db.ts                     # 12-table relational SQL schema + demo seeder
│       ├── auth.ts                   # bcryptjs password hashing + HMAC-SHA256 JWT middleware
│       ├── ocrService.ts             # Local Tesseract.js receipt OCR worker
│       └── ragAssistant.ts           # User-isolated SQL RAG retrieval + Gemini API + fallback
├── backend/                          # Python / Flask / SQLAlchemy / MySQL / Scikit-learn / EasyOCR companion
│   ├── requirements.txt
│   ├── run.py
│   └── app/
│       ├── models/schema.py          # 12 SQLAlchemy MySQL models
│       ├── ml/pipeline.py            # Scikit-learn Naive Bayes (Joblib), IsolationForest, Holt-Winters
│       ├── ocr/receipt_ocr.py        # OpenCV + Pillow + EasyOCR / Tesseract receipt parser
│       └── services/gemini_rag.py    # Google GenAI Python RAG module
├── docs/mysql_schema.sql             # Complete MySQL 8.0 DDL for all 12 relational tables
├── datasets/demo_transactions.csv    # Clearly labelled fictional dataset for ML inspection
└── .env.example                      # Environment variable template
```

---

## Running Locally on Windows PowerShell

### Option A: Full-Stack Web App (Zero Paid Services, Instant Local SQL + Tesseract OCR)

1. **Clone / open the project folder and install Node.js dependencies (Node 22+ recommended):**
   ```powershell
   npm install
   ```

2. **Create `.env` from `.env.example` (optional: add your `GEMINI_API_KEY` for Gemini RAG chat):**
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Run unit tests for ML, Forecasting, Anomaly Detection, Simulator & Receipt Parser:**
   ```powershell
   npx tsx --test src/ml/ml.test.ts src/utils/receiptParser.test.ts
   ```

4. **Start the full-stack server (Frontend + REST API + SQLite 12-table DB on port 3000):**
   ```powershell
   npm run dev
   ```
   Open **http://localhost:3000** in your browser.

5. **Build for production:**
   ```powershell
   npm run build
   $env:NODE_ENV="production"; node server.ts
   ```

---

### Option B: Python / Flask + MySQL 8.0 Companion Backend (Windows PowerShell)

1. **Create the MySQL 8.0 database & all 12 tables:**
   ```powershell
   mysql -u root -p < docs/mysql_schema.sql
   ```

2. **Create a Python virtual environment and install dependencies:**
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. **Configure MySQL credentials in `.env` (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`) and run Flask:**
   ```powershell
   python run.py
   ```

---

## Future Android Conversion (Capacitor Readiness)

The React + Vite frontend is structured for seamless Android wrapping with Capacitor:
- All API requests route through `src/services/api.ts` using `VITE_API_BASE_URL`.
- Receipt camera capture uses standard HTML5 `capture="environment"` (drop-in upgradeable to `@capacitor/camera`).
- Responsive layout includes touch-friendly mobile bottom navigation and safe-area viewport meta tags.

```powershell
# Future Android packaging steps (when ready)
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init LedgerIQ com.ledgeriq.app --web-dir dist
npm run build
npx cap add android
```

---

## Viva Explanation Guide (5th-Semester AIML)

1. **Relational Database (12 Tables):** `users`, `categories`, `transactions`, `budgets`, `receipts`, `receipt_items`, `forecast_history`, `savings_goals`, `recurring_expenses`, `chat_history`, `notifications`, and `model_prediction_history`—all linked via foreign keys with `ON DELETE CASCADE` and indexed on `(user_id, transaction_date)`.
2. **OCR Pipeline:** Uploaded image -> validation (MIME + 5 MB limit) -> Tesseract OCR pixel recognition -> regex/heuristic line-item & date/tax/payment extraction -> sum-vs-total discrepancy check -> editable user confirmation -> transactional insert into `receipts`, `receipt_items`, and `transactions`.
3. **Time-Series Forecasting:** Continuous daily expense series -> temporal train/test split (last 7–14 days held out) -> Damped Additive Holt-Winters (`period=7`) -> out-of-sample MAE & RMSE computation -> full-series refit -> 30-day forecast with `±1.28 * sigma * sqrt(1 + 0.04h)` uncertainty bounds and end-of-month budget overrun calculation.
4. **Auto-Categorization:** Unigram + bigram tokenization -> Multinomial Naive Bayes with Laplace smoothing (`alpha=1.0`) -> temperature-scaled softmax probability calibration -> user corrections stored in `model_prediction_history` and weighted during retraining.
5. **Anomaly Detection:** Leave-one-out category median & MAD (Modified Z-Score >= 3.5 + IQR upper fence) plus 48-hour high-value burst clustering, always presented transparently as *Unusual Spending Activity*.
6. **RAG Financial Assistant:** Per-user JWT authentication -> SQL aggregation & keyword retrieval strictly scoped by `WHERE user_id = ?` -> structured JSON context grounded into Gemini (`gemini-4-hydrogen`) with an inspectable SQL context drawer and automatic local SQL fallback if no API key is configured.
