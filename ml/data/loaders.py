"""Unified raw-clip loader: reads both the legacy flat .npy format
and the contributor-submitted nested JSON format from /collect."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import numpy as np

MIN_FRAMES = 15
EXPECTED_WIDTH = 936


def iter_raw_clips(raw_dir: Path) -> Iterator[tuple[np.ndarray, str, str]]:
    """Yields (landmarks_array, label, source_id) for every usable clip under raw_dir."""
    # legacy flat .npy files: {label}_{n}.npy
    for npy_path in sorted(raw_dir.glob("*.npy")):
        label = npy_path.stem.rsplit("_", 1)[0]
        arr = np.load(npy_path)
        if arr.shape[0] < MIN_FRAMES or arr.shape[1] != EXPECTED_WIDTH:
            print(f"Skipping {npy_path.name}: bad shape {arr.shape}")
            continue
        yield arr.astype(np.float32), label, npy_path.stem

    # contributor JSON: <contributor>_<date>/<label>/<hash>.json
    for contributor_dir in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        for label_dir in sorted(p for p in contributor_dir.iterdir() if p.is_dir()):
            label = label_dir.name
            for clip_path in sorted(label_dir.glob("*.json")):
                data = json.loads(clip_path.read_text())
                landmarks = data.get("landmarks", [])
                if len(landmarks) < MIN_FRAMES:
                    print(f"Skipping {clip_path}: only {len(landmarks)} frames")
                    continue
                if any(len(frame) != EXPECTED_WIDTH for frame in landmarks):
                    print(f"Skipping {clip_path}: bad frame width")
                    continue
                arr = np.array(landmarks, dtype=np.float32)
                source_id = f"{contributor_dir.name}/{clip_path.stem}"
                yield arr, data.get("label", label), source_id
