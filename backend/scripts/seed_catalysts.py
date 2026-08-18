import sys
import os
import uuid
import random
from datetime import datetime, timedelta

# Ensure we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.infrastructure.database import SessionLocal
from app.infrastructure.models import CatalystEvent, CatalystSource

def generate_mock_catalysts():
    db = SessionLocal()
    
    # Clear existing
    db.query(CatalystSource).delete()
    db.query(CatalystEvent).delete()
    
    now = datetime.utcnow()
    
    events = [
        {
            "ticker": "XYZ",
            "event_title": "₹900 Cr Government Order",
            "event_type": "ORDER",
            "category": "ORDERS",
            "impact_score": 92.0,
            "early_score": 95.0,
            "reaction_pct": 0.4,
            "relative_volume": 1.3,
            "confidence": "HIGH",
            "status": "EARLY",
            "tier": "S-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Large order relative to company size. Officially verified. Stock has shown limited reaction so far, making this an early-stage catalyst rather than an already-priced event.",
            "detected_offset_mins": 2,
            "sources": [
                {"name": "NSE Corporate Announcements", "url": "https://www.nseindia.com", "primary": True},
            ]
        },
        {
            "ticker": "ABC",
            "event_title": "₹5,000 Cr Acquisition of TechCorp",
            "event_type": "ACQUISITION",
            "category": "CORPORATE",
            "impact_score": 98.0,
            "early_score": 28.0,
            "reaction_pct": 14.8,
            "relative_volume": 8.5,
            "confidence": "HIGH",
            "status": "EXTENDED",
            "tier": "S-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Massive acquisition event that has already been priced in by the market. Heavy volume expansion indicates majority of the catalyst impact has concluded.",
            "detected_offset_mins": 120,
            "sources": [
                {"name": "Reuters", "url": "https://reuters.com", "primary": False},
                {"name": "Economic Times", "url": "https://economictimes.com", "primary": False},
                {"name": "BSE Filings", "url": "https://bseindia.com", "primary": True},
            ]
        },
        {
            "ticker": "PQR",
            "event_title": "US FDA Approves Key Facility",
            "event_type": "REGULATORY_APPROVAL",
            "category": "REGULATORY",
            "impact_score": 88.0,
            "early_score": 91.0,
            "reaction_pct": 0.3,
            "relative_volume": 1.2,
            "confidence": "HIGH",
            "status": "EARLY",
            "tier": "A-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Regulatory hurdle cleared for major export facility. Minimal price reaction suggests the market is yet to digest the revenue implications.",
            "detected_offset_mins": 5,
            "sources": [
                {"name": "Company Investor Relations", "url": "", "primary": True}
            ]
        },
        {
            "ticker": "LMN",
            "event_title": "Promoter buys 1.5% Stake from Open Market",
            "event_type": "PROMOTER_BUYING",
            "category": "OWNERSHIP",
            "impact_score": 84.0,
            "early_score": 87.0,
            "reaction_pct": 1.1,
            "relative_volume": 1.8,
            "confidence": "HIGH",
            "status": "DEVELOPING",
            "tier": "A-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Strong insider confidence signal. Volume is picking up but the price is still within the initial reaction zone.",
            "detected_offset_mins": 25,
            "sources": [
                {"name": "SEBI Insider Trading Disclosures", "url": "", "primary": True}
            ]
        },
        {
            "ticker": "DEF",
            "event_title": "Management Guidance Downgraded",
            "event_type": "PROFIT_WARNING",
            "category": "FUNDAMENTAL",
            "impact_score": 75.0,
            "early_score": 40.0,
            "reaction_pct": -8.5,
            "relative_volume": 4.1,
            "confidence": "HIGH",
            "status": "EXTENDED",
            "tier": "B-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Negative catalyst. Stock has already broken major support levels on high volume.",
            "detected_offset_mins": 240,
            "sources": [
                {"name": "Earnings Presentation", "url": "", "primary": True},
                {"name": "CNBC-TV18", "url": "", "primary": False}
            ]
        },
        {
            "ticker": "RST",
            "event_title": "CFO Resignation",
            "event_type": "MANAGEMENT_CHANGE",
            "category": "GOVERNANCE",
            "impact_score": 80.0,
            "early_score": 94.0,
            "reaction_pct": -0.5,
            "relative_volume": 1.1,
            "confidence": "HIGH",
            "status": "EARLY",
            "tier": "A-TIER",
            "match_status": "MATCHED",
            "why_it_matters": "Sudden departure of key management personnel. Market hasn't fully reacted, presenting an early opportunity.",
            "detected_offset_mins": 3,
            "sources": [
                {"name": "NSE Corporate Announcements", "url": "", "primary": True}
            ]
        },
        {
            "ticker": "UVW",
            "event_title": "Secures ₹400 Cr Debt Refinancing",
            "event_type": "DEBT_REFINANCING",
            "category": "CAPITAL",
            "impact_score": 50.0,
            "early_score": 60.0,
            "reaction_pct": 0.1,
            "relative_volume": 0.9,
            "confidence": "MEDIUM",
            "status": "INFORMATIONAL",
            "tier": "C-TIER",
            "match_status": "AMBIGUOUS",
            "why_it_matters": "Routine corporate action to manage debt. Unlikely to cause significant immediate repricing.",
            "detected_offset_mins": 45,
            "sources": [
                {"name": "Business Standard", "url": "", "primary": False}
            ]
        },
    ]
    
    for item in events:
        detected = now - timedelta(minutes=item["detected_offset_mins"])
        published = detected - timedelta(seconds=random.randint(10, 120))
        
        event = CatalystEvent(
            id=uuid.uuid4(),
            ticker=item["ticker"],
            event_title=item["event_title"],
            event_type=item["event_type"],
            category=item["category"],
            impact_score=item["impact_score"],
            early_score=item["early_score"],
            confidence=item["confidence"],
            status=item["status"],
            tier=item["tier"],
            match_status=item["match_status"],
            why_it_matters=item["why_it_matters"],
            reaction_pct=item["reaction_pct"],
            relative_volume=item["relative_volume"],
            published_at=published,
            detected_at=detected,
            verified_at=detected + timedelta(seconds=random.randint(2, 10)),
        )
        db.add(event)
        
        for src in item["sources"]:
            s = CatalystSource(
                id=uuid.uuid4(),
                event_id=event.id,
                source_name=src["name"],
                url=src["url"],
                is_primary=src["primary"],
                published_at=published
            )
            db.add(s)
            
    db.commit()
    print(f"Successfully seeded {len(events)} Catalyst Events!")
    db.close()

if __name__ == "__main__":
    generate_mock_catalysts()
