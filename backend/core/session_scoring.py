from __future__ import annotations

from datetime import datetime, timezone

from backend.cv.scoring import FlagEvent, compute_attention_score
from backend.models.session import Session, Verdict


def apply_server_integrity_score(session: Session) -> Session:
    flag_events = [
        FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
        for e in session.events
    ]
    duration_s = 0
    if session.end and session.start:
        duration_s = int((session.end - session.start).total_seconds())
    elif session.start:
        duration_s = int((datetime.now(timezone.utc) - session.start).total_seconds())

    score_result = compute_attention_score(flag_events, duration_s)

    if score_result.score > -0.5:
        verdict = Verdict.PASS
    elif score_result.score > -1.5:
        verdict = Verdict.FLAGGED
    elif score_result.score > -3.0:
        verdict = Verdict.REVIEW
    else:
        verdict = Verdict.INCONCLUSIVE

    focused_seconds = duration_s - sum(score_result.event_counts.values())
    session.final_score = score_result.score
    session.pct_focused = (focused_seconds / duration_s * 100) if duration_s > 0 else 0.0
    session.verdict = verdict
    return session
