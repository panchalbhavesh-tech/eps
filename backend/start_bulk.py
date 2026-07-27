from app.worker.tasks import populate_companies_data_task
if __name__ == "__main__":
    print("Starting background worker for remaining companies...")
    populate_companies_data_task.delay()
    print("Task sent to Celery!")
