from __future__ import annotations

from pydantic import BaseModel, Field


class AccommodationProfile(BaseModel):
    id: str
    student_name: str
    extended_time_minutes: int = Field(default=0, ge=0, le=240)
    relaxed_proctoring: bool = False
    notes: str = ""


class AccommodationProfileCreate(BaseModel):
    student_name: str
    extended_time_minutes: int = Field(default=0, ge=0, le=240)
    relaxed_proctoring: bool = False
    notes: str = ""
