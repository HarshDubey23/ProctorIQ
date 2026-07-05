from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request

from backend.core.github_commit import get_collect_github_token

router = APIRouter(tags=["health"])

FRONTEND_MODELS = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "public" / "models"
REQUIRED_MODEL_FILES = [
    "attention_model.onnx",
    "pca_components.bin",
    "face_landmarker.task",
    "labels.json",
    "pca_meta.json",
]


@router.get("/health")
async def health(request: Request) -> dict[str, object]:
    gh_token_configured = bool(get_collect_github_token())

    db_reachable = False
    try:
        store = getattr(request.app.state, "session_store", None)
        db_reachable = store is not None
    except Exception:
        db_reachable = False

    model_files_present: dict[str, bool] = {}
    for fname in REQUIRED_MODEL_FILES:
        model_files_present[fname] = (FRONTEND_MODELS / fname).exists()
    all_models_ok = all(model_files_present.values())

    return {
        "status": "ok",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "github_token_configured": gh_token_configured,
        "database_connected": db_reachable,
        "model_artifacts": {
            "all_present": all_models_ok,
            "files": model_files_present,
        },
    }
