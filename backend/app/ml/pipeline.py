"""
Machine Learning Pipeline for LedgerIQ (Python Companion Backend):
1. Expense Categorization: TF-IDF + Multinomial Naive Bayes (saved via Joblib)
2. Anomaly Detection: Isolation Forest + Category Median Baseline Comparison
3. 30-Day Forecasting: ARIMA(1,1,1) / Holt-Winters with Held-Out MAE & RMSE Evaluation
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.ensemble import IsolationForest
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from statsmodels.tsa.holtwinters import ExponentialSmoothing

MODEL_PATH = os.path.join(os.path.dirname(__file__), "expense_categorizer.joblib")

SEED_TRAINING_DATA = [
    ("Swiggy Biryani Dinner", "Food"),
    ("Zomato Pizza Order", "Food"),
    ("College Canteen Lunch", "Food"),
    ("Uber Auto Ride Commute", "Transport"),
    ("Metro Smart Card Recharge", "Transport"),
    ("Indian Oil Petrol Fuel", "Transport"),
    ("Amazon Online Shopping Order", "Shopping"),
    ("ABC Supermarket Milk Bread Rice", "Shopping"),
    ("DMart Monthly Groceries", "Shopping"),
    ("House Rent Monthly Flat", "Rent"),
    ("Electricity Board BESCOM Bill", "Bills"),
    ("Airtel Fiber Broadband Internet", "Bills"),
    ("College Fees Semester Tuition", "Education"),
    ("Udemy Machine Learning Course", "Education"),
    ("Apollo Pharmacy Medicines", "Healthcare"),
    ("BookMyShow Movie Tickets", "Entertainment"),
    ("Netflix Spotify Subscription", "Entertainment"),
    ("IRCTC Train Ticket Booking", "Travel"),
    ("Bank Charge Miscellaneous", "Other"),
]


def train_and_save_categorizer(extra_samples=None):
    data = list(SEED_TRAINING_DATA)
    if extra_samples:
        data.extend(extra_samples)
    texts = [row[0] for row in data]
    labels = [row[1] for row in data]
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), stop_words="english")),
        ("clf", MultinomialNB(alpha=0.8)),
    ])
    pipeline.fit(texts, labels)
    joblib.dump(pipeline, MODEL_PATH)
    return pipeline


def predict_expense_category(description: str):
    model = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else train_and_save_categorizer()
    probs = model.predict_proba([description])[0]
    classes = model.classes_
    best_idx = int(np.argmax(probs))
    return {
        "predictedCategory": str(classes[best_idx]),
        "confidence": round(float(probs[best_idx]), 3),
    }


def detect_anomalies_isolation_forest(df: pd.DataFrame):
    """
    Runs Scikit-learn IsolationForest on expense amounts normalized by category median.
    Always labels results as 'Unusual Spending Activity' (never fraud).
    """
    expenses = df[df["type"] == "expense"].copy()
    if len(expenses) < 8:
        return []

    medians = expenses.groupby("category")["amount"].transform("median").clip(lower=1.0)
    expenses["ratio_to_median"] = expenses["amount"] / medians

    iso = IsolationForest(contamination=0.08, random_state=42)
    features = expenses[["amount", "ratio_to_median"]].values
    expenses["anomaly_flag"] = iso.fit_predict(features)

    flagged = expenses[(expenses["anomaly_flag"] == -1) & (expenses["ratio_to_median"] >= 2.2)]
    results = []
    for _, row in flagged.iterrows():
        results.append({
            "date": str(row["date"]),
            "merchant": str(row.get("merchant", "")),
            "category": str(row["category"]),
            "amount": float(row["amount"]),
            "ratioToMedian": round(float(row["ratio_to_median"]), 2),
            "label": "Unusual Spending Activity",
        })
    return results


def forecast_30_days_holt_winters(daily_df: pd.DataFrame, monthly_budget: float):
    """
    Trains Additive Holt-Winters (seasonal_periods=7) on historical daily spending,
    evaluates MAE & RMSE on a held-out 14-day test window, and forecasts 30 days ahead.
    """
    daily_df = daily_df.copy()
    daily_df["date"] = pd.to_datetime(daily_df["date"])
    series = daily_df.groupby("date")["amount"].sum().asfreq("D", fill_value=0.0)

    if len(series) < 14:
        return {"insufficientData": True, "reason": "At least 14 days of history required."}

    test_days = min(14, max(7, len(series) // 5))
    train, test = series.iloc[:-test_days], series.iloc[-test_days:]

    bt_model = ExponentialSmoothing(train, trend="add", seasonal="add", seasonal_periods=7, damped_trend=True).fit()
    bt_pred = np.maximum(0.0, bt_model.forecast(test_days))
    mae = float(mean_absolute_error(test, bt_pred))
    rmse = float(root_mean_squared_error(test, bt_pred))

    full_model = ExponentialSmoothing(series, trend="add", seasonal="add", seasonal_periods=7, damped_trend=True).fit()
    future_30 = np.maximum(0.0, full_model.forecast(30))

    return {
        "insufficientData": False,
        "next7DaysTotal": round(float(future_30.iloc[:7].sum()), 2),
        "next30DaysTotal": round(float(future_30.sum()), 2),
        "evaluation": {"testDays": test_days, "mae": round(mae, 2), "rmse": round(rmse, 2)},
        "monthlyBudget": monthly_budget,
    }
