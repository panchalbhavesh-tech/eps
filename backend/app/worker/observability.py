import json
import os
import redis
from datetime import datetime

# Lazy initialization of Redis client
_redis_client = None

def get_redis_client():
    global _redis_client
    if _redis_client is None:
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        _redis_client = redis.from_url(redis_url)
    return _redis_client

class TaskObserver:
    def __init__(self, task_id: str):
        self.task_id = task_id
        if not self.task_id:
            # If not running in Celery context, fallback to a dummy ID
            self.task_id = "local-sync"
            
        self.logs_key = f"worker_logs:{self.task_id}"
        self.progress_key = f"worker_progress:{self.task_id}"
        self.ttl = 86400 * 7  # 7 days retention
        
        # Clear any existing data on initialization
        r = get_redis_client()
        r.delete(self.logs_key)
        r.delete(self.progress_key)
        
        self.update(log_msg="Worker started", log_level="INFO", force=True)

    def update(self, progress: dict = None, log_msg: str = None, log_level: str = "INFO", force: bool = False):
        """
        Stream logs and progress to Redis.
        progress should be a dict, e.g.:
        {
            "total": 812,
            "processed": 505,
            "saved": 498,
            "failed": 7,
            "current_step": "Enriching company data",
            "percentage": 62.19
        }
        """
        try:
            r = get_redis_client()
            
            if log_msg:
                time_str = datetime.utcnow().strftime("%H:%M:%S")
                log_line = f"{time_str}  {log_level.ljust(7)}  {log_msg}"
                r.rpush(self.logs_key, log_line)
                r.expire(self.logs_key, self.ttl)
                
            if progress:
                r.setex(self.progress_key, self.ttl, json.dumps(progress))
                
        except Exception as e:
            # Do not crash the worker if Redis logging fails
            print(f"[TaskObserver] Failed to update state for {self.task_id}: {e}")
