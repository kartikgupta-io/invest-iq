"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for InvestIQ. Sensible defaults keep the app runnable offline."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "InvestIQ API"
    api_prefix: str = "/api/v1"
    host: str = "0.0.0.0"
    port: int = 8000

    database_url: str = ""
    fixtures_dir: str = str(Path(__file__).resolve().parents[2] / "app" / "fixtures")

    lm_studio_url: str = "http://127.0.0.1:1234"
    embedding_model: str = "text-embedding-nomic-embed-text-v1.5"
    llm_model: str = "deepseek-v4-pro-qwen3.5-4b-mtp@q4_k_m"
    llm_enabled: bool = True
    redis_url: str = "redis://localhost:6379/0"

    ai_provider: str = "auto"
    ai_model: str = "deepseek-v4-pro-qwen3.5-4b-mtp@q4_k_m"

    cors_origins: list[str] = ["http://localhost:3000"]

    @model_validator(mode="after")
    def _reject_wildcard_cors_with_credentials(self) -> Settings:
        if "*" in self.cors_origins:
            raise ValueError("cors_origins must list explicit origins when allow_credentials=True")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return the cached ``Settings`` singleton."""
    return Settings()