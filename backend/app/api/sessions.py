from __future__ import annotations

from datetime import datetime, timezone
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from backend.core.session_store import InMemorySessionStore, SessionStore
from backend.cv.scoring import FlagEvent, compute_attention_score
from backend.models.session import Session, SessionUpdate, SessionSummary, Verdict
from backend.report.pdf import generate_session_pdf

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_store(request: Request) -> SessionStore:
    return cast(SessionStore, request.app.state.session_store)


@router.get("")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    store: InMemorySessionStore = Depends(_get_store),
) -> list[SessionSummary]:
    return await store.list_sessions(limit=limit, offset=offset)


@router.post("", status_code=201)
async def create_session(
    body: Session,
    store: InMemorySessionStore = Depends(_get_store),
) -> Session:
    if not body.id:
        body.id = uuid4().hex
    if body.start is None:
        body.start = datetime.now(timezone.utc)
    existing = await store.get_session(body.id)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Session already exists")
    return await store.create_session(body)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> Session:
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    body: SessionUpdate,
    store: InMemorySessionStore = Depends(_get_store),
) -> Session:
    existing = await store.get_session(session_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Session not found")
    merged = existing.model_copy(deep=True)
    if body.end is not None:
        merged.end = body.end
    if body.mode is not None:
        merged.mode = body.mode
    return await store.update_session(merged)


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> None:
    existing = await store.get_session(session_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Session not found")
    blank = Session(
        id=session_id,
        start=existing.start,
        end=datetime.now(timezone.utc),
        mode=existing.mode,
    )
    await store.update_session(blank)


@router.get("/{session_id}/report")
async def get_session_report(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> StreamingResponse:
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Always compute integrity fields server-side from the authoritative event log.
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

    recent = await store.list_sessions(limit=5)
    pdf_bytes = generate_session_pdf(session, recent_sessions=recent)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="proctoriq-{session_id[:8]}.pdf"'
        },
    )
