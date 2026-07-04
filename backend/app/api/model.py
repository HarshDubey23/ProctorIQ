from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/ml", tags=["ml"])

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "checkpoints" / "registry.json"
HISTORY_DIR = Path(__file__).resolve().parent.parent.parent.parent / "ml" / "checkpoints" / "runs"


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
