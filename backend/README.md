# LedgerIQ Backend Directory

LedgerIQ includes **two complete backend implementations** using the same 12-table relational model:

## 1. Live Node.js / Express Backend (Runs Automatically on Port 3000)
Located in the project root and `src/server/`:
- `server.ts` — Express REST API (Auth, Transactions, OCR Upload, 30-Day Forecast, Anomalies, Budgets, Simulator, Recurring Bills, Savings Goals, Gemini RAG Chat, CSV/PDF Reports)
- `src/server/db.ts` — Live SQLite 3 database (`data/expense_tracker.db`) + demo dataset seeder
- `src/server/auth.ts` — `bcryptjs` password hashing & JWT session middleware
- `src/server/ocrService.ts` — Local Tesseract.js receipt OCR parser
- `src/server/ragAssistant.ts` — User-isolated SQL RAG retrieval + Gemini API
- `src/ml/` — Naive Bayes categorizer, Holt-Winters 30-day forecaster, MAD/IQR anomaly detector, What-If simulator, savings & recurring engines

Start command:
```bash
npm run dev
```

---

## 2. Python / Flask Multi-Database Backend (Runs on Port 5000)
Located inside this `backend/` folder:
- `backend/run.py` — Flask app supporting **PostgreSQL**, **MySQL**, or **SQLite** via `DB_ENGINE` or `DATABASE_URL`
- `backend/app/models/schema.py` — 12 SQLAlchemy ORM models
- `backend/app/ml/pipeline.py` — Scikit-learn Naive Bayes (`joblib`), IsolationForest, Holt-Winters
- `backend/app/ocr/receipt_ocr.py` — OpenCV + Pillow + EasyOCR / Tesseract receipt parser
- `backend/app/services/gemini_rag.py` — Google GenAI Python RAG module
- `backend/requirements.txt` — Python dependencies including `psycopg2-binary` (PostgreSQL), `PyMySQL` (MySQL), and `pymongo` (MongoDB)

Start commands (PostgreSQL example):
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
DB_ENGINE=postgresql python run.py
```
