import strawberry
from typing import Optional, List
from strawberry.types import Info
from app.graphql.types import AuthPayload, UserType
from app.services.auth_service import AuthService
from app.graphql.context import Context
from app.worker.celery_app import celery_app

@strawberry.type
class Mutation:
    @strawberry.mutation
    def login(self, info: Info[Context, None], email: str, password: str) -> AuthPayload:
        db = info.context.db
        auth_service = AuthService(db)
        result = auth_service.login(email, password)
        
        if not result:
            raise Exception("Invalid credentials")
            
        user = auth_service.authenticate(email, password)
        if not user:
            raise Exception("Invalid credentials")
            
        return AuthPayload(
            access_token=result["access_token"],
            token_type=result["token_type"],
            user=UserType(id=str(user.id), email=user.email, is_active=user.is_active)
        )

    @strawberry.mutation
    def trigger_prediction(self, info: Info[Context, None], company_id: str) -> str:
        task = celery_app.send_task("app.worker.tasks.generate_prediction_task", args=[company_id])
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.generate_prediction_task", info.context.user.email)
        return f"Prediction task {task.id} started."
        
    @strawberry.mutation
    def populate_companies_data(self, info: Info[Context, None]) -> str:
        from app.infrastructure.models import BackgroundJob
        db = info.context.db
        existing = db.query(BackgroundJob).filter(
            BackgroundJob.task_name == "app.worker.tasks.sync_nse_universe_task",
            BackgroundJob.status.in_(["QUEUED", "RUNNING"])
        ).first()
        if existing:
            return "Universe sync is already queued or running."
            
        task = celery_app.send_task("app.worker.tasks.sync_nse_universe_task")
        _log_queued_task(db, task.id, "app.worker.tasks.sync_nse_universe_task", info.context.user.email)
        return f"Universe sync task {task.id} started in the background."
        
    @strawberry.mutation
    def sync_nse_calendar(self, info: Info[Context, None]) -> str:
        task = celery_app.send_task("app.worker.tasks.sync_nse_calendar_task")
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.sync_nse_calendar_task", info.context.user.email)
        return f"NSE Sync task queued with ID: {task.id}"

    @strawberry.mutation
    def analyze_company(self, info: Info[Context, None], company_id: str) -> str:
        task = celery_app.send_task("app.worker.tasks.generate_deep_research_report_task", args=[company_id])
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.generate_deep_research_report_task", info.context.user.email)
        return f"Deep research analysis task {task.id} started in the background."

    @strawberry.mutation
    def mass_calculate_financial_health(self, info: Info[Context, None]) -> str:
        from app.infrastructure.models import BackgroundJob
        db = info.context.db
        existing = db.query(BackgroundJob).filter(
            BackgroundJob.task_name == "app.worker.tasks.calculate_universe_health_task",
            BackgroundJob.status.in_(["QUEUED", "RUNNING"])
        ).first()
        if existing:
            return "Universe health calculation is already queued or running."
            
        task = celery_app.send_task("app.worker.tasks.calculate_universe_health_task")
        _log_queued_task(db, task.id, "app.worker.tasks.calculate_universe_health_task", info.context.user.email)
        return f"Universe health calculation task {task.id} queued in background."

    @strawberry.mutation
    def analyze_custom_stock(self, info: Info[Context, None], ticker: str) -> str:
        from app.infrastructure.models import Company
        db = info.context.db
        clean_ticker = ticker.strip().upper()
        
        # 1. Check if already in database (by symbol or fuzzy company name!)
        existing = db.query(Company).filter(
            (Company.ticker == clean_ticker) | 
            (Company.ticker == f"{clean_ticker}.NS") | 
            (Company.ticker == f"{clean_ticker}.BO") |
            (Company.name.ilike(f"%{clean_ticker}%"))
        ).first()
        
        if existing:
            try:
                celery_app.send_task("app.worker.tasks.generate_deep_research_report_task", args=[str(existing.id)])
            except Exception as e:
                print(f"Notice: Background queue trigger bypassed for {existing.ticker}: {e}")
            return str(existing.id)

        # 2. Try fetching from Yahoo Finance / NSE
        import yfinance as yf
        symbols_to_try = []
        if clean_ticker.endswith((".NS", ".BO", ".US", ".L")):
            symbols_to_try.append(clean_ticker)
        else:
            symbols_to_try.extend([f"{clean_ticker}.NS", f"{clean_ticker}.BO", clean_ticker])
            
        valid_symbol = None
        company_name = clean_ticker
        sector = "NSE"
        
        for sym in symbols_to_try:
            try:
                stk = yf.Ticker(sym)
                info_data = stk.info or {}
                hist = stk.history(period="5d")
                if (info_data and (info_data.get("regularMarketPrice") or info_data.get("currentPrice") or info_data.get("longName") or info_data.get("shortName"))) or (not hist.empty and len(hist) > 0):
                    valid_symbol = sym
                    company_name = info_data.get("longName", info_data.get("shortName", sym))
                    sector = info_data.get("sector", info_data.get("industry", "NSE"))
                    break
            except Exception:
                continue
                
        if not valid_symbol:
            return f"ERROR: Could not find live exchange trading data immediately for '{ticker}'. Please verify the NSE/BSE ticker symbol."
            
        new_company = Company(
            ticker=valid_symbol,
            name=company_name,
            sector=sector,
            purpose="Custom Analyzed Stock",
            upcoming_date="N/A"
        )
        db.add(new_company)
        db.commit()
        db.refresh(new_company)
        
        # 3. Immediately populate financials and true release dates synchronously
        try:
            from app.worker.tasks import enrich_single_company
            enrich_single_company(new_company, db)
            db.commit()
        except Exception as ex:
            print(f"Error enriching custom stock {valid_symbol}: {ex}")
            
        try:
            celery_app.send_task("app.worker.tasks.generate_deep_research_report_task", args=[str(new_company.id)])
        except Exception as e:
            print(f"Notice: Background queue trigger bypassed: {e}")
            
        return str(new_company.id)

    @strawberry.mutation
    def trigger_momentum_scan(self, info: Info[Context, None]) -> str:
        task = celery_app.send_task("app.worker.tasks.run_nse_momentum_scan_task")
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.run_nse_momentum_scan_task", info.context.user.email)
        return f"Momentum scanner task {task.id} started in the background."

    @strawberry.mutation
    def register_research_hypothesis(
        self,
        info: Info[Context, None],
        name: str,
        economic_mechanism: str,
        economic_rationale_text: str,
        alpha_expression: str,
        author: Optional[str] = "HUMAN_QUANT_ANALYST",
        target_universe: Optional[str] = "NIFTY500",
        holding_horizon_days: Optional[int] = 5
    ) -> str:
        from app.services.hypothesis_service import HypothesisService
        db = info.context.db
        svc = HypothesisService(db)
        res = svc.register_hypothesis(
            name=name,
            economic_mechanism=economic_mechanism,
            economic_rationale_text=economic_rationale_text,
            alpha_expression=alpha_expression,
            author=author or "HUMAN_QUANT_ANALYST",
            target_universe=target_universe or "NIFTY500",
            holding_horizon_days=holding_horizon_days or 5
        )
        if res.get("status") == "Error":
            return f"ERROR: {res.get('message')}"
        
        try:
            task = celery_app.send_task("app.worker.tasks.evaluate_single_hypothesis_task", args=[res["hypothesis_id"]])
            _log_queued_task(db, task.id, "app.worker.tasks.evaluate_single_hypothesis_task", info.context.user.email)
        except Exception as e:
            print(f"Notice: Background hypothesis evaluation trigger bypassed: {e}")
            
        return f"SUCCESS: Hypothesis {name} registered with ID {res.get('hypothesis_id')} in stage DRAFT_HYPOTHESIS."

    @strawberry.mutation
    def trigger_automated_hypothesis_research(self, info: Info[Context, None]) -> str:
        task = celery_app.send_task("app.worker.tasks.run_automated_hypothesis_research_task")
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.run_automated_hypothesis_research_task", info.context.user.email)
        return f"Automated AI hypothesis research task {task.id} started in background."

    @strawberry.mutation
    def trigger_celery_task(self, info: Info[Context, None], task_name: str) -> str:
        try:
            task = celery_app.send_task(task_name)
            _log_queued_task(info.context.db, task.id, task_name, info.context.user.email)
            return f"Successfully queued task '{task_name}' in background (ID: {task.id})."
        except Exception as e:
            return f"Failed to queue task '{task_name}': {str(e)}"

def _log_queued_task(db, task_id: str, name: str, user_email: str):
    from app.infrastructure.models import BackgroundJob
    from app.services.activity_logger import log_activity_start
    from app.worker.task_mappings import get_task_metadata
    
    # Maintain existing background job table for backwards compatibility
    job = BackgroundJob(celery_task_id=task_id, task_name=name, status="QUEUED")
    db.add(job)
    db.commit()
    
    # Also log to Admin Activity logs
    meta = get_task_metadata(name)
    log_activity_start(db, user_email, meta["event_type"], meta["event_name"], task_id, status="QUEUED")
