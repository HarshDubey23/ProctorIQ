from __future__ import annotations

from typing import cast

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.session_store import InMemorySessionStore, SessionStore
from backend.report.signing import verify_signature

router = APIRouter(prefix="/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    session_id: str
    signature: str


class VerifyResponse(BaseModel):
    valid: bool


def _get_store(request: Request) -> SessionStore:
    return cast(SessionStore, request.app.state.session_store)


@router.post("")
async def verify_report(
    body: VerifyRequest,
    store: InMemorySessionStore = Depends(_get_store),
) -> VerifyResponse:
    session = await store.get_session(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    valid = verify_signature(session, body.signature)
    return VerifyResponse(valid=valid)


@router.get("/{session_id}")
async def get_session_hash(
    session_id: str,
    store: InMemorySessionStore = Depends(_get_store),
) -> dict[str, str]:
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    from backend.report.signing import sign_session
    return {"hash": sign_session(session)}

