from fastapi import FastAPI
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
    # Ensure all columns exist via migration before initializing models
    try:
        import migrate
        migrate.upgrade_db()
    except Exception as e:
        print(f"Automatic migration check failed or skipped: {e}")

    # Initialize database models
    Base.metadata.create_all(bind=engine)
    
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

@app.get("/health")
def health_check():
    return {"status": "ok"}
