from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from strawberry.fastapi import GraphQLRouter
from app.graphql.schema import schema
from app.graphql.context import get_context
from app.infrastructure.database import engine, Base, SessionLocal
from app.infrastructure.models import User
from app.core.security import get_password_hash
from app.worker.celery_app import celery_app

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database models first so new tables are created
    Base.metadata.create_all(bind=engine)

    # Ensure all columns exist on already-created tables via migration
    try:
        import migrate
        migrate.upgrade_db()
    except Exception as e:
        print(f"Automatic migration check failed or skipped: {e}")
    
    # Seed default admin user and Trigger Automated NSE Sync
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@qeps.com").first()
        if not admin:
            hashed_pw = get_password_hash("adminpassword")
            admin = User(email="admin@qeps.com", hashed_password=hashed_pw)
            db.add(admin)
            db.commit()
            print("Default admin user created.")
            
        # Dispatch the NSE sync task asynchronously to populate database in background
        print("Dispatching automated NSE Calendar sync...")
        celery_app.send_task("app.worker.tasks.sync_nse_calendar_task")
    finally:
        db.close()
    
    yield

app = FastAPI(title="QEPS API", lifespan=lifespan)

graphql_app = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_app, prefix="/graphql")

import time
from collections import defaultdict
from fastapi.responses import JSONResponse

# Simple in-memory rate limiter (100 requests / minute)
_rate_limits = defaultdict(list)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not request.url.path.startswith("/health"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        
        # Keep only timestamps from the last 60 seconds
        _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < 60]
        
        if len(_rate_limits[client_ip]) >= 100:
            return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})
            
        _rate_limits[client_ip].append(now)
        
    return await call_next(request)


@app.get("/health")
def health_check():
    return {"status": "ok"}

from fastapi import Depends, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key(api_key_header: str = Security(api_key_header)):
    # In production this would check against a DB of valid keys
    if api_key_header == "QEPS-INTERNAL-SECURE-KEY":
        return api_key_header
    raise HTTPException(status_code=403, detail="Forbidden")

@app.get("/sentiment/{ticker}", dependencies=[Depends(get_api_key)])
@app.get("/api/sentiment/{ticker}", dependencies=[Depends(get_api_key)])
def get_company_sentiment(ticker: str, name: str = "", sector: str = ""):
    from app.services.ai_analyst_service import AIAnalystService
    service = AIAnalystService()
    return service.evaluate_multi_source_sentiment(
        ticker=ticker,
        company_name=name or ticker,
        sector=sector or "Indian Equities"
    )
