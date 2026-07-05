from __future__ import annotations

import asyncio
import json
import sys
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel


RETRAIN_BATCH_SIZE = 5

ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = ROOT / "ml"
REGISTRY_PATH = ML_DIR / "checkpoints" / "registry.json"
RUNS_DIR = ML_DIR / "checkpoints" / "runs"


class TrainingEvent(BaseModel):
    run_id: str
    epoch: int
    loss: float | None = None
    f1: float | None = None
    status: Literal["running", "accepted", "rejected", "failed"]


async def _async_empty() -> AsyncIterator[bytes]:
    return
    yield b""


class TrainingQueueState:
    def __init__(self) -> None:
        self.status: Literal["idle", "running"] = "idle"
        self.unconsumed_clips: int = 0
        self.current_run_id: str | None = None
        self._lock = asyncio.Lock()
        self._listeners: list[asyncio.Queue[TrainingEvent]] = []

    def subscribe(self) -> asyncio.Queue[TrainingEvent]:
        q: asyncio.Queue[TrainingEvent] = asyncio.Queue()
        self._listeners.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[TrainingEvent]) -> None:
        self._listeners.remove(q)

    async def _broadcast(self, event: TrainingEvent) -> None:
        for q in self._listeners:
            await q.put(event)

    async def on_clip_accepted(self) -> None:
        async with self._lock:
            self.unconsumed_clips += 1
            if self.status == "idle" and self.unconsumed_clips >= RETRAIN_BATCH_SIZE:
                self.status = "running"
                self.current_run_id = uuid.uuid4().hex[:8]
                self.unconsumed_clips -= RETRAIN_BATCH_SIZE
                asyncio.create_task(self._run_training(self.current_run_id))

    async def _run_training(self, run_id: str) -> None:
        runs_dir = RUNS_DIR
        runs_dir.mkdir(parents=True, exist_ok=True)
        log_path = runs_dir / f"{run_id}.log"

        cmd = [
            sys.executable,
            str(ML_DIR / "train_incremental.py"),
            "--epochs", "8",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(ROOT),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async for line in proc.stdout if proc.stdout else _async_empty():
            text = line.decode(errors="replace").rstrip()
            with open(log_path, "a") as f:
                f.write(text + "\n")

            epoch = _parse_epoch(text)
            loss = _parse_loss(text)
            f1 = _parse_f1(text)
            if epoch is not None:
                await self._broadcast(
                    TrainingEvent(
                        run_id=run_id,
                        epoch=epoch,
                        loss=loss,
                        f1=f1,
                        status="running",
                    )
                )

        returncode = await proc.wait()

        if returncode != 0:
            await self._broadcast(
                TrainingEvent(run_id=run_id, epoch=0, status="failed")
            )
        else:
            accepted = await _validate_and_swap(run_id)
            await self._broadcast(
                TrainingEvent(
                    run_id=run_id,
                    epoch=0,
                    status="accepted" if accepted else "rejected",
                )
            )

        async with self._lock:
            self.status = "idle"
            self.current_run_id = None
            if self.unconsumed_clips >= RETRAIN_BATCH_SIZE:
                self.status = "running"
                self.current_run_id = uuid.uuid4().hex[:8]
                self.unconsumed_clips -= RETRAIN_BATCH_SIZE
                asyncio.create_task(self._run_training(self.current_run_id))

    async def get_status(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "status": self.status,
                "unconsumed_clips": self.unconsumed_clips,
                "current_run_id": self.current_run_id,
                "retrain_batch_size": RETRAIN_BATCH_SIZE,
            }


def _parse_epoch(line: str) -> int | None:
    import re
    m = re.search(r"Epoch\s+(\d+)/", line)
    return int(m.group(1)) if m else None


def _parse_loss(line: str) -> float | None:
    import re
    m = re.search(r"Val loss: ([\d.]+)", line)
    return float(m.group(1)) if m else None


def _parse_f1(line: str) -> float | None:
    import re
    m = re.search(r"Val macro-F1: ([\d.]+)", line)
    return float(m.group(1)) if m else None


def _load_registry() -> list[dict[str, Any]]:
    if REGISTRY_PATH.exists():
        try:
            loaded: list[dict[str, Any]] | Any = json.loads(REGISTRY_PATH.read_text())
            if isinstance(loaded, list):
                return loaded
        except (json.JSONDecodeError, OSError):
            pass
    return []


async def _validate_and_swap(run_id: str) -> bool:
    updated_registry = _load_registry()
    latest_entry = updated_registry[-1] if updated_registry else None
    if latest_entry is None:
        return False
    new_f1 = latest_entry.get("cv_f1")
    if new_f1 is None:
        return False
    old_f1 = None
    for entry in updated_registry[:-1]:
        cv = entry.get("cv_f1")
        if cv is not None:
            old_f1 = float(cv)
    if old_f1 is not None and new_f1 < old_f1:
        updated_registry[-1]["rejected"] = True
        REGISTRY_PATH.write_text(json.dumps(updated_registry, indent=2))
        return False
    return True
