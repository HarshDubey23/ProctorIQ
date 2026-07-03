from __future__ import annotations

import json
from typing import cast

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.room_store import InMemoryRoomStore

router = APIRouter()

_room_sockets: dict[str, set[WebSocket]] = {}


async def broadcast_room_update(room_id: str, store: InMemoryRoomStore) -> None:
    room = await store.get_room(room_id)
    if room is None:
        return
    members = [
        {
            "session_id": m.session_id,
            "display_name": m.display_name,
            "score": m.score,
            "current_state": m.current_state,
            "elapsed_seconds": m.elapsed_seconds,
            "event_count": m.event_count,
        }
        for m in room.active_sessions.values()
    ]
    payload = {
        "type": "room_update",
        "room_id": room_id,
        "title": room.title,
        "status": room.status,
        "duration_minutes": room.duration_minutes,
        "members": members,
    }
    sockets = _room_sockets.get(room_id, set())
    stale: set[WebSocket] = set()
    for ws in sockets:
        try:
            await ws.send_json(payload)
        except Exception:
            stale.add(ws)
    sockets -= stale
    _room_sockets[room_id] = sockets


@router.websocket("/ws/room/{room_id}")
async def room_ws(websocket: WebSocket, room_id: str) -> None:
    store: InMemoryRoomStore = cast(InMemoryRoomStore, websocket.app.state.room_store)
    room = await store.get_room(room_id)
    if room is None:
        await websocket.close(code=4004, reason="Room not found")
        return

    if room.status == "closed":
        await websocket.close(code=4004, reason="Room is closed")
        return

    await websocket.accept()
    _room_sockets.setdefault(room_id, set()).add(websocket)

    initial_room = await store.get_room(room_id)
    if initial_room:
        members = [
            {
                "session_id": m.session_id,
                "display_name": m.display_name,
                "score": m.score,
                "current_state": m.current_state,
                "elapsed_seconds": m.elapsed_seconds,
                "event_count": m.event_count,
            }
            for m in initial_room.active_sessions.values()
        ]
        await websocket.send_json({
            "type": "room_update",
            "room_id": room_id,
            "title": initial_room.title,
            "status": initial_room.status,
            "duration_minutes": initial_room.duration_minutes,
            "members": members,
        })

    try:
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
        _room_sockets.get(room_id, set()).discard(websocket)
