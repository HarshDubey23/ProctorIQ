from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

MIN_FRAMES = 15  # match the quality bar ml/collect.py already enforces locally
EXPECTED_COORDS_PER_FRAME = 936  # 468 landmarks * (x, y)


class ClipSubmission(BaseModel):
    contributor_id: str = Field(min_length=8, max_length=64)
    task_id: str
    label: str
    landmarks: list[list[float]] = Field(min_length=MIN_FRAMES)
    duration_s: float

    @field_validator("landmarks")
    @classmethod
    def check_frame_shape(cls, v: list[list[float]]) -> list[list[float]]:
        for frame in v:
            if len(frame) != EXPECTED_COORDS_PER_FRAME:
                raise ValueError(
                    f"each frame must have {EXPECTED_COORDS_PER_FRAME} floats, got {len(frame)}"
                )
        return v


class ClipAccepted(BaseModel):
    clip_hash: str
    contributor_clip_count: int
    contributors_total: int
    collection_full: bool
