from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env")

    database_url: str = "sqlite:///./fi_tracker.db"
    base_currency: str = "EUR"
    # 5174 is vite's automatic fallback port when 5173 is already in use
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]


settings = Settings()
