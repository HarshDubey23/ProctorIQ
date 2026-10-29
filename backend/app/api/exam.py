"""Live exam flow: students start, autosave and submit; hosts watch, warn, end and grade.

Every student call carries X-Student-Token (issued at join), every host call the
room's X-Host-Token. Time limits are enforced here, never trusted from the browser.
"""

from __future__ import annotations

import hmac
import random
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from backend.app.ws.handler import send_to_session
from backend.app.ws.room_handler import broadcast_room_update
from backend.core.grading import grade
from backend.core.session_scoring import apply_server_integrity_score
from backend.models.paper import Paper, PublicPaper, to_public
from backend.models.room import Room, RoomMember
from backend.models.session import Session, StudentAnswer

router = APIRouter(prefix="/rooms", tags=["exam"])

# Network slack after the deadline before the server stops taking the browser's answers.
SUBMIT_GRACE = timedelta(seconds=30)
MAX_ANSWER_CHARS = 20_000


class StartRequest(BaseModel):
    session_id: str


class AnswersRequest(BaseModel):
    session_id: str
    answers: dict[str, str | None] = Field(default_factory=dict)


class GradeRequest(BaseModel):
    question_id: str
    marks: float


class WarnRequest(BaseModel):
    message: str = Field(min_length=1, max_length=300)


class TerminateRequest(BaseModel):
    reason: str = Field(default="Terminated by the exam host", max_length=300)


def _stores(request: Request) -> tuple[Any, Any, Any]:
    s = request.app.state
    return s.room_store, s.session_store, s.paper_store


async def _room_or_404(request: Request, room_id: str) -> Room:
    room = await request.app.state.room_store.get_room(room_id)
    if room is None:
        raise HTTPException(404, "Exam not found")
    return cast(Room, room)


def _member_for_student(room: Room, session_id: str, token: str | None) -> RoomMember:
    member = room.active_sessions.get(session_id)
    if member is None or not token or not hmac.compare_digest(member.student_token, token):
        raise HTTPException(403, "Not a participant of this exam")
    return member


def require_host(room: Room, token: str | None) -> None:
    if not token or not hmac.compare_digest(room.host_token, token):
        raise HTTPException(403, "Invalid host token")


def deadline_for(room: Room, session: Session) -> datetime | None:
    limits = []
    if room.duration_minutes:
        limits.append(session.start + timedelta(minutes=room.duration_minutes))
    if room.closed_at is not None:
        limits.append(room.closed_at)
    return min(limits) if limits else None


def _past_deadline(room: Room, session: Session) -> bool:
    dl = deadline_for(room, session)
    return dl is not None and datetime.now(UTC) > dl + SUBMIT_GRACE


def shuffled_public_paper(paper: Paper, seed: str) -> PublicPaper:
    """Same order for the same student on every reload, different between students."""
    public = to_public(paper)
    rng = random.Random(seed)
    if paper.shuffle_questions:
        rng.shuffle(public.questions)
    if paper.shuffle_options:
        for q in public.questions:
            if q.options and q.type in ("mcq-single", "mcq-multi"):
                rng.shuffle(q.options)
    return public


def _clean_answers(paper: Paper, answers: dict[str, str | None]) -> dict[str, str | None]:
    valid = {q.id for q in paper.questions}
    return {
        qid: (a[:MAX_ANSWER_CHARS] if isinstance(a, str) else None)
        for qid, a in answers.items()
        if qid in valid
    }


def _answer_map(session: Session) -> dict[str, str | None]:
    return {a.question_id: a.selected_answer for a in session.student_answers}


async def _paper_for(request: Request, room: Room) -> Paper:
    paper = await request.app.state.paper_store.get(room.paper_id)
    if paper is None:
        raise HTTPException(404, "Exam paper not found")
    return cast(Paper, paper)


async def _patch_member(
    request: Request, room_id: str, session_id: str, force: bool = True, **fields: Any
) -> None:
    store = request.app.state.room_store
    await store.patch_member(room_id, session_id, fields)
    await broadcast_room_update(room_id, store, force=force)


async def finalize(
    request: Request,
    room: Room,
    session: Session,
    answers: dict[str, str | None] | None,
    status: str = "submitted",
) -> Session:
    """Grade and close a session. Past the deadline only the server-saved draft counts."""
    paper = await _paper_for(request, room)
    if answers is None or _past_deadline(room, session):
        answers = _answer_map(session)
    answers = _clean_answers(paper, answers)
    result = grade(paper, answers, session.manual_marks)

    now = datetime.now(UTC)
    dl = deadline_for(room, session)
    session.student_answers = [StudentAnswer(question_id=k, selected_answer=v) for k, v in answers.items()]
    session.marks = result.marks
    session.max_marks = result.max_marks
    session.quiz_score = result.percent
    session.pending_manual = result.pending_manual
    session.status = status
    session.end = min(now, dl) if dl is not None and dl > session.start else now
    apply_server_integrity_score(session)
    await request.app.state.session_store.update_session(session)

    if session.id in room.active_sessions:
        answered = sum(1 for v in answers.values() if v and v.strip())
        await _patch_member(request, room.room_id, session.id, status=status, answered=answered)
    await send_to_session(session.id, {"type": "finalized", "status": status})
    return session


async def finalize_expired(request: Request, room: Room) -> None:
    """Students who closed the browser are graded from their last autosave."""
    store = request.app.state.session_store
    for sid in list(room.active_sessions):
        session = await store.get_session(sid)
        if session is not None and session.status == "in_progress" and _past_deadline(room, session):
            await finalize(request, room, session, None)


def _result_payload(session: Session) -> dict[str, Any]:
    return {
        "status": session.status,
        "marks": session.marks,
        "max_marks": session.max_marks,
        "percent": session.quiz_score,
        "pending_manual": session.pending_manual,
        "integrity_score": session.final_score,
        "pct_focused": session.pct_focused,
        "verdict": session.verdict.value if session.verdict else None,
    }


# ── Student ────────────────────────────────────────────────────────────────


@router.post("/{room_id}/start")
async def start_exam(
    room_id: str,
    body: StartRequest,
    request: Request,
    x_student_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Start (or resume after a reload) the student's attempt. Idempotent."""
    room = await _room_or_404(request, room_id)
    member = _member_for_student(room, body.session_id, x_student_token)
    _, session_store, _ = _stores(request)
    paper = await _paper_for(request, room)

    session = await session_store.get_session(body.session_id)
    if session is None:
        if room.status == "closed":
            raise HTTPException(410, "This exam has already ended")
        session = await session_store.create_session(
            Session(id=body.session_id, start=datetime.now(UTC), mode="exam")
        )
        await session_store.set_ws_token(session.id, secrets.token_urlsafe(24))
        await _patch_member(request, room_id, member.session_id,
                            status="in_progress", started_at=session.start)
    elif session.status == "in_progress" and _past_deadline(room, session):
        session = await finalize(request, room, session, None)

    dl = deadline_for(room, session)
    return {
        "session_id": session.id,
        "ws_token": await session_store.get_ws_token(session.id) or "",
        "status": session.status,
        "started_at": session.start.isoformat(),
        "deadline": dl.isoformat() if dl else None,
        "server_now": datetime.now(UTC).isoformat(),
        "answers": _answer_map(session),
        "paper": shuffled_public_paper(paper, session.id).model_dump(mode="json"),
        "result": _result_payload(session) if session.status != "in_progress" else None,
    }


@router.put("/{room_id}/answers")
async def save_answers(
    room_id: str,
    body: AnswersRequest,
    request: Request,
    x_student_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    member = _member_for_student(room, body.session_id, x_student_token)
    session_store = request.app.state.session_store
    session = await session_store.get_session(body.session_id)
    if session is None:
        raise HTTPException(404, "Exam not started")
    if session.status != "in_progress":
        raise HTTPException(409, "This attempt is already closed")
    if _past_deadline(room, session):
        raise HTTPException(409, "Time is up")

    paper = await _paper_for(request, room)
    merged = _answer_map(session) | _clean_answers(paper, body.answers)
    session.student_answers = [StudentAnswer(question_id=k, selected_answer=v) for k, v in merged.items()]
    await session_store.update_session(session)

    answered = sum(1 for v in merged.values() if v and v.strip())
    if answered != member.answered:
        await _patch_member(request, room_id, member.session_id, force=False, answered=answered)
    return {"saved": len(merged), "answered": answered}


@router.post("/{room_id}/submit")
async def submit_exam(
    room_id: str,
    body: AnswersRequest,
    request: Request,
    x_student_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    _member_for_student(room, body.session_id, x_student_token)
    session = await request.app.state.session_store.get_session(body.session_id)
    if session is None:
        raise HTTPException(404, "Exam not started")
    if session.status != "in_progress":
        raise HTTPException(409, "This attempt is already submitted")
    session = await finalize(request, room, session, body.answers)
    return _result_payload(session)


@router.get("/{room_id}/my-result")
async def my_result(
    room_id: str,
    session_id: str,
    request: Request,
    x_student_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    _member_for_student(room, session_id, x_student_token)
    session = await request.app.state.session_store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Exam not started")
    return _result_payload(session)


# ── Host ───────────────────────────────────────────────────────────────────


@router.get("/{room_id}/results")
async def room_results(
    room_id: str,
    request: Request,
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    require_host(room, x_host_token)
    await finalize_expired(request, room)
    room = await _room_or_404(request, room_id)
    paper = await _paper_for(request, room)
    session_store = request.app.state.session_store

    students = []
    for m in room.active_sessions.values():
        session = await session_store.get_session(m.session_id)
        answers = _answer_map(session) if session else {}
        graded = grade(paper, answers, session.manual_marks if session else {})
        students.append({
            "session_id": m.session_id,
            "display_name": m.display_name,
            "status": session.status if session else m.status,
            "flags": m.flags,
            "warnings": m.warnings,
            **(_result_payload(session) if session else {}),
            "answers": [
                {
                    "question_id": qr.question_id,
                    "answer": answers.get(qr.question_id),
                    "awarded": qr.awarded,
                    "max_marks": qr.max_marks,
                    "result": qr.status,
                }
                for qr in graded.questions
            ],
        })
    return {
        "room_id": room.room_id,
        "title": room.title,
        "status": room.status,
        "questions": [q.model_dump(mode="json") for q in paper.questions],
        "students": students,
    }


@router.post("/{room_id}/members/{session_id}/grade")
async def grade_answer(
    room_id: str,
    session_id: str,
    body: GradeRequest,
    request: Request,
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    require_host(room, x_host_token)
    paper = await _paper_for(request, room)
    question = next((q for q in paper.questions if q.id == body.question_id), None)
    if question is None:
        raise HTTPException(404, "Question not found")
    if not 0 <= body.marks <= question.marks:
        raise HTTPException(422, f"Marks must be between 0 and {question.marks}")
    session_store = request.app.state.session_store
    session = await session_store.get_session(session_id)
    if session is None or session_id not in room.active_sessions:
        raise HTTPException(404, "Student not found")
    if session.status == "in_progress":
        raise HTTPException(409, "Grade after the student submits")

    session.manual_marks[body.question_id] = body.marks
    result = grade(paper, _answer_map(session), session.manual_marks)
    session.marks, session.max_marks = result.marks, result.max_marks
    session.quiz_score, session.pending_manual = result.percent, result.pending_manual
    await session_store.update_session(session)
    return _result_payload(session)


@router.post("/{room_id}/members/{session_id}/warn")
async def warn_student(
    room_id: str,
    session_id: str,
    body: WarnRequest,
    request: Request,
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    require_host(room, x_host_token)
    member = room.active_sessions.get(session_id)
    if member is None:
        raise HTTPException(404, "Student not found")
    delivered = await send_to_session(session_id, {"type": "host_warning", "message": body.message})
    await _patch_member(request, room_id, session_id, warnings=member.warnings + 1)
    return {"delivered": delivered, "warnings": member.warnings + 1}


@router.post("/{room_id}/members/{session_id}/terminate")
async def terminate_student(
    room_id: str,
    session_id: str,
    body: TerminateRequest,
    request: Request,
    x_host_token: str | None = Header(default=None),
) -> dict[str, Any]:
    room = await _room_or_404(request, room_id)
    require_host(room, x_host_token)
    if session_id not in room.active_sessions:
        raise HTTPException(404, "Student not found")
    session = await request.app.state.session_store.get_session(session_id)
    if session is None:
        await _patch_member(request, room_id, session_id, status="terminated")
        return {"status": "terminated"}
    if session.status != "in_progress":
        raise HTTPException(409, "This attempt is already closed")
    await send_to_session(session_id, {"type": "terminated", "reason": body.reason})
    session = await finalize(request, room, session, None, status="terminated")
    return _result_payload(session)


async def end_room(app: Any, room_id: str) -> Room | None:
    """Close a room and tell every connected student to submit now."""
    store = app.state.room_store
    room = await store.close_room(room_id)
    if room is None:
        return None
    for sid, m in room.active_sessions.items():
        if m.status == "in_progress":
            await send_to_session(sid, {"type": "exam_ended"})
    await broadcast_room_update(room_id, store, force=True)
    return cast(Room, room)
