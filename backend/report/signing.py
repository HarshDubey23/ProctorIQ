from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from backend.core.config import get_settings
from backend.models.session import Session


def _canonical_json(obj: Any, *, sort_keys: bool = True) -> str:
    return json.dumps(obj, sort_keys=sort_keys, separators=(",", ":"), ensure_ascii=False)


def _get_secret(override: str | None = None) -> str:
    return override if override is not None else get_settings().report_signing_secret


def sign_session(session: Session, secret: str | None = None) -> str:
    events_sorted = sorted(
        [
            {
                "event_type": e.event_type,
                "timestamp_s": e.timestamp_s,
                "confidence": e.confidence,
            }
            for e in session.events
        ],
        key=_sort_key_for_event,
    )

    payload = {
        "session_id": session.id,
        "start": session.start.isoformat() if session.start else None,
        "end": session.end.isoformat() if session.end else None,
        "mode": session.mode,
        "final_score": session.final_score,
        "pct_focused": session.pct_focused,
        "verdict": session.verdict.value if session.verdict else None,
        "events": events_sorted,
    }

    canonical = _canonical_json(payload)
    key = _get_secret(secret)
    return hmac.new(key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def _sort_key_for_event(e: dict[str, Any]) -> tuple[float, str]:
    return (float(e["timestamp_s"]), str(e["event_type"]))


def verify_signature(session: Session, signature: str, secret: str | None = None) -> bool:
    expected = sign_session(session, secret=secret)
    return _constant_time_compare(expected, signature)


def _constant_time_compare(a: str, b: str) -> bool:
    if len(a) != len(b):
        return False
    result = 0
    for ca, cb in zip(a.encode("utf-8"), b.encode("utf-8"), strict=True):
        result |= ca ^ cb
    return result == 0
