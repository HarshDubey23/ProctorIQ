from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.paper_store import InMemoryPaperStore
from backend.core.room_store import InMemoryRoomStore
from backend.core.session_store import InMemorySessionStore, SessionStore
from backend.core.session_scoring import apply_server_integrity_score
from backend.models.session import Session, SessionCreate, SessionUpdate, SessionSummary
from backend.report.pdf import generate_session_pdf

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_store(request: Request) -> SessionStore:
    return cast(SessionStore, request.app.state.session_store)


def _get_room_store(request: Request) -> InMemoryRoomStore:
    return cast(InMemoryRoomStore, request.app.state.room_store)


def _get_paper_store(request: Request) -> InMemoryPaperStore:
    return cast(InMemoryPaperStore, request.app.state.paper_store)


class AnswerSubmission(BaseModel):
    question_id: str
    selected_answer: str | None


class SubmitAnswersRequest(BaseModel):
    answers: list[AnswerSubmission]


@router.get("")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    store: InMemorySessionStore = Depends(_get_store),
) -> list[SessionSummary]:
    return await store.list_sessions(limit=limit, offset=offset)


@router.post("", status_code=201)
async def create_session(
    body: SessionCreate,
    store: InMemorySessionStore = Depends(_get_store),
) -> dict[str, Any]:
    session_id = body.id if body.id else uuid4().hex
    start = body.start if body.start is not None else datetime.now(timezone.utc)
    existing = await store.get_session(session_id)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Session already exists")
    session = Session(
        id=session_id,
        start=start,
        end=body.end,
        mode=body.mode,
        benchmark=body.benchmark,
    )
    created = await store.create_session(session)
    ws_token = secrets.token_urlsafe(24)
    await store.set_ws_token(session_id, ws_token)
    payload = created.model_dump(mode="json")
    payload["ws_token"] = ws_token
    return payload


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


@router.post("/{session_id}/submit", status_code=200)
async def submit_answers(
    session_id: str,
    body: SubmitAnswersRequest,
    store: InMemorySessionStore = Depends(_get_store),
    room_store: InMemoryRoomStore = Depends(_get_room_store),
    paper_store: InMemoryPaperStore = Depends(_get_paper_store),
) -> dict[str, float]:
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    room = await room_store.get_room_for_session(session_id)
    if room is None or not room.paper_id:
        raise HTTPException(400, "No paper associated with this session")

    paper = await paper_store.get(room.paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found")

    correct = {q.id: q.correct_answer for q in paper.questions}
    correct_count = sum(
        1 for a in body.answers
        if a.selected_answer is not None and correct.get(a.question_id) == a.selected_answer
    )
    total = len(paper.questions)
    quiz_score = round((correct_count / total * 100), 2) if total > 0 else 0.0

    session.quiz_score = quiz_score
    session.end = datetime.now(timezone.utc)
    apply_server_integrity_score(session)
    await store.update_session(session)

    return {"score": quiz_score, "correct": correct_count, "total": total}


@router.get("/{session_id}/report")
async def get_session_report(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> StreamingResponse:
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Always compute integrity fields server-side from the authoritative event log.
    apply_server_integrity_score(session)

    # Persist the computed scores back to the store so GET /api/sessions/{id}
    # and the session list reflect the same values as the downloaded report.
    await store.update_session(session)

    recent = await store.list_sessions(limit=5)
    pdf_bytes = generate_session_pdf(session, recent_sessions=recent)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="proctoriq-{session_id[:8]}.pdf"'
        },
    )
