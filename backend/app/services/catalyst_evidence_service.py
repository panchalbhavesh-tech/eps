"""
Catalyst Evidence Builder
=========================
Walks each NSE company's filings for the last N years, classifies them (catalyst_classifier), reads a capped
sample of PDFs for decisive details (order value, rating action), and measures the market-model abnormal
reaction (1/3/5 sessions, vs Nifty) with the same event-study code as the Pre-Release Edge engine.

The result (catalyst_evidence_events) tells us which filing types *actually* move prices - and in which
direction - so the live radar alerts only on proven, impactful news.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from app.services.catalyst_classifier import classify, refine_with_pdf, pdf_text, size_bucket
from app.services.earnings_events_service import (
    EarningsEventsService, NseClient, align_benchmark, classify_session, compute_event_study, parse_nse_datetime,
)

logger = logging.getLogger(__name__)

PDF_BUDGET = {"ORDER_WIN": 1500, "RATING_UNKNOWN": 900}
PDF_PER_COMPANY = {"ORDER_WIN": 4, "RATING_UNKNOWN": 2}


def _num(x) -> Optional[float]:
    try:
        v = float(x)
        return v if np.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def annual_revenue_cr(company) -> Optional[float]:
    """Trailing four quarters of revenue (stored in rupees) in ₹ crore."""
    vals = [getattr(company, f"q{i}_revenue", None) for i in (1, 2, 3, 4)]
    vals = [v for v in vals if v is not None and v > 0]
    if len(vals) < 2:
        return None
    return round(sum(vals) / len(vals) * 4 / 1e7, 2)


def market_cap_cr(company) -> Optional[float]:
    return round(company.market_cap / 1e7, 2) if company.market_cap else None


def turnover_at(prices: pd.DataFrame, idx: int) -> Optional[float]:
    """20-day average traded value (₹ crore) up to bar idx."""
    if idx is None or idx < 20:
        return None
    w = prices.iloc[idx - 19:idx + 1]
    return round(float((w["close"] * w["volume"]).mean()) / 1e7, 3)


class CatalystEvidenceService:
    def __init__(self, db, nse: Optional[NseClient] = None):
        self.db = db
        self.nse = nse or NseClient()
        self.events = EarningsEventsService(db, nse=self.nse)
        self.pdf_used = {k: 0 for k in PDF_BUDGET}

    def fetch_pdf_text(self, url: str) -> str:
        if not url:
            return ""
        try:
            r = self.nse.session.get(url, timeout=30)
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                return pdf_text(r.content)
        except Exception as e:
            logger.debug(f"PDF fetch failed {url}: {e}")
        return ""

    def build_company(self, company, years: int = 2) -> Dict[str, Any]:
        from app.infrastructure.models import CatalystEvidenceEvent, EarningsReport
        symbol = company.ticker
        today = datetime.utcnow().date()
        start = today - timedelta(days=365 * years)
        anns = []
        w = start
        while w < today:
            e = min(today, w + timedelta(days=365))
            anns += self.nse.announcements(symbol, w, e)
            w = e + timedelta(days=1)
        if not anns:
            return {"ticker": symbol, "status": "NO_FILINGS"}

        prices = self.events.load_prices(symbol)
        if prices.empty or len(prices) < 120:
            return {"ticker": symbol, "status": "NO_PRICES"}
        bench = align_benchmark(self.events.benchmark(), prices.index)
        vix = align_benchmark(self.events.vix(), prices.index)
        results_days = {r[0].date() for r in self.db.query(EarningsReport.report_date).filter(
            EarningsReport.company_id == company.id, EarningsReport.report_date.isnot(None)).all()}
        if not company.market_cap:
            try:  # fill only when missing; never overwrites an existing value
                mc = self.events.dm.get_company_info(symbol).get("market_cap")
                if mc and mc > 0:
                    company.market_cap = float(mc)
            except Exception:
                pass
        rev_cr, mcap_cr = annual_revenue_cr(company), market_cap_cr(company)
        existing = {(r[0], r[1]) for r in self.db.query(CatalystEvidenceEvent.published_at, CatalystEvidenceEvent.subtype).filter(
            CatalystEvidenceEvent.ticker == symbol).all()}

        per_company_pdf = {k: 0 for k in PDF_PER_COMPANY}
        saved = 0
        for a in anns:
            ts = parse_nse_datetime(a.get("an_dt"))
            if ts is None or ts.date() >= today - timedelta(days=1):
                continue
            text = a.get("attchmntText") or ""
            cls = classify(a.get("desc") or "", text)
            if cls is None:
                continue
            key = cls["subtype"]
            if cls.get("needs_pdf") and key in PDF_BUDGET and self.pdf_used[key] < PDF_BUDGET[key] \
                    and per_company_pdf[key] < PDF_PER_COMPANY[key]:
                cls = refine_with_pdf(cls, self.fetch_pdf_text(a.get("attchmntFile")))
                self.pdf_used[key] += 1
                per_company_pdf[key] += 1
            if (ts, cls["subtype"]) in existing:
                continue
            session = classify_session(ts)
            study = compute_event_study(prices, bench, vix, ts.date(), session)
            if not study or study.get("ar_1d") is None:
                continue
            size = size_bucket(cls.get("amount_cr"), rev_cr, mcap_cr)
            overlap = any(abs((ts.date() - d).days) <= 1 for d in results_days)
            self.db.add(CatalystEvidenceEvent(
                company_id=company.id, ticker=symbol, published_at=ts, nse_category=(a.get("desc") or "")[:120],
                subtype=cls["subtype"], hint=cls["hint"], session=session, amount_cr=cls.get("amount_cr"),
                size_rev_pct=size["size_rev_pct"], size_mcap_pct=size["size_mcap_pct"], size_bucket=size["size_bucket"],
                rating_action=cls.get("rating_action"), pdf_parsed=bool(cls.get("pdf_parsed")), results_overlap=overlap,
                turnover_cr=_num(turnover_at(prices, study.get("baseline_idx"))), mcap_cr=mcap_cr,
                gap_pct=_num(study.get("gap_pct")), ar_1d=_num(study.get("ar_1d")), ar_3d=_num(study.get("ar_3d")),
                ar_5d=_num(study.get("ar_5d")), runup_ar_5d=_num(study.get("runup_ar_5d")), text=text[:500],
            ))
            existing.add((ts, cls["subtype"]))
            saved += 1
        self.db.commit()
        return {"ticker": symbol, "status": "OK", "filings": len(anns), "saved": saved}


def load_evidence(db) -> pd.DataFrame:
    from app.infrastructure.models import CatalystEvidenceEvent as E
    rows = db.query(E.ticker, E.published_at, E.subtype, E.size_bucket, E.amount_cr, E.size_rev_pct, E.results_overlap,
                    E.turnover_cr, E.mcap_cr, E.gap_pct, E.ar_1d, E.ar_3d, E.ar_5d, E.session, E.pdf_parsed).all()
    cols = ["ticker", "published_at", "subtype", "size_bucket", "amount_cr", "size_rev_pct", "results_overlap", "turnover_cr",
            "mcap_cr", "gap_pct", "ar_1d", "ar_3d", "ar_5d", "session", "pdf_parsed"]
    return pd.DataFrame(rows, columns=cols)
