from __future__ import annotations

import asyncio
import json
import random
import secrets
import string
from datetime import datetime, timezone
from typing import Literal, Protocol

from sqlmodel import Field, SQLModel, select

from backend.core.database import get_session
from backend.models.room import Room, RoomMember


class RoomRow(SQLModel, table=True):
    __tablename__ = "rooms"
    room_id: str = Field(primary_key=True)
    created_at: str
    title: str = ""
    paper_id: str = ""
    duration_minutes: int | None = None
    max_participants: int | None = None
    host_token: str = ""
    status: str = "open"
    active_sessions_json: str = "{}"
    last_activity: str = ""


class RoomStore(Protocol):
    async def create_room(
        self,
        title: str = "",
        duration_minutes: int | None = None,
        max_participants: int | None = None,
    ) -> Room: ...
    async def get_room(self, room_id: str) -> Room | None: ...
    async def upsert_member(self, room_id: str, member: RoomMember) -> None: ...
    async def remove_member(self, room_id: str, session_id: str) -> None: ...
    async def cleanup_stale_rooms(self) -> None: ...
    async def close_room(self, room_id: str) -> Room | None: ...
    async def list_room_participants(self, room_id: str) -> list[RoomMember]: ...


def _generate_room_id() -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=6))


class InMemoryRoomStore:
    """Thread-safe in-memory room store.

    Swap for RedisRoomStore in production — interface is stable.
    Rooms expire after 2 hours of inactivity.
    """

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._last_activity: dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def create_room(
        self,
        title: str = "",
        paper_id: str = "",
        duration_minutes: int | None = None,
        max_participants: int | None = None,
    ) -> Room:
        async with self._lock:
            while True:
                room_id = _generate_room_id()
                if room_id not in self._rooms:
                    break
            host_token = secrets.token_urlsafe(32)
            room = Room(
                room_id=room_id,
                created_at=datetime.now(timezone.utc),
                title=title,
                paper_id=paper_id,
                duration_minutes=duration_minutes,
                max_participants=max_participants,
                host_token=host_token,
            )
            self._rooms[room_id] = room
            self._last_activity[room_id] = datetime.now(timezone.utc)
            return room

    async def get_room(self, room_id: str) -> Room | None:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is not None:
                self._last_activity[room_id] = datetime.now(timezone.utc)
            return room

    async def upsert_member(self, room_id: str, member: RoomMember) -> None:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is None:
                raise ValueError(f"Room {room_id} not found")
            if room.status == "closed":
                raise ValueError("Room is closed")
            if (
                room.max_participants is not None
                and member.session_id not in room.active_sessions
                and len(room.active_sessions) >= room.max_participants
            ):
                raise ValueError("Room is at maximum capacity")
            room.active_sessions[member.session_id] = member
            self._last_activity[room_id] = datetime.now(timezone.utc)

    async def remove_member(self, room_id: str, session_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is not None:
                room.active_sessions.pop(session_id, None)
                self._last_activity[room_id] = datetime.now(timezone.utc)

    async def close_room(self, room_id: str) -> Room | None:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is not None:
                room.status = "closed"
                self._last_activity[room_id] = datetime.now(timezone.utc)
            return room.model_copy(deep=True) if room else None

    async def get_room_for_session(self, session_id: str) -> Room | None:
        async with self._lock:
            for room in self._rooms.values():
                if session_id in room.active_sessions:
                    return room.model_copy(deep=True)
            return None

    async def list_room_participants(self, room_id: str) -> list[RoomMember]:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is None:
                return []
            return list(room.active_sessions.values())

    async def cleanup_stale_rooms(self) -> None:
        async with self._lock:
            now = datetime.now(timezone.utc)
            stale = [
                rid
                for rid, last in self._last_activity.items()
                if (now - last).total_seconds() > 7200  # 2 hours
            ]
            for rid in stale:
                self._rooms.pop(rid, None)
                self._last_activity.pop(rid, None)


def _room_from_row(row: RoomRow) -> Room:
    active_sessions_data = json.loads(row.active_sessions_json) if row.active_sessions_json else {}
    active_sessions = {}
    for sid, member_data in active_sessions_data.items():
        active_sessions[sid] = RoomMember(**member_data)
    status_val: Literal["open", "closed"] = "open" if row.status == "open" else "closed"
    return Room(
        room_id=row.room_id,
        created_at=datetime.fromisoformat(row.created_at),
        title=row.title,
        paper_id=row.paper_id,
        duration_minutes=row.duration_minutes,
        max_participants=row.max_participants,
        host_token=row.host_token,
        status=status_val,
        active_sessions=active_sessions,
    )


def _row_from_room(room: Room) -> RoomRow:
    active_sessions_data = {
        sid: member.model_dump() for sid, member in room.active_sessions.items()
    }
    return RoomRow(
        room_id=room.room_id,
        created_at=room.created_at.isoformat(),
        title=room.title,
        paper_id=room.paper_id,
        duration_minutes=room.duration_minutes,
        max_participants=room.max_participants,
        host_token=room.host_token,
        status=room.status,
        active_sessions_json=json.dumps(active_sessions_data),
        last_activity=datetime.now(timezone.utc).isoformat(),
    )


class SqliteRoomStore:
    async def create_room(
        self,
        title: str = "",
        paper_id: str = "",
        duration_minutes: int | None = None,
        max_participants: int | None = None,
    ) -> Room:
        async with get_session() as db:
            while True:
                room_id = _generate_room_id()
                existing = await db.execute(select(RoomRow).where(RoomRow.room_id == room_id))
                if existing.scalar_one_or_none() is None:
                    break
            host_token = secrets.token_urlsafe(32)
            now = datetime.now(timezone.utc)
            room = Room(
                room_id=room_id,
                created_at=now,
                title=title,
                paper_id=paper_id,
                duration_minutes=duration_minutes,
                max_participants=max_participants,
                host_token=host_token,
            )
            row = _row_from_room(room)
            db.add(row)
            await db.commit()
            await db.refresh(row)
            return _room_from_row(row)

    async def get_room(self, room_id: str) -> Room | None:
        async with get_session() as db:
            row = await db.get(RoomRow, room_id)
            if row is None:
                return None
            row.last_activity = datetime.now(timezone.utc).isoformat()
            await db.commit()
            return _room_from_row(row)

    async def upsert_member(self, room_id: str, member: RoomMember) -> None:
        async with get_session() as db:
            row = await db.get(RoomRow, room_id)
            if row is None:
                raise ValueError(f"Room {room_id} not found")
            if row.status == "closed":
                raise ValueError("Room is closed")
            sessions = json.loads(row.active_sessions_json) if row.active_sessions_json else {}
            if (
                row.max_participants is not None
                and member.session_id not in sessions
                and len(sessions) >= row.max_participants
            ):
                raise ValueError("Room is at maximum capacity")
            sessions[member.session_id] = member.model_dump()
            row.active_sessions_json = json.dumps(sessions)
            row.last_activity = datetime.now(timezone.utc).isoformat()
            await db.commit()

    async def remove_member(self, room_id: str, session_id: str) -> None:
        async with get_session() as db:
            row = await db.get(RoomRow, room_id)
            if row is not None:
                sessions = json.loads(row.active_sessions_json) if row.active_sessions_json else {}
                sessions.pop(session_id, None)
                row.active_sessions_json = json.dumps(sessions)
                row.last_activity = datetime.now(timezone.utc).isoformat()
                await db.commit()

    async def close_room(self, room_id: str) -> Room | None:
        async with get_session() as db:
            row = await db.get(RoomRow, room_id)
            if row is None:
                return None
            row.status = "closed"
            row.last_activity = datetime.now(timezone.utc).isoformat()
            await db.commit()
            await db.refresh(row)
            return _room_from_row(row)

    async def get_room_for_session(self, session_id: str) -> Room | None:
        async with get_session() as db:
            result = await db.execute(select(RoomRow))
            rows = result.scalars().all()
            for row in rows:
                sessions = json.loads(row.active_sessions_json) if row.active_sessions_json else {}
                if session_id in sessions:
                    return _room_from_row(row)
            return None

    async def list_room_participants(self, room_id: str) -> list[RoomMember]:
        async with get_session() as db:
            row = await db.get(RoomRow, room_id)
            if row is None:
                return []
            sessions = json.loads(row.active_sessions_json) if row.active_sessions_json else {}
            return [RoomMember(**data) for data in sessions.values()]

    async def cleanup_stale_rooms(self) -> None:
        async with get_session() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(select(RoomRow))
            rows = result.scalars().all()
            for row in rows:
                last = datetime.fromisoformat(row.last_activity) if row.last_activity else None
                if last and (now - last).total_seconds() > 7200:
                    await db.delete(row)
            await db.commit()
