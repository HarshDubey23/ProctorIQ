from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
    quiz_score: float | None = Field(
        default=None,
        description="Exam correctness percentage (e.g. 80 for 80%) — set client-side, not an integrity metric",
    )
    final_score: float | None = Field(
        default=None,
        description="Server-derived aggregate score — not client-input",
    )
    pct_focused: float | None = Field(
        default=None,
        description="Server-derived focus percentage — not client-input",
    )
    verdict: Verdict | None = Field(
        default=None,
        description="Server-derived integrity verdict — not client-input",
    )
    events: list[Event] = Field(
        default=[],
        description="Events — only appendable server-side via WebSocket flag handler",
    )
    benchmark: BenchmarkResult | None = Field(
        default=None,
        description="Benchmark — only settable server-side via WebSocket benchmark handler",
    )


class SessionCreate(BaseModel):
    """Restricted model for POST — client cannot supply integrity or score fields."""

    model_config = ConfigDict(frozen=False, extra="forbid")

    id: str = ""
    start: datetime | None = None
    end: datetime | None = None
    mode: str = "selftest"
    benchmark: BenchmarkResult | None = None


class SessionUpdate(BaseModel):
    """Restricted model for PATCH — only non-integrity fields are mutable by the client."""

    model_config = ConfigDict(frozen=False, extra="forbid")

    end: datetime | None = None
    mode: str | None = None


class SessionSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    session_id: str
    start: datetime
    end: datetime | None
    mode: str
    quiz_score: float | None = None
    final_score: float | None
    pct_focused: float | None
    verdict: Verdict | None
    event_counts: dict[str, int]
