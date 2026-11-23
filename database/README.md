# LedgerIQ Database Files (4 Database Options)

This folder provides complete, production-ready schemas for **4 database engines** so you can deploy or present LedgerIQ with whichever database your environment or college viva requires:

| Database Engine | Schema File | Best Used For |
| :--- | :--- | :--- |
| **PostgreSQL 15+** | `database/postgresql_schema.sql` | Supabase, Neon, Railway, Render, pgAdmin, enterprise SQL |
| **MySQL 8.0** | `docs/mysql_schema.sql` | MySQL Workbench, XAMPP, local MySQL server |
| **MongoDB 7.0+** | `database/mongodb_schema.js` | MongoDB Atlas / local NoSQL document store |
| **SQLite 3** | `database/sqlite_schema.sql` | Zero-setup embedded SQL (powers live `data/expense_tracker.db`) |
| **Default Seed** | `database/seed_defaults.sql` | Portable default categories for PostgreSQL / MySQL / SQLite |

---

## Quick Setup Commands

### 1. PostgreSQL (Local or Supabase / Neon)
```bash
createdb ledgeriq_db
psql -d ledgeriq_db -f database/postgresql_schema.sql
psql -d ledgeriq_db -f database/seed_defaults.sql
```
Then set in `.env`:
```env
DB_ENGINE=postgresql
DATABASE_URL="postgresql://postgres:your_password@127.0.0.1:5432/ledgeriq_db"
```

### 2. MySQL 8.0
```bash
mysql -u root -p < docs/mysql_schema.sql
mysql -u root -p expense_tracker_db < database/seed_defaults.sql
```
Then set in `.env`:
```env
DB_ENGINE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=expense_tracker_db
```

### 3. MongoDB 7.0+ (Local or Atlas)
```bash
mongosh "mongodb://127.0.0.1:27017/ledgeriq" database/mongodb_schema.js
```

### 4. SQLite 3 (Default Live Database)
Automatically initialized at `data/expense_tracker.db` when running `npm run dev` or `DB_ENGINE=sqlite python backend/run.py`.
