from __future__ import annotations

from pydantic import BaseModel, Field


class ClipSubmission(BaseModel):
    contributor_id: str = Field(min_length=8, max_length=64)
    task_id: str
    label: str
    landmarks: list[list[float]]
    duration_s: float


class ClipAccepted(BaseModel):
    clip_hash: str
    contributor_clip_count: int
    contributors_total: int
    collection_full: bool
