from __future__ import annotations

from datetime import datetime
from typing import Literal


from pydantic import BaseModel


class RoomMember(BaseModel):
    session_id: str
    display_name: str
    score: int
    current_state: str
    elapsed_seconds: int
    event_count: int
    joined_at: datetime


class Room(BaseModel):
    room_id: str
    created_at: datetime
    title: str = ""
    paper_id: str = ""
    duration_minutes: int | None = None
    max_participants: int | None = None
    host_token: str = ""
    status: Literal["open", "closed"] = "open"
    active_sessions: dict[str, RoomMember] = {}
