from __future__ import annotations

import json
from typing import cast

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]

    ear_threshold: float = 0.25
    head_pose_yaw_threshold: float = 30.0
    head_pose_pitch_threshold: float = 20.0
    head_pose_roll_threshold: float = 30.0

    session_timeout_minutes: int = 60

    rate_limit: str = "60/minute"

    report_signing_secret: str = "dev-secret-not-for-production"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return cast("list[str]", json.loads(v))
        return v


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
