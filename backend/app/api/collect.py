from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.collect_store import CollectStore, _get_collect_store
from backend.core.github_commit import (
    CollectionUnavailableError,
    commit_json_file,
    get_collect_github_token,
)
from backend.models.collect import ClipAccepted, ClipSubmission

router = APIRouter(prefix="/collect", tags=["collect"])

VALID_LABELS = {"focused", "distracted", "absent", "drowsy"}
MAX_CONTRIBUTORS = 30
CLIPS_PER_CONTRIBUTOR = 8
MAX_CLIP_SECONDS = 20.0
MAX_LANDMARK_BYTES = 200_000


@router.post("/clip", status_code=201, response_model=ClipAccepted)
async def submit_clip(
    body: ClipSubmission,
    request: Request,
    store: CollectStore = Depends(_get_collect_store),
) -> ClipAccepted:
    if not get_collect_github_token():
        raise HTTPException(503, "Data collection is temporarily unavailable")

    if body.label not in VALID_LABELS:
        raise HTTPException(400, f"Unknown label '{body.label}'")
    if body.duration_s > MAX_CLIP_SECONDS:
        raise HTTPException(413, "Clip too long")

    raw = json.dumps(body.landmarks).encode()
    if len(raw) > MAX_LANDMARK_BYTES:
        raise HTTPException(413, "Clip payload too large")

    already_known = await store.knows_contributor(body.contributor_id)
    if not already_known and await store.contributor_count() >= MAX_CONTRIBUTORS:
        raise HTTPException(423, "Collection is full — thanks for your interest!")
    if await store.clip_count_for(body.contributor_id) >= CLIPS_PER_CONTRIBUTOR:
        raise HTTPException(409, "You've already completed all tasks. Thank you!")

    clip_hash = hashlib.sha256(raw).hexdigest()
    if await store.has_hash(clip_hash):
        raise HTTPException(409, "Duplicate clip")

    path = (
        f"ml/data/raw/{body.contributor_id}_{date.today().isoformat()}"
        f"/{body.label}/{clip_hash}.json"
    )
    payload = {
        "task_id": body.task_id,
        "label": body.label,
        "contributor_id": body.contributor_id,
        "duration_s": body.duration_s,
        "landmarks": body.landmarks,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await commit_json_file(path, payload, message=f"collect: {body.label}/{clip_hash[:8]}")
    except CollectionUnavailableError as exc:
        raise HTTPException(503, "Data collection is temporarily unavailable") from exc
    await store.record_accepted(body.contributor_id, clip_hash)

    if hasattr(request.app.state, "training_queue"):
        await request.app.state.training_queue.on_clip_accepted()

    return ClipAccepted(
        clip_hash=clip_hash,
        contributor_clip_count=await store.clip_count_for(body.contributor_id),
        contributors_total=await store.contributor_count(),
        collection_full=await store.contributor_count() >= MAX_CONTRIBUTORS,
    )


@router.get("/status")
async def collection_status(
    store: CollectStore = Depends(_get_collect_store),
) -> dict[str, Any]:
    total = await store.contributor_count()
    return {
        "contributors": total,
        "max_contributors": MAX_CONTRIBUTORS,
        "full": total >= MAX_CONTRIBUTORS,
    }
