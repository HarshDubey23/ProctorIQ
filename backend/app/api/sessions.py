from __future__ import annotations

from datetime import datetime, timezone
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from backend.core.session_store import InMemorySessionStore, SessionStore
from backend.models.session import Session, SessionSummary
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
    body: Session,
    store: InMemorySessionStore = Depends(_get_store),
) -> Session:
    existing = await store.get_session(session_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Session not found")
    body.id = session_id
    return await store.update_session(body)


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> None:
    # InMemorySessionStore does not support delete; blank the session.
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
    recent = await store.list_sessions(limit=5)
    pdf_bytes = generate_session_pdf(session, recent_sessions=recent)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="proctoriq-{session_id[:8]}.pdf"'
        },
    )

