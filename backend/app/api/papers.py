from __future__ import annotations

import secrets
from datetime import date
from typing import cast

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from backend.core.paper_store import InMemoryPaperStore
from backend.models.paper import Paper, PaperSection, PublicPaper, Question, QuestionType, to_public

router = APIRouter(prefix="/papers", tags=["papers"])


def _get_paper_store(request: Request) -> InMemoryPaperStore:
    if not hasattr(request.app.state, "paper_store"):
        raise HTTPException(503, "Paper store not available")
    return cast(InMemoryPaperStore, request.app.state.paper_store)


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


@router.post("", status_code=201)
async def create_paper(
    body: CreatePaperRequest,
    store: InMemoryPaperStore = Depends(_get_paper_store),
) -> Paper:
    paper_id = f"p_{date.today().isoformat()}_{secrets.token_hex(4)}"
    host_token = secrets.token_urlsafe(32)
    paper = Paper(
        id=paper_id,
        host_token=host_token,
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
) -> Paper:
    paper = await store.get(paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found")
    import hmac
    if not hmac.compare_digest(paper.host_token, x_host_token):
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


@router.get("")
async def list_host_papers(
    x_host_token: str = Header(...),
    store: InMemoryPaperStore = Depends(_get_paper_store),
) -> list[Paper]:
    return await store.list_by_host(x_host_token)
