from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum

PENALTIES: dict[str, float] = {
    "distracted": -1.0,
    "absent": -2.0,
    "drowsy": -1.0,
    "multi_face": -3.0,
    "multi": -3.0,  # the browser model's label for more than one face
    "fullscreen_exit": -2.0,
    "copy_paste": -1.0,
    "devtools": -2.0,
    # "multiple_connections" is shown to the host but not scored: a dropped
    # Wi-Fi reconnect looks the same as a second tab.
    "tab_switch": -2.0,
    # Window blur is slightly less severe than a full tab switch —
    # it may be triggered by alt-tab to another window while the
    # exam tab remains visible, which is less conclusive of intent
    # to look up answers than a tab switch.
    "window_blur": -1.0,
}

LOW_THRESHOLD: float = -0.5
MEDIUM_THRESHOLD: float = -1.5


class ConcernLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


@dataclass(frozen=True)
class FlagEvent:
    event_type: str
    timestamp_s: float


@dataclass(frozen=True)
class AttentionScore:
    score: float
    concern: ConcernLevel
    duration_s: float
    total_penalty: float
    event_counts: dict[str, int]
    distracted_seconds: int


def compute_attention_score(
    events: Sequence[FlagEvent],
    duration_s: float,
) -> AttentionScore:
    if duration_s <= 0.0:
        return AttentionScore(
            score=0.0,
            concern=ConcernLevel.LOW,
            duration_s=0.0,
            total_penalty=0.0,
            event_counts={},
            distracted_seconds=0,
        )
    num_buckets = max(1, math.ceil(duration_s))
    bucket_penalties: list[float] = [0.0] * num_buckets
    event_counts: dict[str, int] = {}
    for event in events:
        if event.timestamp_s < 0.0 or event.timestamp_s >= duration_s:
            continue
        penalty = PENALTIES.get(event.event_type, 0.0)
        if penalty == 0.0:
            continue
        bucket_idx = min(
            int(event.timestamp_s),
            num_buckets - 1,
        )
        bucket_penalties[bucket_idx] += penalty
        event_counts[event.event_type] = event_counts.get(event.event_type, 0) + 1
    total_penalty = sum(bucket_penalties)
    distracted_seconds = sum(1 for penalty in bucket_penalties if penalty != 0.0)
    score = total_penalty / float(num_buckets)
    if score > LOW_THRESHOLD:
        concern = ConcernLevel.LOW
    elif score > MEDIUM_THRESHOLD:
        concern = ConcernLevel.MEDIUM
    else:
        concern = ConcernLevel.HIGH
    return AttentionScore(
        score=score,
        concern=concern,
        duration_s=duration_s,
        total_penalty=total_penalty,
        event_counts=event_counts,
        distracted_seconds=distracted_seconds,
    )
