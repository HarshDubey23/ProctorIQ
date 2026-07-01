from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.room_store import InMemoryRoomStore

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _get_room_store(request: Request) -> InMemoryRoomStore:
    return cast(InMemoryRoomStore, request.app.state.room_store)


@router.post("", status_code=201)
async def create_room(
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> dict[str, str]:
    room = await store.create_room()
    return {"room_id": room.room_id}


@router.get("/{room_id}")
async def get_room(
    room_id: str,
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> dict[str, Any]:
    room = await store.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "room_id": room.room_id,
        "created_at": room.created_at.isoformat(),
        "members": [
            {
                "session_id": m.session_id,
                "display_name": m.display_name,
                "score": m.score,
                "current_state": m.current_state,
                "elapsed_seconds": m.elapsed_seconds,
                "event_count": m.event_count,
                "joined_at": m.joined_at.isoformat(),
            }
            for m in room.active_sessions.values()
        ],
    }
