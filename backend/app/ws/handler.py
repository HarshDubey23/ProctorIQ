from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.core.session_store import SessionStore
from backend.core.room_store import InMemoryRoomStore
from backend.models.room import RoomMember
from backend.models.session import BenchmarkResult, Event
from backend.models.ws import (
    WsBenchmarkEvent,
    WsFlagEvent,
    WsHeartbeatEvent,
    WsInboundMessage,
    WsOutboundTick,
    WsStateEvent,
)
from backend.app.ws.room_handler import broadcast_room_update


@dataclass
class ConnectionState:
    attention_state: str = "unknown"
    ear: float = 0.0
    head_pose: dict[str, float] = field(default_factory=dict)
    face_count: int = 0
    events_buffer: list[dict[str, Any]] = field(default_factory=list)
    running_score: float = 0.0
    room_id: str | None = None
    display_name: str | None = None


async def _send_ticks(
    websocket: WebSocket,
    session_id: str,
    state: ConnectionState,
    stop_event: asyncio.Event,
    room_id: str | None = None,
    display_name: str | None = None,
) -> None:
    room_store: InMemoryRoomStore | None = None
    if room_id:
        room_store = cast(InMemoryRoomStore, websocket.app.state.room_store)

    while not stop_event.is_set():
        tick = WsOutboundTick(
            session_id=session_id,
            timestamp_s=time.time(),
            attention_state=state.attention_state,
            ear=state.ear,
            head_pose=state.head_pose,
            face_count=state.face_count,
            events_since_tick=list(state.events_buffer),
            running_score=state.running_score,
            room_id=room_id,
            display_name=display_name,
        )
        state.events_buffer.clear()

        if room_store and room_id:
            try:
                member = RoomMember(
                    session_id=session_id,
                    display_name=display_name or "Student",
                    score=int(state.running_score),
                    current_state=state.attention_state,
                    elapsed_seconds=int(time.time()),
                    event_count=len(state.events_buffer),
                    joined_at=datetime.now(timezone.utc),
                )
                await room_store.upsert_member(room_id, member)
                await broadcast_room_update(room_id, room_store)
            except Exception:
                pass

        try:
            await websocket.send_json(tick.model_dump(mode="json"))
        except Exception:
            return
        await asyncio.sleep(1)


async def _handle_flag(
    ev: WsFlagEvent,
    session_id: str,
    state: ConnectionState,
    store: SessionStore,
) -> None:
    event_id = abs(hash(json.dumps(ev.model_dump(mode="json"), sort_keys=True))) % (10**12)
    event = Event(
        id=str(event_id),
        session_id=session_id,
        event_type=ev.event_type,
        timestamp_s=ev.timestamp_s,
        confidence=ev.confidence,
        details=ev.details,
    )
    try:
        await store.add_event(session_id, event)
    except ValueError:
        pass
    state.events_buffer.append(
        {
            "event_type": event.event_type,
            "timestamp_s": event.timestamp_s,
            "confidence": event.confidence,
        }
    )


async def _handle_state(ev: WsStateEvent, state: ConnectionState) -> None:
    state.attention_state = ev.attention_state
    state.ear = ev.ear
    state.head_pose = ev.head_pose
    state.face_count = ev.face_count


async def _handle_benchmark(ev: WsBenchmarkEvent, session_id: str, store: SessionStore) -> None:
    session = await store.get_session(session_id)
    if session is None:
        return
    bench = BenchmarkResult(
        model_latency_ms=ev.model_latency_ms,
        inference_count=ev.inference_count,
        pca_latency_ms=ev.pca_latency_ms,
        total_events=len(session.events),
    )
    session.benchmark = bench
    await store.update_session(session)


async def ws_handler(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    state = ConnectionState()
    store: SessionStore = cast(SessionStore, websocket.app.state.session_store)

    query_params = dict(websocket.query_params)
    state.room_id = query_params.get("room_id")
    state.display_name = query_params.get("display_name")

    stop_event = asyncio.Event()
    tick_task = asyncio.create_task(
        _send_ticks(websocket, session_id, state, stop_event, state.room_id, state.display_name)
    )

    try:
        while True:
            raw = await websocket.receive_json()
            try:
                parsed = WsInboundMessage.model_validate(raw)
            except ValidationError:
                continue

            event = parsed.root
            if isinstance(event, WsFlagEvent):
                await _handle_flag(event, session_id, state, store)
            elif isinstance(event, WsStateEvent):
                await _handle_state(event, state)
            elif isinstance(event, WsHeartbeatEvent):
                pass
            elif isinstance(event, WsBenchmarkEvent):
                await _handle_benchmark(event, session_id, store)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop_event.set()
        tick_task.cancel()
        try:
            await tick_task
        except asyncio.CancelledError:
            pass


router = APIRouter()


@router.websocket("/ws/{session_id}")
async def ws_route(websocket: WebSocket, session_id: str) -> None:
    await ws_handler(websocket, session_id)
