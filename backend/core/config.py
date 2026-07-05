from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, cast

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_HERE = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_HERE / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    environment: Literal["development", "production"] = "development"

    ear_threshold: float = 0.25
    head_pose_yaw_threshold: float = 30.0
    head_pose_pitch_threshold: float = 20.0
    head_pose_roll_threshold: float = 30.0

    session_timeout_minutes: int = 60

    rate_limit: str = "60/minute"

    sqlite_path: str = ""

    report_signing_secret: str = "dev-secret-not-for-production"
    hf_api_token: str = ""
    hf_model_id: str = "openai/gpt-oss-120b:fastest"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return cast("list[str]", json.loads(v))
        return v

    @model_validator(mode="after")
    def production_requires_real_signing_secret(self) -> "Settings":
        if (
            self.environment == "production"
            and self.report_signing_secret == "dev-secret-not-for-production"
        ):
            raise RuntimeError(
                "REPORT_SIGNING_SECRET must be changed when ENVIRONMENT=production"
            )
        return self


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
