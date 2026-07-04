from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.host_store import InMemoryHostStore
from backend.models.host import HostAccount

router = APIRouter(prefix="/hosts", tags=["hosts"])


def _get_store(request: Request) -> InMemoryHostStore:
    if not hasattr(request.app.state, "host_store"):
        raise HTTPException(503, "Host store not available")
    return cast(InMemoryHostStore, request.app.state.host_store)


@router.post("", status_code=201)
async def create_host(
    store: InMemoryHostStore = Depends(_get_store),
) -> dict[str, str]:
    host = HostAccount(
        host_id=f"h_{secrets.token_hex(8)}",
        host_token=secrets.token_urlsafe(32),
        created_at=datetime.now(timezone.utc),
    )
    created = await store.create(host)
    return {"host_id": created.host_id, "host_token": created.host_token}
