from __future__ import annotations

import hmac
from typing import cast

from fastapi import Depends, Header, HTTPException, Request

from backend.core.room_store import InMemoryRoomStore


def _get_room_store(request: Request) -> InMemoryRoomStore:
    return cast(InMemoryRoomStore, request.app.state.room_store)


async def require_host_token(
    room_id: str,
    x_host_token: str = Header(...),
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> None:
    room = await store.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if not hmac.compare_digest(room.host_token, x_host_token):
        raise HTTPException(status_code=403, detail="Invalid host token")
