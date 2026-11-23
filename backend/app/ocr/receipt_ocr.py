"""
OpenCV + Pillow Image Preprocessing and EasyOCR / Tesseract Receipt Extraction.
"""
import re
import cv2
import numpy as np
from PIL import Image


def preprocess_receipt_image(image_path: str) -> np.ndarray:
    """
    Applies grayscale conversion, denoising, and adaptive thresholding
    to improve OCR accuracy on rotated, shadowed, or low-light receipts.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Unable to read uploaded receipt image.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    return thresh


def extract_text_from_receipt(image_path: str) -> str:
    """
    Uses EasyOCR when installed, falling back gracefully to pytesseract.
    """
    processed = preprocess_receipt_image(image_path)
    try:
        import easyocr
        reader = easyocr.Reader(["en"], gpu=False)
        lines = reader.readtext(processed, detail=0)
        return "\n".join(lines)
    except ImportError:
        import pytesseract
        return pytesseract.image_to_string(Image.fromarray(processed))


def parse_receipt_lines(raw_text: str) -> dict:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    merchant = lines[0] if lines else "Unknown Merchant"
    items = []
    total_amount = 0.0

    for line in lines:
        m = re.match(r"^(.*?)(?:[:\-]|\s)\s*(?:Rs\.?|INR|₹|\$)?\s*(\d+(?:\.\d{1,2})?)$", line, re.I)
        if not m:
            continue
        label, val = m.group(1).strip(), float(m.group(2))
        if re.search(r"\b(total|grand total|net total)\b", label, re.I):
            total_amount = max(total_amount, val)
        elif not re.search(r"\b(sub\s*total|tax|gst|date|paid)\b", label, re.I):
            items.append({"name": label, "price": val})

    items_sum = round(sum(i["price"] for i in items), 2)
    return {
        "merchant": merchant,
        "items": items,
        "totalAmount": total_amount or items_sum,
        "itemsSum": items_sum,
        "totalMatchesItems": abs((total_amount or items_sum) - items_sum) <= 1.5,
        "rawText": raw_text,
    }
