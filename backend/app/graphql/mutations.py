import strawberry
from strawberry.types import Info
from app.graphql.types import AuthPayload, UserType
from app.services.auth_service import AuthService
from app.graphql.context import Context

@strawberry.type
class Mutation:
    @strawberry.mutation
    def login(self, info: Info[Context, None], email: str, password: str) -> AuthPayload:
        db = info.context.db
        auth_service = AuthService(db)
        result = auth_service.login(email, password)
        
        if not result:
            raise Exception("Invalid credentials")
            
        # Refetch user to include in payload
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
        from app.worker.tasks import generate_prediction_task
        task = generate_prediction_task.delay(company_id)
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.generate_prediction_task")
        return f"Prediction task {task.id} started."
        
    @strawberry.mutation
    def populate_companies_data(self, info: Info[Context, None]) -> str:
        from app.worker.tasks import populate_companies_data_task
        task = populate_companies_data_task.delay()
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.populate_companies_data_task")
        return f"Populate data task {task.id} started in the background."
        
    @strawberry.mutation
    def sync_nse_calendar(self, info: Info[Context, None]) -> str:
        from app.worker.celery_app import celery_app
        task = celery_app.send_task("app.worker.tasks.sync_nse_calendar_task")
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.sync_nse_calendar_task")
        return f"NSE Sync task queued with ID: {task.id}"

    @strawberry.mutation
    def analyze_company(self, info: Info[Context, None], company_id: str) -> str:
        from app.worker.tasks import generate_deep_research_report_task
        task = generate_deep_research_report_task.delay(company_id)
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.generate_deep_research_report_task")
        return f"Deep research analysis task {task.id} started in the background."

    @strawberry.mutation
    def mass_calculate_financial_health(self, info: Info[Context, None]) -> str:
        from app.worker.tasks import mass_calculate_financial_health_task
        task = mass_calculate_financial_health_task.delay()
        _log_queued_task(info.context.db, task.id, "app.worker.tasks.mass_calculate_financial_health_task")
        return f"Mass financial health calculation task {task.id} queued in background."

def _log_queued_task(db, task_id: str, name: str):
    from app.infrastructure.models import BackgroundJob
    job = BackgroundJob(celery_task_id=task_id, task_name=name, status="QUEUED")
    db.add(job)
    db.commit()
