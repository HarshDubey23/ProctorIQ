from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.room_store import InMemoryRoomStore
from backend.cv.scoring import FlagEvent, compute_attention_score
from backend.models.session import Verdict
from backend.report.pdf import generate_session_pdf
from backend.report.signing import sign_session

router = APIRouter(prefix="/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    title: str = ""
    duration_minutes: int | None = None
    max_participants: int | None = None


def _get_room_store(request: Request) -> InMemoryRoomStore:
    return cast(InMemoryRoomStore, request.app.state.room_store)


def _get_session_store(request: Request) -> Any:
    return request.app.state.session_store


async def _require_host_token(
    room_id: str,
    x_host_token: str = Header(...),
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> None:
    import hmac

    room = await store.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if not hmac.compare_digest(room.host_token, x_host_token):
        raise HTTPException(status_code=403, detail="Invalid host token")


def _check_room_rate_limit(request: Request, key: str, max_per_hour: int = 10) -> None:
    """Simple in-memory per-app rate limiter using app.state."""
    import time

    state = request.app.state
    if not hasattr(state, "_room_rate_limits"):
        state._room_rate_limits = {}

    now = time.time()
    window = 3600  # 1 hour
    limits = state._room_rate_limits
    if key not in limits:
        limits[key] = []
    limits[key] = [t for t in limits[key] if now - t < window]
    if len(limits[key]) >= max_per_hour:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    limits[key].append(now)


def _check_join_rate_limit(request: Request, key: str, max_per_minute: int = 20) -> None:
    """Simple in-memory per-app rate limiter using app.state."""
    import time

    state = request.app.state
    if not hasattr(state, "_join_rate_limits"):
        state._join_rate_limits = {}

    now = time.time()
    window = 60
    limits = state._join_rate_limits
    if key not in limits:
        limits[key] = []
    limits[key] = [t for t in limits[key] if now - t < window]
    if len(limits[key]) >= max_per_minute:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    limits[key].append(now)


@router.post("", status_code=201)
async def create_room(
    body: CreateRoomRequest,
    request: Request,
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> dict[str, str]:
    from slowapi.util import get_remote_address
    _check_room_rate_limit(request, get_remote_address(request))
    room = await store.create_room(
        title=body.title,
        duration_minutes=body.duration_minutes,
        max_participants=body.max_participants,
    )
    return {
        "room_id": room.room_id,
        "host_token": room.host_token,
        "join_url": f"/join/{room.room_id}",
    }


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
        "title": room.title,
        "created_at": room.created_at.isoformat(),
        "duration_minutes": room.duration_minutes,
        "max_participants": room.max_participants,
        "status": room.status,
        "member_count": len(room.active_sessions),
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


@router.get("/{room_id}/join-check")
async def check_room_join(
    room_id: str,
    request: Request,
    store: InMemoryRoomStore = Depends(_get_room_store),
) -> dict[str, Any]:
    from slowapi.util import get_remote_address
    _check_join_rate_limit(request, get_remote_address(request))
    room = await store.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status == "closed":
        raise HTTPException(status_code=410, detail="This exam has already ended")
    if (
        room.max_participants is not None
        and len(room.active_sessions) >= room.max_participants
    ):
        raise HTTPException(status_code=429, detail="Room is full")
    return {
        "room_id": room.room_id,
        "title": room.title,
        "status": room.status,
        "duration_minutes": room.duration_minutes,
        "member_count": len(room.active_sessions),
    }


@router.post("/{room_id}/close", status_code=200)
async def close_room(
    room_id: str,
    store: InMemoryRoomStore = Depends(_get_room_store),
    _: None = Depends(_require_host_token),
) -> dict[str, str]:
    room = await store.close_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room.room_id, "status": room.status}


@router.get("/{room_id}/reports")
async def get_room_reports(
    room_id: str,
    request: Request,
    format: str = Query(default="json"),
    store: InMemoryRoomStore = Depends(_get_room_store),
    _: None = Depends(_require_host_token),
) -> Any:
    room = await store.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    session_store = _get_session_store(request)
    participants = await store.list_room_participants(room_id)

    reports = []
    for p in participants:
        session = await session_store.get_session(p.session_id)
        if session is None:
            continue

        flag_events = [
            FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
            for e in session.events
        ]
        duration_s = 0
        if session.end and session.start:
            duration_s = int((session.end - session.start).total_seconds())
        elif session.start:
            duration_s = int((datetime.now(timezone.utc) - session.start).total_seconds())

        score_result = compute_attention_score(flag_events, duration_s)

        if score_result.score > -0.5:
            verdict = Verdict.PASS
        elif score_result.score > -1.5:
            verdict = Verdict.FLAGGED
        elif score_result.score > -3.0:
            verdict = Verdict.REVIEW
        else:
            verdict = Verdict.INCONCLUSIVE

        focused_seconds = duration_s - sum(score_result.event_counts.values())
        pct_focused = (focused_seconds / duration_s * 100) if duration_s > 0 else 0.0

        session.final_score = score_result.score
        session.pct_focused = pct_focused
        session.verdict = verdict
        await session_store.update_session(session)

        signed_hash = sign_session(session)
        reports.append({
            "session_id": p.session_id,
            "display_name": p.display_name,
            "final_score": score_result.score,
            "pct_focused": pct_focused,
            "verdict": verdict.value,
            "signed_hash": signed_hash,
        })

    if format == "zip":
        return await _build_zip_response(reports, room, session_store)

    return {
        "room_id": room_id,
        "title": room.title,
        "status": room.status,
        "reports": reports,
    }


async def _build_zip_response(
    reports: list[dict[str, Any]],
    room: Any,
    session_store: Any,
) -> StreamingResponse:
    pdf_sessions = {}
    for r in reports:
        session = await session_store.get_session(r["session_id"])
        if session:
            pdf_sessions[r["session_id"]] = session

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        csv_rows = []
        for r in reports:
            csv_rows.append({
                "session_id": r["session_id"],
                "display_name": r["display_name"],
                "final_score": r["final_score"],
                "pct_focused": r["pct_focused"],
                "verdict": r["verdict"],
                "signed_hash": r["signed_hash"],
            })
            session = pdf_sessions.get(r["session_id"])
            if session:
                pdf_bytes = generate_session_pdf(session)
                zf.writestr(f"report_{r['session_id'][:8]}.pdf", pdf_bytes)

        csv_buf = io.StringIO()
        writer = csv.DictWriter(
            csv_buf,
            fieldnames=["session_id", "display_name", "final_score", "pct_focused", "verdict", "signed_hash"],
        )
        writer.writeheader()
        writer.writerows(csv_rows)
        zf.writestr("summary.csv", csv_buf.getvalue())

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="cohort-{room.room_id}-reports.zip"'
        },
    )
