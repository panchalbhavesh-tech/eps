"""
Catalyst Classifier
===================
Deterministic, testable classification of exchange filings into tradable event subtypes.

NSE tags every filing with a standard category ("desc"), e.g. "Bagging/Receiving of orders/contracts",
"Credit Rating", "Resignation", "Action(s) taken or orders passed". We classify on that label first and
refine with the filing text / PDF (order value, rating action, which executive left), instead of keyword
guessing on free text - which, for example, used to read "orders passed" (a regulator's penalty) as an
order *win*.
"""
import io
import re
from typing import Any, Dict, Optional

USD_INR = 85.0

# subtype -> prior direction hint (final direction is taken from measured evidence, not this hint)
SUBTYPE_HINTS = {
    "ORDER_WIN": "BULLISH",
    "RATING_UPGRADE": "BULLISH",
    "RATING_DOWNGRADE": "BEARISH",
    "RATING_WATCH_NEGATIVE": "BEARISH",
    "AUDITOR_EXIT": "BEARISH",
    "CEO_EXIT": "BEARISH",
    "CFO_EXIT": "BEARISH",
    "BUYBACK": "BULLISH",
    "BONUS_SPLIT": "BULLISH",
    "CAPACITY_ADDITION": "BULLISH",
    "USFDA_APPROVAL": "BULLISH",
    "USFDA_ADVERSE": "BEARISH",
    "REGULATORY_ACTION": "BEARISH",
    "DEFAULT_INSOLVENCY": "BEARISH",
    "FUNDRAISE": "MIXED",
    "ACQUISITION": "MIXED",
    "RESTRUCTURING": "MIXED",
    "LITIGATION": "MIXED",
}

LABELS = {
    "ORDER_WIN": "Order win", "RATING_UPGRADE": "Rating upgrade", "RATING_DOWNGRADE": "Rating downgrade",
    "RATING_WATCH_NEGATIVE": "Rating watch negative", "AUDITOR_EXIT": "Auditor resigned", "CEO_EXIT": "CEO/MD exit",
    "CFO_EXIT": "CFO exit", "BUYBACK": "Buyback", "BONUS_SPLIT": "Bonus / split", "CAPACITY_ADDITION": "Capacity addition",
    "USFDA_APPROVAL": "USFDA approval", "USFDA_ADVERSE": "USFDA adverse action", "REGULATORY_ACTION": "Regulatory action",
    "DEFAULT_INSOLVENCY": "Default / insolvency", "FUNDRAISE": "Fund raise", "ACQUISITION": "Acquisition",
    "RESTRUCTURING": "Merger / demerger", "LITIGATION": "Litigation",
}

# Filing categories that never carry tradable news for this radar (results are handled by Pre-Release Edge).
SKIP_CATEGORIES = re.compile(
    r"^(analysts/institutional|copy of newspaper|trading window|shareholders meeting|certificate under|investor presentation"
    r"|record date|dividend|esop|esos|news verification|spurt in volume|price movement|outcome of board meeting"
    r"|financial result|board meeting intimation|loss of share|closure of trading|book closure|agm|egm|postal ballot"
    r"|updates - newspaper|disclosure under sebi takeover|insider trading|demise|compliance)",
    re.IGNORECASE,
)

AMOUNT = re.compile(
    r"(?:rs\.?|inr|₹|usd|us\s?\$|\$)\s*([\d,]+(?:\.\d+)?)\s*(crores?|cr\.?|lakhs?|lacs?|million|mn|billion|bn)\b",
    re.IGNORECASE,
)
ORDER_WORDS = re.compile(r"\b(order|contract|letter of award|letter of acceptance|loa|work order|purchase order)\b", re.IGNORECASE)
ESG = re.compile(r"\besg\b", re.IGNORECASE)


def parse_amount_cr(text: str) -> Optional[float]:
    """Largest monetary amount in the text, converted to ₹ crore (USD amounts at USD_INR)."""
    per_unit = {"cr": 1.0, "lakh": 0.01, "lac": 0.01, "million": 0.1, "mn": 0.1, "billion": 100.0, "bn": 100.0}
    best = None
    for m in AMOUNT.finditer(text or ""):
        try:
            val = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        unit = m.group(2).lower().rstrip(".")
        key = next((k for k in per_unit if unit.startswith(k)), None)
        if key is None:
            continue
        cr = val * per_unit[key]
        if m.group(0).lower().startswith(("usd", "us", "$")):
            cr *= USD_INR
        best = cr if best is None else max(best, cr)
    return round(best, 2) if best is not None else None


def rating_action(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"watch with negative|negative watch|rating watch negative|credit watch negative", t):
        return "WATCH_NEGATIVE"
    if re.search(r"\bdowngrad", t):
        return "DOWNGRADE"
    if re.search(r"\bupgrad", t):
        return "UPGRADE"
    if re.search(r"withdraw", t):
        return "WITHDRAWN"
    if re.search(r"reaffirm|re-affirm|retain|assigned|assignment", t):
        return "REAFFIRM"
    return None


def exec_role(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"statutory auditor|auditors?\b", t) and re.search(r"resign|cessation|casual vacancy", t):
        return "AUDITOR"
    if re.search(r"company secretary|compliance officer|independent director|nominee director|non.executive", t):
        return "OTHER"
    if re.search(r"chief executive|\bceo\b|managing director|\bmd\b|executive chairman|whole.?time director", t):
        return "CEO"
    if re.search(r"chief financial|\bcfo\b", t):
        return "CFO"
    return "OTHER"


def classify(category: str, text: str) -> Optional[Dict[str, Any]]:
    """
    Map one filing to a subtype. Returns None for routine/noise filings.
    `needs_pdf` marks filings whose decisive detail (order value, rating action) usually lives in the PDF.
    """
    cat = (category or "").strip()
    c = cat.lower()
    t = text or ""
    tl = t.lower()
    if not cat or SKIP_CATEGORIES.search(c):
        return None

    def out(subtype, needs_pdf=False, **extra):
        return {"subtype": subtype, "hint": SUBTYPE_HINTS.get(subtype, "MIXED"), "needs_pdf": needs_pdf, **extra}

    if "orders/contracts" in c or c.startswith(("awarding of order", "award of order", "receipt of order", "bagging")):
        return out("ORDER_WIN", needs_pdf=True, amount_cr=parse_amount_cr(t))
    if c.startswith("credit rating"):
        if ESG.search(t) or "esg" in c:
            return None
        act = rating_action(t)
        return out({"UPGRADE": "RATING_UPGRADE", "DOWNGRADE": "RATING_DOWNGRADE", "WATCH_NEGATIVE": "RATING_WATCH_NEGATIVE"}.get(act, "RATING_UNKNOWN"),
                   needs_pdf=act is None, rating_action=act)
    if c.startswith(("resignation", "cessation", "change in management", "change in director", "change in key managerial",
                     "change in auditor")):
        if re.search(r"appoint", tl) and not re.search(r"resign|cessation|vacat", tl):
            return None
        role = exec_role(t if "auditor" not in c else f"auditor {t}")
        if role == "AUDITOR" or ("auditor" in c and re.search(r"resign", tl)):
            return out("AUDITOR_EXIT")
        if role == "CEO":
            return out("CEO_EXIT")
        if role == "CFO":
            return out("CFO_EXIT")
        return None
    if c.startswith("buyback") or re.search(r"\bbuy.?back\b", tl):
        return out("BUYBACK", amount_cr=parse_amount_cr(t))
    if c.startswith(("bonus", "stock split", "sub-division", "split")) or re.search(r"\bbonus issue\b|sub-?division of", tl):
        return out("BONUS_SPLIT")
    if c.startswith(("capacity addition", "commencement of operation", "commencement of commercial", "commissioning")):
        return out("CAPACITY_ADDITION", amount_cr=parse_amount_cr(t))
    if c.startswith(("action(s) taken", "action(s) initiated", "actions taken")):
        return out("REGULATORY_ACTION", amount_cr=parse_amount_cr(t))
    if c.startswith(("fraud", "default")) or re.search(r"default in (?:payment|repayment)|insolvency petition|cirp", tl):
        return out("DEFAULT_INSOLVENCY")
    if c.startswith("pendency of litigation") or c.startswith("litigation"):
        return out("LITIGATION", amount_cr=parse_amount_cr(t))
    if c.startswith(("acquisition", "diversification")):
        if re.search(r"incorporation of|step.?down subsidiary|wholly.?owned subsidiary incorporat", tl):
            return None
        return out("ACQUISITION", amount_cr=parse_amount_cr(t))
    if c.startswith(("amalgamation", "merger", "scheme of arrangement", "demerger")):
        return out("RESTRUCTURING")
    if c.startswith(("qualified institutional", "preferential", "rights issue", "fund raising", "issue of securities")):
        return out("FUNDRAISE", amount_cr=parse_amount_cr(t))
    # Free-text categories: only promote clear, specific news
    if c.startswith(("press release", "updates", "general updates", "disclosure of material")):
        if re.search(r"usfda|us fda|\banda\b|final approval|tentative approval", tl) and re.search(r"approv", tl):
            return out("USFDA_APPROVAL")
        if re.search(r"warning letter|import alert|form 483|\boai\b|official action indicated", tl):
            return out("USFDA_ADVERSE")
        if ORDER_WORDS.search(t) and AMOUNT.search(t) and re.search(r"receiv|bag|secur|won|award", tl):
            return out("ORDER_WIN", amount_cr=parse_amount_cr(t))
    return None


def refine_with_pdf(result: Dict[str, Any], pdf_text: str) -> Dict[str, Any]:
    """Fill in details that live in the filing PDF."""
    if not pdf_text:
        return result
    r = dict(result)
    if r["subtype"] in ("ORDER_WIN", "BUYBACK", "ACQUISITION", "FUNDRAISE", "CAPACITY_ADDITION", "REGULATORY_ACTION", "LITIGATION"):
        amt = parse_amount_cr(pdf_text[:6000])
        if amt:
            r["amount_cr"] = amt
    if r["subtype"] == "RATING_UNKNOWN":
        act = rating_action(pdf_text[:8000])
        r["rating_action"] = act
        r["subtype"] = {"UPGRADE": "RATING_UPGRADE", "DOWNGRADE": "RATING_DOWNGRADE", "WATCH_NEGATIVE": "RATING_WATCH_NEGATIVE"}.get(act, "RATING_UNKNOWN")
        r["hint"] = SUBTYPE_HINTS.get(r["subtype"], "MIXED")
    r["pdf_parsed"] = True
    return r


def pdf_text(content: bytes, max_pages: int = 3) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return re.sub(r"\s+", " ", " ".join((p.extract_text() or "") for p in reader.pages[:max_pages]))
    except Exception:
        return ""


def size_bucket(amount_cr: Optional[float], annual_revenue_cr: Optional[float], mcap_cr: Optional[float]) -> Dict[str, Any]:
    """Relative size of a money event vs the company (the single most important thing for order wins)."""
    rev_pct = round(amount_cr / annual_revenue_cr * 100, 2) if amount_cr and annual_revenue_cr and annual_revenue_cr > 0 else None
    mcap_pct = round(amount_cr / mcap_cr * 100, 2) if amount_cr and mcap_cr and mcap_cr > 0 else None
    ref = rev_pct if rev_pct is not None else (mcap_pct * 2 if mcap_pct is not None else None)
    if ref is None:
        bucket = "UNKNOWN"
    elif ref >= 10:
        bucket = "LARGE"
    elif ref >= 3:
        bucket = "MEDIUM"
    else:
        bucket = "SMALL"
    return {"size_rev_pct": rev_pct, "size_mcap_pct": mcap_pct, "size_bucket": bucket}
