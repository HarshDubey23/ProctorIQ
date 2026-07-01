# Attention Score Formula

## Core Formula

Attention score is a **time-weighted mean penalty** per second:

```
Let D = session duration in seconds
Let B = array of buckets, one per second: B[0..D-1], initialized to 0

For each event e:
    If e.timestamp_s is in [0, D):
        bucket_idx = floor(e.timestamp_s)
        B[bucket_idx] += penalty(e.event_type)

total_penalty = sum(B)
score = total_penalty / D
```

## Penalty Values

| Event Type    | Penalty | Rationale |
|---------------|---------|-----------|
| distracted    | -1      | Minor distraction, likely recoverable |
| gaze_away     | -1      | Same as distracted (mapped to distracted in UI) |
| drowsy        | -1      | Physiological, not necessarily intentional |
| absent        | -2      | No face in frame — significant monitoring gap |
| tab_switch    | -2      | Leaving the exam tab indicates intent to cheat |
| multi_face    | -3      | Another person in frame — potential fraud |

### Why -3 for multi-face and not -2?

Multi-face is the only event that signals a **different person**, not inattention. -3 penalizes potential exam fraud — more deterministic than absent/tab_switch at -2.

### Why time-weighted mean and not cumulative sum?

Cumulative sum penalizes short sessions more. A 60s session with 2 distracted events scores -2; a 600s session with 10 distracted events scores -10 — though the latter has lower event density. Time-weighted mean is session-length-neutral.

## Verdict Thresholds

```
score > -0.5  → LOW concern     (PASS verdict)
-1.5 < score ≤ -0.5 → MEDIUM concern (REVIEW verdict)
score ≤ -1.5  → HIGH concern    (FLAGGED verdict)
```

Thresholds map to:
- **Low**: At most 1-2 minor distractions in a 5-minute session.
- **Medium**: Multiple distraction events or a single absence event.
- **High**: Multiple absences, a tab switch, or any multi-face event (which at -3 in a 60s bucket immediately drops score below -1.5 for most session lengths).

## Per-Frame Score Computation

Frontend (non-exam mode) also computes a per-frame score for the live gauge:

```
focused:   75 + confidence * 25    (range: 75-100)
distracted: confidence * 60        (range: 0-60)
drowsy:    confidence * 50         (range: 0-50)
absent:    0
multi:     confidence * 35         (range: 0-35)
```

**Display score only** — the canonical integrity score uses the time-weighted mean above.
