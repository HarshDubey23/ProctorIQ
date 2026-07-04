from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Any, cast

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"
RUNS_DIR = ML / "checkpoints" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ProctorIQ Training Studio (local only)")
_processes: dict[str, asyncio.subprocess.Process] = {}


class TrainRequest(BaseModel):
    mode: str
    new_batch: str | None = None
    epochs: int = 8
    lr: float = 1e-4
    freeze_early: bool = False


@app.get("/api/dataset/stats")
def dataset_stats() -> dict[str, Any]:
    manifest_path = ML / "data" / "manifest.json"
    if not manifest_path.exists():
        return {"total_clips": 0, "by_label": {}, "by_contributor": {}}
    manifest = json.loads(manifest_path.read_text())
    by_label: dict[str, int] = {}
    by_contributor: dict[str, int] = {}
    for entry in manifest.values():
        by_label[entry["label"]] = by_label.get(entry["label"], 0) + 1
        by_contributor[entry["contributor"]] = by_contributor.get(entry["contributor"], 0) + 1
    return {"total_clips": len(manifest), "by_label": by_label, "by_contributor": by_contributor}


@app.get("/api/runs")
def list_runs() -> list[dict[str, Any]]:
    registry_path = ML / "checkpoints" / "registry.json"
    if registry_path.exists():
        return cast("list[dict[str, Any]]", json.loads(registry_path.read_text()))
    return []


@app.post("/api/train/start")
async def start_training(body: TrainRequest) -> dict[str, Any]:
    run_id = uuid.uuid4().hex[:8]
    script = "train_incremental.py" if body.mode == "continue" else "train.py"
    cmd = [
        sys.executable,
        str(ML / script),
        "--epochs", str(body.epochs),
        "--lr", str(body.lr),
    ]
    if body.new_batch:
        cmd += ["--new-batch", body.new_batch]
    if body.freeze_early:
        cmd += ["--freeze-early"]

    log_path = RUNS_DIR / f"{run_id}.log"
    log_file = open(log_path, "wb")
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=ROOT, stdout=log_file, stderr=asyncio.subprocess.STDOUT,
    )
    _processes[run_id] = proc
    return {"run_id": run_id}


@app.get("/api/train/{run_id}/log")
def get_log(run_id: str) -> dict[str, Any]:
    log_path = RUNS_DIR / f"{run_id}.log"
    if not log_path.exists():
        raise HTTPException(404, "Unknown run")
    proc = _processes.get(run_id)
    return {
        "log": log_path.read_text(errors="replace"),
        "running": proc is not None and proc.returncode is None,
    }


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
