from __future__ import annotations

import secrets
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.accommodation_store import InMemoryAccommodationStore
from backend.models.accommodation import AccommodationProfile, AccommodationProfileCreate

router = APIRouter(prefix="/accommodations", tags=["accommodations"])


def _get_store(request: Request) -> InMemoryAccommodationStore:
    if not hasattr(request.app.state, "accommodation_store"):
        raise HTTPException(503, "Accommodation store not available")
    return cast(InMemoryAccommodationStore, request.app.state.accommodation_store)


@router.get("")
async def list_accommodations(
    store: InMemoryAccommodationStore = Depends(_get_store),
) -> list[AccommodationProfile]:
    return await store.list()


@router.post("", status_code=201)
async def create_accommodation(
    body: AccommodationProfileCreate,
    store: InMemoryAccommodationStore = Depends(_get_store),
) -> AccommodationProfile:
    if not body.student_name.strip():
        raise HTTPException(400, "Student name is required")
    profile = AccommodationProfile(
        id=f"acc_{secrets.token_hex(8)}",
        student_name=body.student_name.strip(),
        extended_time_minutes=body.extended_time_minutes,
        relaxed_proctoring=body.relaxed_proctoring,
        notes=body.notes.strip(),
    )
    return await store.create(profile)


@router.delete("/{profile_id}", status_code=204)
async def delete_accommodation(
    profile_id: str,
    store: InMemoryAccommodationStore = Depends(_get_store),
) -> None:
    deleted = await store.delete(profile_id)
    if not deleted:
        raise HTTPException(404, "Accommodation profile not found")
