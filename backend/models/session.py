from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict


class Verdict(str, Enum):
    PASS = "PASS"
    FLAGGED = "FLAGGED"
    REVIEW = "REVIEW"
    INCONCLUSIVE = "INCONCLUSIVE"


class Event(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    session_id: str
    event_type: str
    timestamp_s: float
    confidence: float | None = None
    details: dict[str, Any] | None = None


class BenchmarkResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_latency_ms: float
    inference_count: int
    pca_latency_ms: float
    total_events: int


class Session(BaseModel):
    model_config = ConfigDict(frozen=False)

    id: str
    start: datetime
    end: datetime | None = None
    mode: str
    final_score: float | None = None
    pct_focused: float | None = None
    verdict: Verdict | None = None
    events: list[Event] = []
    benchmark: BenchmarkResult | None = None


class SessionSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    session_id: str
    start: datetime
    end: datetime | None
    mode: str
    final_score: float | None
    pct_focused: float | None
    verdict: Verdict | None
    event_counts: dict[str, int]
