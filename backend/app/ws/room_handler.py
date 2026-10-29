from __future__ import annotations

import asyncio
import hmac
import json
import time
from typing import Any, cast

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.room_store import InMemoryRoomStore, SqliteRoomStore
from backend.models.room import Room, RoomMember

router = APIRouter()

_room_sockets: dict[str, set[WebSocket]] = {}
_room_sockets_lock = asyncio.Lock()
_last_broadcast: dict[str, float] = {}
_RoomStoreType = InMemoryRoomStore | SqliteRoomStore

# Each student ticks every couple of seconds; cap host fan-out per room.
BROADCAST_MIN_INTERVAL_S = 1.0


def member_view(m: RoomMember) -> dict[str, Any]:
    """What the host dashboard sees — never the student token."""
    return {
        "session_id": m.session_id,
        "display_name": m.display_name,
        "score": m.score,
        "current_state": m.current_state,
        "elapsed_seconds": m.elapsed_seconds,
        "event_count": m.event_count,
        "status": m.status,
        "answered": m.answered,
        "flags": m.flags,
        "warnings": m.warnings,
        "joined_at": m.joined_at.isoformat(),
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "last_seen": m.last_seen.isoformat() if m.last_seen else None,
    }


def room_payload(room: Room) -> dict[str, Any]:
    return {
        "type": "room_update",
        "room_id": room.room_id,
        "title": room.title,
        "status": room.status,
        "duration_minutes": room.duration_minutes,
        "created_at": room.created_at.isoformat(),
        "closed_at": room.closed_at.isoformat() if room.closed_at else None,
        "members": [member_view(m) for m in room.active_sessions.values()],
    }


async def broadcast_room_update(room_id: str, store: _RoomStoreType, force: bool = True) -> None:
    now = time.monotonic()
    if not force and now - _last_broadcast.get(room_id, 0.0) < BROADCAST_MIN_INTERVAL_S:
        return
    async with _room_sockets_lock:
        sockets = _room_sockets.get(room_id, set()).copy()
    if not sockets:
        return
    room = await store.get_room(room_id)
    if room is None:
        return
    _last_broadcast[room_id] = now
    payload = room_payload(room)
    stale: set[WebSocket] = set()
    for ws in sockets:
        try:
            await ws.send_json(payload)
        except Exception:
            stale.add(ws)
    if stale:
        async with _room_sockets_lock:
            _room_sockets[room_id] -= stale


@router.websocket("/ws/room/{room_id}")
async def room_ws(websocket: WebSocket, room_id: str) -> None:
    store: _RoomStoreType = cast(_RoomStoreType, websocket.app.state.room_store)
    room = await store.get_room(room_id)
    if room is None:
        await websocket.close(code=4004, reason="Room not found")
        return
    token = websocket.query_params.get("host_token", "")
    if not token or not hmac.compare_digest(room.host_token, token):
        await websocket.close(code=4401, reason="Invalid host token")
        return

    await websocket.accept()
    async with _room_sockets_lock:
        _room_sockets.setdefault(room_id, set()).add(websocket)

    try:
        await websocket.send_json(room_payload(room))
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _room_sockets_lock:
            _room_sockets.get(room_id, set()).discard(websocket)
