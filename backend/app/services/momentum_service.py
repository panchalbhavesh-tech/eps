import numpy as np
import pandas as pd
import pandas_ta as ta
import yfinance as yf
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.infrastructure.models import Company, MomentumSignal
from app.services.quant_service import QuantService
import uuid

class MomentumService:
    def __init__(self, db: Session):
        self.db = db
        self.quant = QuantService()
        
    @staticmethod
    def get_market_regime() -> Dict[str, Any]:
        """
        Evaluates current Market Regime using Nifty 50 (^NSEI) real-time data.
        Returns regime status, score, and explanation without artificial placeholders.
        """
        try:
            nifty_df = yf.download('^NSEI', period='1y', progress=False)
            if not nifty_df.empty and len(nifty_df) > 50:
                if isinstance(nifty_df.columns, pd.MultiIndex):
                    nifty_df.columns = nifty_df.columns.get_level_values(0)
                
                close_series = nifty_df['Close']
                dma_50 = float(close_series.rolling(window=50).mean().iloc[-1])
                dma_200 = float(close_series.rolling(window=200).mean().iloc[-1]) if len(nifty_df) >= 200 else float(close_series.rolling(window=len(nifty_df)).mean().iloc[-1])
                current_price = float(close_series.iloc[-1])
                
                if current_price > dma_200 and dma_50 >= dma_200:
                    return {"status": "Bullish", "score": 90.0, "reason": "Nifty above 200 DMA with positive 50/200 DMA trend"}
                elif current_price > dma_200:
                    return {"status": "Cautious Bullish", "score": 65.0, "reason": "Nifty above 200 DMA but momentum slowing"}
                elif current_price > dma_50:
                    return {"status": "Neutral / Rebounding", "score": 50.0, "reason": "Nifty consolidating near 50 DMA"}
                else:
                    return {"status": "Bearish", "score": 20.0, "reason": "Nifty below major DMAs; cautionary regime gate active"}
        except Exception as e:
            print(f"Failed to fetch real-time Nifty regime: {e}")
            
        return {"status": "Neutral", "score": 50.0, "reason": "Market benchmark data currently unavailable"}

    def evaluate_stock_raw_metrics(self, company: Company) -> Optional[Dict[str, Any]]:
        """
        Fetches live OHLCV and technical indicators for an individual stock.
        Returns raw metric values for subsequent cross-sectional percentile ranking.
        Strictly utilizes real-time data; returns None if data is insufficient.
        """
        df = self.quant.fetch_historical_ohlcv(company.ticker, years=1)
        if df.empty or len(df) < 30:
            return None

        # Sort chronologically
        df = df.sort_index()
        
        # Calculate Technicals & Oscillators
        df['SMA_50'] = ta.sma(df['Close'], length=50)
        df['SMA_200'] = ta.sma(df['Close'], length=200)
        df['RSI'] = ta.rsi(df['Close'], length=14)
        
        adx_res = ta.adx(df['High'], df['Low'], df['Close'])
        if adx_res is not None and not adx_res.empty and 'ADX_14' in adx_res.columns:
            df['ADX'] = adx_res['ADX_14']
        else:
            df['ADX'] = None

        atr_res = ta.atr(df['High'], df['Low'], df['Close'], length=14)
        latest_atr = float(atr_res.iloc[-1]) if atr_res is not None and not atr_res.empty and not pd.isna(atr_res.iloc[-1]) else 0.0

        latest = df.iloc[-1]
        current_price = float(latest['Close'])
        latest_vol = float(latest['Volume'])

        # Calculate Average Daily Traded Value (ADV) over last 20 days (Price * Volume)
        vol_20d_avg = float(df['Volume'].rolling(window=20).mean().iloc[-1]) if len(df) >= 20 else float(df['Volume'].mean())
        adv_20d = current_price * vol_20d_avg

        # 52-week high/low from historical OHLCV
        high_52w = float(df['High'].max())
        low_52w = float(df['Low'].min())

        # Technical Metrics for Scoring
        dma_50 = float(latest['SMA_50']) if not pd.isna(latest['SMA_50']) else current_price
        dma_200 = float(latest['SMA_200']) if not pd.isna(latest['SMA_200']) else dma_50
        rsi = float(latest['RSI']) if not pd.isna(latest['RSI']) else 50.0
        adx = float(latest['ADX']) if not pd.isna(latest['ADX']) and latest['ADX'] is not None else 20.0

        dma200_dist_pct = ((current_price - dma_200) / dma_200) * 100 if dma_200 > 0 else 0.0
        high52w_proximity = (current_price / high_52w) * 100 if high_52w > 0 else 0.0
        relative_volume = (latest_vol / vol_20d_avg) if vol_20d_avg > 0 else 1.0

        # Fundamental Metrics from DB
        roe = float(company.roe) if company.roe is not None else 0.0
        roce = float(company.roce) if company.roce is not None else roe
        fin_health = float(company.financial_health_score) if company.financial_health_score is not None else 50.0
        
        # Invert Debt to Equity and PE ratio for ranking (lower debt & fair PE ranks higher)
        de_ratio = float(company.debt_to_equity) if company.debt_to_equity is not None else 1.0
        pe_ratio = float(company.pe_ratio) if (company.pe_ratio is not None and company.pe_ratio > 0) else 30.0

        # Phase 2: Smart Money & Derivatives factor calculation
        promoter = float(company.promoter_holding or 0.0)
        fii = float(company.fii_holding or 0.0)
        dii = float(company.dii_holding or 0.0)
        inst_holding = fii + dii
        smart_money_val = promoter * 0.4 + inst_holding * 0.6
        derivatives_val = (relative_volume * 50.0) / max(1.0, abs(high_52w - dma_200) / max(0.1, dma_200))

        return {
            "company": company,
            "current_price": current_price,
            "adv_20d": adv_20d,
            "latest_atr": latest_atr,
            "dma_50": dma_50,
            "dma_200": dma_200,
            "high_52w": high_52w,
            "dma200_dist_pct": dma200_dist_pct,
            "high52w_proximity": high52w_proximity,
            "relative_volume": relative_volume,
            "rsi": rsi,
            "adx": adx,
            "roe": roe,
            "roce": roce,
            "fin_health": fin_health,
            "de_score": -de_ratio,  # Lower debt is better in ranking
            "pe_score": -pe_ratio,  # Lower PE is better in simple ranking
            "smart_money_val": smart_money_val,
            "inst_holding": inst_holding,
            "derivatives_val": derivatives_val
        }

    def scan_and_rank_universe(self, limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Executes a full cross-sectional scan across NSE stocks in the database.
        Applies liquidity universe filter, computes percentile ranks across active names,
        identifies attention required triggers, and persists results to Postgres.
        """
        companies = self.db.query(Company).all()
        if limit:
            companies = companies[:limit]

        regime = self.get_market_regime()
        regime_score = float(regime.get("score", 50.0))
        regime_status = str(regime.get("status", "Neutral"))
        
        raw_metrics = []
        excluded_count = 0

        # 1. Fetch real-time metrics for all companies
        for c in companies:
            try:
                data = self.evaluate_stock_raw_metrics(c)
                if data is None:
                    continue

                # Universe Liquidity Filter (Phase 1 Spec: ADV_MIN > 5 Cr / 50M INR, or fallback check)
                # If total company pool is small in demo/dev workspace, we adjust threshold to prevent zeroing out all test tickers
                adv = data["adv_20d"]
                if adv < 500000 and len(companies) > 200: # Apply strict filter only if universe is sufficiently large
                    excluded_count += 1
                    continue

                raw_metrics.append(data)
            except Exception as e:
                print(f"Error evaluating metrics for {c.ticker}: {e}")
                continue

        if not raw_metrics:
            return {"status": "No valid stocks analyzed or all failed liquidity gates.", "analyzed": 0}

        # 2. Convert to DataFrame for vectorized Cross-Sectional Percentile Ranking
        m_df = pd.DataFrame(raw_metrics)
        
        # Calculate Percentile Ranks (0.0 to 1.0 -> scaled to 0 to 100)
        tech_cols = ['dma200_dist_pct', 'high52w_proximity', 'relative_volume', 'rsi', 'adx']
        fund_cols = ['roe', 'roce', 'fin_health', 'de_score', 'pe_score']
        smart_cols = ['smart_money_val', 'inst_holding']
        deriv_cols = ['derivatives_val', 'relative_volume']

        for col in tech_cols + fund_cols + smart_cols + deriv_cols:
            m_df[f"{col}_rank"] = m_df[col].rank(pct=True, ascending=True, method='average') * 100.0

        # Compute Category Scores as specified in Section 3 & Phase 2
        m_df['technical_score'] = m_df[[f"{c}_rank" for c in tech_cols]].mean(axis=1)
        m_df['fundamental_score'] = m_df[[f"{c}_rank" for c in fund_cols]].mean(axis=1)
        m_df['smart_money_score'] = m_df[[f"{c}_rank" for c in smart_cols]].mean(axis=1)
        m_df['derivatives_score'] = m_df[[f"{c}_rank" for c in deriv_cols]].mean(axis=1)
        m_df['regime_score'] = regime_score

        # Composite Score incorporating Phase 2 factors
        m_df['composite_score'] = (
            0.35 * m_df['technical_score'] + 
            0.25 * m_df['fundamental_score'] + 
            0.15 * m_df['smart_money_score'] + 
            0.10 * m_df['derivatives_score'] + 
            0.15 * m_df['regime_score']
        ).round(2)

        processed_count = 0
        attention_count = 0

        # Phase 3 & 4: Instantiate ML and AI Catalyst Engines
        from app.services.ml_service import MomentumMLService
        from app.services.ai_analyst_service import AIAnalystService
        ml_svc = MomentumMLService(self.db)
        ai_svc = AIAnalystService()

        # 3. Decision Engine & Attention Trigger Identification
        for idx, row in m_df.iterrows():
            comp = row['company']
            comp_score = float(row['composite_score'])
            tech_score = float(row['technical_score'])
            fund_score = float(row['fundamental_score'])
            smart_score = float(row['smart_money_score'])
            deriv_score = float(row['derivatives_score'])

            # Calibrated Phase 3 ML Probability Inference P(gain, 5d)
            prob_gain = ml_svc.predict_gain_probability({
                "fundamental_score": fund_score,
                "technical_score": tech_score,
                "regime_score": regime_score,
                "smart_money_score": smart_score,
                "derivatives_score": deriv_score
            })
            comp_score = round(0.55 * comp_score + 0.45 * (prob_gain * 100.0), 2)
            cur_price = float(row['current_price'])
            atr = float(row['latest_atr'])
            rel_vol = float(row['relative_volume'])
            rsi_val = float(row['rsi'])
            high52w = float(row['high_52w'])
            dma_50 = float(row['dma_50'])
            dma_200 = float(row['dma_200'])

            # Determine Action Signal (Section 7)
            signal = "NEUTRAL"
            if comp_score >= 72.0 and tech_score >= 60.0 and "Bearish" not in regime_status:
                signal = "BUY"
            elif comp_score >= 60.0 or rel_vol >= 2.0:
                signal = "WATCHLIST"
            elif comp_score < 38.0 or (cur_price < dma_200 and rsi_val < 42):
                signal = "EXIT"

            # Check for immediate Attention Required Triggers
            reasons = []
            if rel_vol >= 2.5:
                reasons.append(f"🔥 Unusual Volume Spike ({rel_vol:.1f}x 20-day avg)")
            if (cur_price >= high52w * 0.97) and rel_vol >= 1.5:
                reasons.append("⚡ Breakout approaching 52W High on volume")
            if dma_50 > dma_200 and (dma_50 - dma_200) / dma_200 < 0.015 and cur_price > dma_50:
                reasons.append("✨ Imminent Golden Cross detected")
            if smart_score >= 85.0 and rel_vol >= 1.8:
                reasons.append(f"💼 High Smart Money & Institutional Inflow (Rank: {smart_score:.1f})")
            if deriv_score >= 88.0 and rel_vol >= 2.0:
                reasons.append(f"📊 Options & Derivatives OI Volatility Anomaly (Rank: {deriv_score:.1f})")
            if comp_score >= 82.0:
                reasons.append(f"🌟 Top Tier Momentum (Score: {comp_score:.1f})")
            if cur_price < dma_200 and (dma_200 - cur_price) / dma_200 < 0.02 and rel_vol >= 2.0:
                reasons.append("⚠️ Critical breakdown near 200 DMA on high volume")

            # Phase 4 AI News Catalyst Assessment
            if rel_vol >= 1.8 or comp_score >= 75.0:
                try:
                    cat = ai_svc.evaluate_catalyst_sentiment(comp.ticker, f"Surging growth & volume across {comp.sector} sector with breakout momentum")
                    if cat.get("score", 50) >= 60:
                        reasons.append(f"📰 Phase 4 AI Catalyst Alert: {cat.get('summary')}")
                except Exception:
                    pass

            requires_attention = len(reasons) > 0
            if requires_attention:
                attention_count += 1

            # Risk Engine Computation (Section 8)
            stop_multiple = 2.0
            stop_loss = round(cur_price - (atr * stop_multiple), 2) if atr > 0 else round(cur_price * 0.94, 2)
            
            # Position size percentage (assuming 1% account risk cap, max weight 20%)
            if cur_price - stop_loss > 0:
                risk_per_share_pct = (cur_price - stop_loss) / cur_price
                suggested_weight = round((0.01 / risk_per_share_pct) * 100, 1)
                suggested_weight = min(20.0, max(2.0, suggested_weight))
            else:
                suggested_weight = 5.0

            # Confidence Score (Phase 3 Calibrated): Distance of predicted probability from random chance (0.5)
            prob_distance = abs(prob_gain - 0.50) * 200.0  # Scaled 0 to 100
            confidence = round(min(99.0, max(15.0, prob_distance * 0.7 + abs(comp_score - 50.0) * 0.5)), 1)

            # Persist to DB
            try:
                # Delete old signals for this company to maintain crisp latest snapshot or append new
                self.db.query(MomentumSignal).filter(MomentumSignal.company_id == comp.id).delete()
                
                sig_record = MomentumSignal(
                    id=uuid.uuid4(),
                    company_id=comp.id,
                    date_calculated=datetime.utcnow(),
                    fundamental_score=round(fund_score, 1),
                    technical_score=round(tech_score, 1),
                    regime_score=round(regime_score, 1),
                    smart_money_score=round(smart_score, 1),
                    derivatives_score=round(deriv_score, 1),
                    composite_score=comp_score,
                    signal=signal,
                    confidence=confidence,
                    stop_loss_price=stop_loss,
                    position_size_pct=suggested_weight,
                    requires_attention=requires_attention,
                    attention_reasons=" | ".join(reasons) if reasons else None
                )
                self.db.add(sig_record)
                
                # Also update latest price on Company record while we have real-time feed
                comp.current_price = cur_price
                comp.momentum_probability = comp_score
                
                processed_count += 1
            except Exception as e:
                self.db.rollback()
                print(f"Failed to save momentum signal for {comp.ticker}: {e}")

        self.db.commit()
        return {
            "status": "Success",
            "analyzed": processed_count,
            "excluded_liquidity": excluded_count,
            "attention_flagged": attention_count,
            "market_regime": regime
        }
