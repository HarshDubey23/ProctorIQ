from __future__ import annotations

import asyncio
import random
import string
from datetime import datetime, timezone
from typing import Protocol

from backend.models.room import Room, RoomMember


class RoomStore(Protocol):
    async def create_room(self) -> Room: ...
    async def get_room(self, room_id: str) -> Room | None: ...
    async def upsert_member(self, room_id: str, member: RoomMember) -> None: ...
    async def remove_member(self, room_id: str, session_id: str) -> None: ...
    async def cleanup_stale_rooms(self) -> None: ...


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

    async def create_room(self) -> Room:
        async with self._lock:
            while True:
                room_id = _generate_room_id()
                if room_id not in self._rooms:
                    break
            room = Room(room_id=room_id, created_at=datetime.now(timezone.utc))
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
            room.active_sessions[member.session_id] = member
            self._last_activity[room_id] = datetime.now(timezone.utc)

    async def remove_member(self, room_id: str, session_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(room_id)
            if room is not None:
                room.active_sessions.pop(session_id, None)
                self._last_activity[room_id] = datetime.now(timezone.utc)

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
