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
    # Never sent to the host dashboard; proves the browser holding it is this student.
    student_token: str = ""
    status: str = "joined"  # joined | in_progress | submitted | terminated | disconnected
    started_at: datetime | None = None
    answered: int = 0
    flags: dict[str, int] = {}
    last_seen: datetime | None = None
    warnings: int = 0


class Room(BaseModel):
    room_id: str
    created_at: datetime
    title: str = ""
    paper_id: str = ""
    duration_minutes: int | None = None
    max_participants: int | None = None
    host_token: str = ""
    status: Literal["open", "closed"] = "open"
    closed_at: datetime | None = None
    active_sessions: dict[str, RoomMember] = {}
