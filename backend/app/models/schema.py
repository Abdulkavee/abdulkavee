"""
SQLAlchemy ORM Models for the 12-table MySQL relational schema.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(190), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    currency = db.Column(db.String(10), nullable=False, default="INR")
    monthly_income_target = db.Column(db.Numeric(12, 2), nullable=False, default=30000)
    monthly_budget_limit = db.Column(db.Numeric(12, 2), nullable=False, default=20000)
    is_demo_account = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Category(db.Model):
    __tablename__ = "categories"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = db.Column(db.String(80), nullable=False)
    type = db.Column(db.Enum("income", "expense"), nullable=False)
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    color = db.Column(db.String(16), nullable=False, default="#2563EB")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Receipt(db.Model):
    __tablename__ = "receipts"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = db.Column(db.String(255), nullable=False)
    image_url = db.Column(db.String(500), nullable=False, default="")
    merchant_name = db.Column(db.String(160), nullable=False)
    receipt_date = db.Column(db.Date, nullable=False)
    subtotal = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    tax_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False)
    payment_info = db.Column(db.String(60), nullable=False, default="UPI")
    ocr_engine = db.Column(db.String(60), nullable=False, default="EasyOCR")
    ocr_confidence = db.Column(db.Numeric(5, 3), nullable=False, default=0)
    raw_text = db.Column(db.Text)
    verified = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    items = db.relationship("ReceiptItem", backref="receipt", cascade="all, delete-orphan")


class ReceiptItem(db.Model):
    __tablename__ = "receipt_items"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    receipt_id = db.Column(db.BigInteger, db.ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    item_name = db.Column(db.String(180), nullable=False)
    quantity = db.Column(db.Numeric(8, 2), nullable=False, default=1)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    total_price = db.Column(db.Numeric(12, 2), nullable=False)


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.BigInteger, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    category_name = db.Column(db.String(80), nullable=False, index=True)
    type = db.Column(db.Enum("income", "expense"), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    merchant = db.Column(db.String(160), nullable=False, default="")
    payment_method = db.Column(db.String(60), nullable=False, default="UPI")
    transaction_date = db.Column(db.Date, nullable=False, index=True)
    receipt_id = db.Column(db.BigInteger, db.ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True)
    is_recurring = db.Column(db.Boolean, nullable=False, default=False)
    predicted_category = db.Column(db.String(80), nullable=True)
    prediction_confidence = db.Column(db.Numeric(5, 3), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Budget(db.Model):
    __tablename__ = "budgets"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_name = db.Column(db.String(80), nullable=False)
    month_key = db.Column(db.String(7), nullable=False)
    amount_limit = db.Column(db.Numeric(12, 2), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ForecastHistory(db.Model):
    __tablename__ = "forecast_history"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_name = db.Column(db.String(120), nullable=False)
    next_7_days_total = db.Column(db.Numeric(12, 2), nullable=False)
    next_30_days_total = db.Column(db.Numeric(12, 2), nullable=False)
    predicted_eom_total = db.Column(db.Numeric(12, 2), nullable=False)
    mae = db.Column(db.Numeric(10, 2), nullable=False)
    rmse = db.Column(db.Numeric(10, 2), nullable=False)
    test_days = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class SavingsGoal(db.Model):
    __tablename__ = "savings_goals"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(140), nullable=False)
    target_amount = db.Column(db.Numeric(12, 2), nullable=False)
    current_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    target_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class RecurringExpense(db.Model):
    __tablename__ = "recurring_expenses"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(160), nullable=False)
    category_name = db.Column(db.String(80), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    frequency = db.Column(db.Enum("monthly", "weekly", "quarterly", "yearly"), nullable=False, default="monthly")
    next_expected_date = db.Column(db.Date, nullable=False)
    payment_method = db.Column(db.String(60), nullable=False, default="UPI")
    is_auto_detected = db.Column(db.Boolean, nullable=False, default=False)
    notes = db.Column(db.String(255), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class ChatHistory(db.Model):
    __tablename__ = "chat_history"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = db.Column(db.Enum("user", "assistant"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    mode = db.Column(db.String(32), nullable=False, default="gemini")
    retrieved_summary = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.Enum("budget_warning", "budget_exceeded", "anomaly", "forecast", "info"), nullable=False)
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class ModelPredictionHistory(db.Model):
    __tablename__ = "model_prediction_history"
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    input_text = db.Column(db.String(255), nullable=False)
    predicted_category = db.Column(db.String(80), nullable=False)
    corrected_category = db.Column(db.String(80), nullable=False)
    confidence = db.Column(db.Numeric(5, 3), nullable=False, default=0)
    was_corrected = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
