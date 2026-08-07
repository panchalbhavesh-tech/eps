import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://qeps_user:qeps_password@postgres:5432/qeps_db")
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "super_secret_jwt_key_change_in_production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    FMP_API_KEY: str = os.environ.get("FMP_API_KEY", "")
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    QHLM_LIVE_TRADING_ENABLED: bool = os.environ.get("QHLM_LIVE_TRADING_ENABLED", "False").lower() in ("true", "1", "yes")
    SHADOW_PROBATION_DAYS: int = int(os.environ.get("SHADOW_PROBATION_DAYS", "252"))
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
