"""
Flask REST API Entrypoint for the Python Multi-Database Backend.
Supports PostgreSQL, MySQL 8.0, and SQLite 3 via DB_ENGINE or DATABASE_URL.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from app.models.schema import db, User
from app.ml.pipeline import predict_expense_category

load_dotenv()


def resolve_database_uri() -> tuple[str, str]:
    """Resolve SQLAlchemy database URI from SUPABASE_DB_URL, DATABASE_URL, or DB_ENGINE."""
    explicit_url = (os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or "").strip()
    if explicit_url:
        # Normalize legacy postgres:// URLs for SQLAlchemy 2.x
        if explicit_url.startswith("postgres://"):
            explicit_url = explicit_url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif explicit_url.startswith("postgresql://"):
            explicit_url = explicit_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        engine_label = "supabase-postgresql" if os.getenv("SUPABASE_DB_URL") else explicit_url.split("://", 1)[0]
        return explicit_url, engine_label

    engine = os.getenv("DB_ENGINE", "postgresql").strip().lower()

    if engine in ("postgres", "postgresql"):
        pg_user = os.getenv("POSTGRES_USER", "postgres")
        pg_pass = os.getenv("POSTGRES_PASSWORD", "postgres")
        pg_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
        pg_port = os.getenv("POSTGRES_PORT", "5432")
        pg_db = os.getenv("POSTGRES_DB", "ledgeriq_db")
        return f"postgresql+psycopg2://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}", "postgresql"

    if engine == "mysql":
        mysql_user = os.getenv("MYSQL_USER", "root")
        mysql_pass = os.getenv("MYSQL_PASSWORD", "")
        mysql_host = os.getenv("MYSQL_HOST", "127.0.0.1")
        mysql_port = os.getenv("MYSQL_PORT", "3306")
        mysql_db = os.getenv("MYSQL_DATABASE", "expense_tracker_db")
        return f"mysql+pymysql://{mysql_user}:{mysql_pass}@{mysql_host}:{mysql_port}/{mysql_db}", "mysql"

    # Default fallback: local SQLite file
    default_sqlite = Path(__file__).resolve().parent.parent / "data" / "expense_tracker.db"
    sqlite_path = os.getenv("SQLITE_PATH", str(default_sqlite))
    return f"sqlite:///{sqlite_path}", "sqlite"


def create_app():
    app = Flask(__name__)
    CORS(app)

    db_uri, db_engine = resolve_database_uri()
    app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-flask-secret")

    db.init_app(app)

    @app.get("/api/health")
    def health():
        return jsonify({
            "ok": True,
            "backend": "Flask + SQLAlchemy",
            "database_engine": db_engine,
        })

    @app.get("/api/db/info")
    def db_info():
        return jsonify({
            "engine": db_engine,
            "tables": list(db.metadata.tables.keys()),
            "table_count": len(db.metadata.tables),
        })

    @app.post("/api/ml/categorize")
    def categorize():
        body = request.get_json(silent=True) or {}
        desc = str(body.get("description", "")).strip()
        if not desc:
            return jsonify({"error": "description is required"}), 400
        return jsonify({"prediction": predict_expense_category(desc)})

    with app.app_context():
        try:
            db.create_all()
        except Exception as exc:
            print(f"[Info] Connect {db_engine} before creating tables: {exc}")

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=True)
