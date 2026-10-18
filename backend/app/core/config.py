from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central app configuration, loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "student_wellbeing"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    # 8 hours — one working session. At the previous 60 minutes users were
    # silently logged out mid-task; override via ACCESS_TOKEN_EXPIRE_MINUTES.
    access_token_expire_minutes: int = 480

    frontend_origin: str = "http://localhost:5173"
    env: str = "development"

    gemini_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
