from __future__ import annotations

import asyncio
import hmac
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, cast
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.app.ws.room_handler import broadcast_room_update
from backend.core.room_store import InMemoryRoomStore
from backend.core.session_store import SessionStore
from backend.cv.kalman import EarKalman, HeadPoseKalman
from backend.models.session import BenchmarkResult, Event
from backend.models.ws import (
    WsBenchmarkEvent,
    WsFlagEvent,
    WsHeartbeatEvent,
    WsInboundMessage,
    WsOutboundTick,
    WsStateEvent,
)


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

    # Anti-spoofing: track both raw client EAR and server-derived Kalman EAR
    client_ear_raw: float = 0.0
    ear_divergence: float = 0.0

    # Server-side Kalman smoothers — give a second opinion on client data
    ear_kalman: EarKalman = field(default_factory=EarKalman)
    pose_kalman: HeadPoseKalman = field(default_factory=HeadPoseKalman)

    session_start: datetime | None = None
    flag_counts: dict[str, int] = field(default_factory=dict)
    flags_total: int = 0


# One live socket per student; the host pushes warnings / end-of-exam through it.
_session_sockets: dict[str, WebSocket] = {}
_session_sockets_lock = asyncio.Lock()
MAX_FLAGS_PER_SESSION = 5000
MEMBER_UPDATE_EVERY_S = 2.0


async def send_to_session(session_id: str, payload: dict[str, Any]) -> bool:
    async with _session_sockets_lock:
        ws = _session_sockets.get(session_id)
    if ws is None:
        return False
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


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
    last_member_update = 0.0

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
            client_ear_raw=state.client_ear_raw,
            ear_divergence=state.ear_divergence,
        )
        state.events_buffer.clear()

        now = time.monotonic()
        if room_store and room_id and now - last_member_update >= MEMBER_UPDATE_EVERY_S:
            last_member_update = now
            elapsed = 0
            if state.session_start is not None:
                elapsed = int((datetime.now(UTC) - state.session_start).total_seconds())
            try:
                await room_store.patch_member(room_id, session_id, {
                    "score": int(state.running_score),
                    "current_state": state.attention_state,
                    "elapsed_seconds": max(0, elapsed),
                    "event_count": state.flags_total,
                    "flags": dict(state.flag_counts),
                    "last_seen": datetime.now(UTC),
                })
                await broadcast_room_update(room_id, room_store, force=False)
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
    enriched_details = dict(ev.details) if ev.details else {}
    if state.ear_divergence > 0.0:
        enriched_details["ear_divergence"] = round(state.ear_divergence, 4)
        enriched_details["client_ear_raw"] = round(state.client_ear_raw, 4)
        enriched_details["server_ear"] = round(state.ear, 4)

    if state.flags_total >= MAX_FLAGS_PER_SESSION:
        return
    # Server clock, so a reconnect or a tampered client can't move events around.
    timestamp_s = ev.timestamp_s
    if state.session_start is not None:
        timestamp_s = max(0.0, (datetime.now(UTC) - state.session_start).total_seconds())
    state.flags_total += 1
    state.flag_counts[ev.event_type] = state.flag_counts.get(ev.event_type, 0) + 1

    event = Event(
        id=uuid4().hex,
        session_id=session_id,
        event_type=ev.event_type[:40],
        timestamp_s=timestamp_s,
        confidence=ev.confidence,
        details=enriched_details,
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
    state.attention_state = ev.attention_state[:20]
    state.face_count = ev.face_count
    # Exponential moving average of "focused", 0-100, for the live dashboard.
    focused = 100.0 if ev.attention_state == "focused" and ev.face_count <= 1 else 0.0
    state.running_score = 0.9 * state.running_score + 0.1 * focused

    # Client-reported raw values
    client_ear = ev.ear
    client_yaw = ev.head_pose.get("yaw", 0.0)
    client_pitch = ev.head_pose.get("pitch", 0.0)
    client_roll = ev.head_pose.get("roll", 0.0)

    # Server-side Kalman smoothing — provides a second opinion
    state.ear_kalman.predict()
    server_ear = state.ear_kalman.update(client_ear)

    import numpy as np
    state.pose_kalman.predict()
    smoothed = state.pose_kalman.update(np.array([client_yaw, client_pitch, client_roll]))

    # Store both raw and server-derived EAR for anti-spoofing
    state.client_ear_raw = client_ear
    state.ear = server_ear

    # Compute EAR divergence threshold check
    EAR_DIVERGENCE_THRESHOLD = 0.08
    divergence = abs(client_ear - server_ear)
    state.ear_divergence = divergence

    # Log divergence to the event buffer when it exceeds threshold
    if divergence > EAR_DIVERGENCE_THRESHOLD:
        state.events_buffer.append({
            "event_type": "ear_divergence",
            "timestamp_s": time.time(),
            "confidence": None,
            "details": {
                "client_ear": round(client_ear, 4),
                "server_ear": round(server_ear, 4),
                "divergence": round(divergence, 4),
                "note": "Client-reported EAR diverges from server-side Kalman estimate — possible spoofing",
            },
        })

    # Build head_pose dict with both client and server values
    state.head_pose = {
        "yaw": client_yaw,
        "pitch": client_pitch,
        "roll": client_roll,
        "server_smoothed_yaw": float(smoothed[0]),
        "server_smoothed_pitch": float(smoothed[1]),
        "server_smoothed_roll": float(smoothed[2]),
    }


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
    state = ConnectionState(running_score=100.0)
    store: SessionStore = cast(SessionStore, websocket.app.state.session_store)

    query_params = dict(websocket.query_params)
    expected_token = await store.get_ws_token(session_id)
    supplied_token = query_params.get("token", "")
    if expected_token is None or not hmac.compare_digest(expected_token, supplied_token):
        await websocket.close(code=4401)
        return

    session = await store.get_session(session_id)
    if session is not None:
        state.session_start = session.start
        for e in session.events:
            state.flags_total += 1
            state.flag_counts[e.event_type] = state.flag_counts.get(e.event_type, 0) + 1

    # Room membership and name come from the server, not from the query string.
    room_store = websocket.app.state.room_store
    requested_room = query_params.get("room_id")
    if requested_room:
        room = await room_store.get_room(requested_room)
        member = room.active_sessions.get(session_id) if room else None
        if member is None:
            await websocket.close(code=4403)
            return
        state.room_id = requested_room
        state.display_name = member.display_name

    await websocket.accept()
    if session is not None and session.status != "in_progress":
        await websocket.send_json({"type": "finalized", "status": session.status})
        await websocket.close()
        return

    async with _session_sockets_lock:
        previous = _session_sockets.get(session_id)
        _session_sockets[session_id] = websocket
    if previous is not None:
        # Same attempt opened twice (second tab or device): keep the newest, flag it.
        try:
            await previous.close(code=4409, reason="Exam opened somewhere else")
        except Exception:
            pass
        await _handle_flag(
            WsFlagEvent(event_type="multiple_connections", timestamp_s=0.0),
            session_id, state, store,
        )
    if state.room_id:
        await room_store.patch_member(state.room_id, session_id, {"status": "in_progress"})
        await broadcast_room_update(state.room_id, room_store)

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
        async with _session_sockets_lock:
            replaced = _session_sockets.get(session_id) is not websocket
            if not replaced:
                _session_sockets.pop(session_id, None)
        if state.room_id and not replaced:
            latest = await store.get_session(session_id)
            if latest is not None and latest.status == "in_progress":
                await room_store.patch_member(state.room_id, session_id, {"status": "disconnected"})
                await broadcast_room_update(state.room_id, room_store)


router = APIRouter()


@router.websocket("/ws/{session_id}")
async def ws_route(websocket: WebSocket, session_id: str) -> None:
    await ws_handler(websocket, session_id)
