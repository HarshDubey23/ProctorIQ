from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, cast

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.core.training_queue import TrainingQueueState


router = APIRouter(prefix="/ml", tags=["ml"])

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "checkpoints" / "registry.json"
HISTORY_DIR = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "checkpoints" / "runs"
BENCHMARK_REPORT_PATH = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "checkpoints" / "benchmark_report.json"


def _load_registry() -> dict[str, Any]:
    registry: dict[str, Any] = {"runs": [], "latest": None}
    if REGISTRY_PATH.exists():
        try:
            registry = json.loads(REGISTRY_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            registry = {"runs": [], "latest": None}
    return registry


def _load_history(run_id: str) -> list[dict[str, Any]]:
    history_path = HISTORY_DIR / run_id / "history.json"
    if not history_path.exists():
        return []
    try:
        loaded = json.loads(history_path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return loaded if isinstance(loaded, list) else []


@router.get("/benchmark")
async def get_benchmark_report() -> dict[str, Any]:
    if not BENCHMARK_REPORT_PATH.exists():
        return {"available": False}
    try:
        data: dict[str, Any] = json.loads(BENCHMARK_REPORT_PATH.read_text())
        data["available"] = True
        return data
    except (json.JSONDecodeError, OSError):
        return {"available": False}


@router.get("/registry")
async def get_ml_registry() -> dict[str, Any]:
    registry = _load_registry()
    runs_with_history: list[dict[str, Any]] = []
    for run in registry.get("runs", []):
        if not isinstance(run, dict):
            continue
        run_id = run.get("run_id", "")
        history = _load_history(run_id) if isinstance(run_id, str) else []
        runs_with_history.append({**run, "history": history})

    latest = registry.get("latest")
    return {
        "runs": runs_with_history,
        "latest_run_id": latest,
        "latest_history": _load_history(latest) if isinstance(latest, str) else [],
        "available": len(runs_with_history) > 0,
    }


@router.get("/runs/{run_id}/history")
async def get_ml_run_history(run_id: str) -> list[dict[str, Any]]:
    registry = _load_registry()
    known_run_ids = {
        run.get("run_id")
        for run in registry.get("runs", [])
        if isinstance(run, dict)
    }
    if run_id not in known_run_ids:
        raise HTTPException(404, "Training run not found")
    return _load_history(run_id)


@router.get("/training-status")
async def get_training_status() -> dict[str, Any]:
    return await get_ml_registry()


@router.get("/training-queue-status")
async def get_training_queue_status(request: Request) -> dict[str, Any]:
    queue = cast(TrainingQueueState, getattr(request.app.state, "training_queue", None))
    if queue is None:
        return {"status": "idle", "unconsumed_clips": 0, "current_run_id": None, "retrain_batch_size": 5}
    return await queue.get_status()


@router.get("/training-events")
async def training_events_sse(request: Request) -> StreamingResponse:
    queue = cast(TrainingQueueState, getattr(request.app.state, "training_queue", None))
    if queue is None:
        return StreamingResponse(iter(["event: error\ndata: training queue not available\n\n"]), media_type="text/event-stream")

    sub = queue.subscribe()

    async def event_stream() -> AsyncIterator[str]:
        try:
            while True:
                event = await asyncio.wait_for(sub.get(), timeout=30)
                yield f"data: {event.model_dump_json()}\n\n"
        except asyncio.TimeoutError:
            yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            queue.unsubscribe(sub)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
