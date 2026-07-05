from __future__ import annotations

import secrets
import time
from datetime import date
from typing import Any, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel

from backend.core.host_store import InMemoryHostStore
from backend.core.paper_store import InMemoryPaperStore
from backend.core.hf_client import (
    HFGenerationError,
    HFNotConfiguredError,
    generate_questions,
    generate_questions_chat,
)
from backend.models.paper import (
    Paper,
    PaperGenerationChatRequest,
    PaperGenerationChatResponse,
    PaperGenerationRequest,
    PaperGenerationResponse,
    PaperReviewResponse,
    PaperSection,
    PublicPaper,
    Question,
    QuestionType,
    ReviewQuestion,
    to_public,
)
from backend.models.session import StudentAnswer

router = APIRouter(prefix="/papers", tags=["papers"])
_generate_rate_limits: dict[str, list[float]] = {}


def _get_paper_store(request: Request) -> InMemoryPaperStore:
    if not hasattr(request.app.state, "paper_store"):
        raise HTTPException(503, "Paper store not available")
    return cast(InMemoryPaperStore, request.app.state.paper_store)


def _get_host_store(request: Request) -> InMemoryHostStore:
    return cast(InMemoryHostStore, request.app.state.host_store)


class CreatePaperQuestion(BaseModel):
    id: str
    type: QuestionType
    title: str
    body: str
    marks: float = 1.0
    negative_marks: float = 0.0
    topic: str = "General"
    difficulty: str = "medium"
    options: list[str] | None = None
    correct_answer: str | None = None


class CreatePaperSection(BaseModel):
    id: str
    title: str
    question_ids: list[str]


class CreatePaperRequest(BaseModel):
    title: str
    subject: str = ""
    instructions: str = ""
    duration_minutes: int = 60
    shuffle_questions: bool = False
    shuffle_options: bool = False
    questions: list[CreatePaperQuestion]
    sections: list[CreatePaperSection] = []


def _check_generate_rate_limit(request: Request, max_per_hour: int = 10) -> None:
    from slowapi.util import get_remote_address

    key = get_remote_address(request)
    now = time.time()
    _generate_rate_limits.setdefault(key, [])
    _generate_rate_limits[key] = [t for t in _generate_rate_limits[key] if now - t < 3600]
    if len(_generate_rate_limits[key]) >= max_per_hour:
        raise HTTPException(429, "AI generation rate limit reached - try again later")
    _generate_rate_limits[key].append(now)


@router.post("/generate", response_model=PaperGenerationResponse)
async def generate_paper_draft(
    body: PaperGenerationRequest,
    request: Request,
) -> PaperGenerationResponse:
    _check_generate_rate_limit(request)
    try:
        questions, model_used = await generate_questions(body)
    except HFNotConfiguredError as exc:
        raise HTTPException(
            503,
            "AI paper generation isn't configured on this server (missing HF_API_TOKEN)",
        ) from exc
    except HFGenerationError as exc:
        raise HTTPException(502, f"AI generation failed: {exc}") from exc
    return PaperGenerationResponse(
        questions=questions,
        requested=body.question_count,
        generated=len(questions),
        model_used=model_used,
    )


@router.post("/generate/chat", response_model=PaperGenerationChatResponse)
async def generate_paper_chat(
    body: PaperGenerationChatRequest,
    request: Request,
) -> PaperGenerationChatResponse:
    # Count each chat turn, not each completed paper, because every turn calls
    # the hosted model and can incur provider cost.
    _check_generate_rate_limit(request)
    try:
        return await generate_questions_chat(body)
    except HFNotConfiguredError as exc:
        raise HTTPException(
            503,
            "AI paper generation isn't configured on this server (missing HF_API_TOKEN)",
        ) from exc
    except HFGenerationError as exc:
        raise HTTPException(502, f"AI generation failed: {exc}") from exc


@router.post("", status_code=201)
async def create_paper(
    body: CreatePaperRequest,
    x_host_token: str | None = Header(default=None),
    store: InMemoryPaperStore = Depends(_get_paper_store),
    host_store: InMemoryHostStore = Depends(_get_host_store),
) -> Paper:
    paper_id = f"p_{date.today().isoformat()}_{secrets.token_hex(4)}"
    host_token = secrets.token_urlsafe(32)
    host_id = ""
    if x_host_token:
        host = await host_store.get_by_token(x_host_token)
        if host is None:
            raise HTTPException(403, "Invalid host token")
        host_id = host.host_id
    paper = Paper(
        id=paper_id,
        host_token=host_token,
        host_id=host_id,
        title=body.title,
        subject=body.subject,
        instructions=body.instructions,
        duration_minutes=body.duration_minutes,
        shuffle_questions=body.shuffle_questions,
        shuffle_options=body.shuffle_options,
        questions=[Question(**q.model_dump()) for q in body.questions],
        sections=[PaperSection(**s.model_dump()) for s in body.sections],
    )
    return await store.create(paper)


@router.get("/{paper_id}")
async def get_paper(
    paper_id: str,
    x_host_token: str = Header(...),
    store: InMemoryPaperStore = Depends(_get_paper_store),
    host_store: InMemoryHostStore = Depends(_get_host_store),
) -> Paper:
    paper = await store.get(paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found")
    import hmac
    host = await host_store.get_by_token(x_host_token)
    host_token_matches = hmac.compare_digest(paper.host_token, x_host_token)
    host_account_matches = host is not None and paper.host_id and host.host_id == paper.host_id
    if not host_token_matches and not host_account_matches:
        raise HTTPException(403, "Invalid host token")
    return paper


@router.get("/{paper_id}/public")
async def get_public_paper(
    paper_id: str,
    store: InMemoryPaperStore = Depends(_get_paper_store),
) -> PublicPaper:
    paper = await store.get(paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found")
    return to_public(paper)


def _get_session_store(request: Request) -> Any:
    from backend.core.session_store import InMemorySessionStore
    return cast(InMemorySessionStore, request.app.state.session_store)


def _get_room_store(request: Request) -> Any:
    from backend.core.room_store import InMemoryRoomStore
    return cast(InMemoryRoomStore, request.app.state.room_store)


def _answers_map(
    answers: list[StudentAnswer],
) -> dict[str, str | None]:
    return {a.question_id: a.selected_answer for a in answers}


@router.get("/{paper_id}/review")
async def get_paper_review(
    paper_id: str,
    student_token: str = Query(...),
    store: InMemoryPaperStore = Depends(_get_paper_store),
    session_store: Any = Depends(_get_session_store),
    room_store: Any = Depends(_get_room_store),
) -> PaperReviewResponse:
    paper = await store.get(paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found")

    room = await room_store.get_room_for_session(student_token)
    if room is None or room.paper_id != paper_id:
        raise HTTPException(403, "Session not associated with this paper")

    session = await session_store.get_session(student_token)
    if session is None:
        raise HTTPException(404, "Session not found")

    if session.end is None:
        raise HTTPException(403, "Review available after the exam ends")

    answers = _answers_map(session.student_answers)
    return PaperReviewResponse(
        questions=[
            ReviewQuestion(
                id=q.id,
                body=q.body,
                correct_answer=q.correct_answer,
                student_answer=answers.get(q.id),
            )
            for q in paper.questions
        ]
    )


@router.get("")
async def list_host_papers(
    x_host_token: str = Header(...),
    store: InMemoryPaperStore = Depends(_get_paper_store),
    host_store: InMemoryHostStore = Depends(_get_host_store),
) -> list[Paper]:
    host = await host_store.get_by_token(x_host_token)
    if host is not None:
        return await store.list_by_host_id(host.host_id)
    return await store.list_by_host(x_host_token)
