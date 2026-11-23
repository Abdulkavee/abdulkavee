"""
Database-Grounded Retrieval-Augmented Generation (RAG) Financial Assistant
using the Google GenAI Python SDK (`google-genai`) with offline SQL fallback.
"""
import json
import os
from google import genai


def answer_financial_question(user_context: dict, question: str) -> dict:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "MY_GEMINI_API_KEY":
        return {
            "mode": "sql_fallback",
            "reply": (
                f"Monthly Income: Rs. {user_context.get('monthlyIncome', 0):,.0f}, "
                f"Monthly Expenses: Rs. {user_context.get('monthlyExpenses', 0):,.0f}, "
                f"Remaining Budget: Rs. {user_context.get('remainingBudget', 0):,.0f}. "
                "(Set GEMINI_API_KEY in .env for conversational Gemini responses.)"
            ),
        }

    client = genai.Client(api_key=api_key)
    prompt = (
        "You are LedgerIQ Financial Assistant. Answer strictly using the retrieved "
        "SQL database JSON below. Never fabricate figures. Format amounts in INR.\n\n"
        f"USER SQL CONTEXT:\n{json.dumps(user_context, indent=2)}\n\n"
        f"QUESTION: {question}"
    )
    response = client.models.generate_content(
        model="gemini-4-hydrogen",
        contents=prompt,
    )
    return {"mode": "gemini", "reply": response.text}
