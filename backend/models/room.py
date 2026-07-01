from __future__ import annotations

from datetime import datetime


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
    active_sessions: dict[str, RoomMember] = {}
