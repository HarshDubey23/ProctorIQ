from __future__ import annotations

from datetime import datetime, timezone

from backend.models.session import Event, Session, Verdict
from backend.report.signing import sign_session, verify_signature


def _make_session(**overrides: object) -> Session:
    base = Session(
        id="test-session-001",
        start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        end=datetime(2025, 1, 1, 11, 0, 0, tzinfo=timezone.utc),
        mode="exam",
        final_score=-0.75,
        pct_focused=82.5,
        verdict=Verdict.FLAGGED,
        events=[
            Event(
                id="ev1",
                session_id="test-session-001",
                event_type="distracted",
                timestamp_s=120.0,
                confidence=0.85,
            ),
            Event(
                id="ev2",
                session_id="test-session-001",
                event_type="absent",
                timestamp_s=300.0,
                confidence=0.92,
            ),
            Event(
                id="ev3",
                session_id="test-session-001",
                event_type="focused",
                timestamp_s=0.0,
            ),
        ],
    )
    for k, v in overrides.items():
        setattr(base, k, v)
    return base


class TestSigning:
    def test_sign_and_verify(self) -> None:
        session = _make_session()
        sig = sign_session(session)
        assert isinstance(sig, str)
        assert len(sig) == 64
        assert verify_signature(session, sig)

    def test_tampered_session_fails(self) -> None:
        session = _make_session()
        sig = sign_session(session)
        session.final_score = 0.0
        assert not verify_signature(session, sig)

    def test_tampered_event_fails(self) -> None:
        session = _make_session()
        sig = sign_session(session)
        tampered = Session(
            id=session.id,
            start=session.start,
            end=session.end,
            mode=session.mode,
            final_score=session.final_score,
            pct_focused=session.pct_focused,
            verdict=session.verdict,
            events=[
                Event(
                    id="ev1",
                    session_id="test-session-001",
                    event_type="distracted",
                    timestamp_s=999.0,
                    confidence=0.85,
                ),
            ],
        )
        assert not verify_signature(tampered, sig)

    def test_empty_events(self) -> None:
        session = _make_session(events=[])
        sig = sign_session(session)
        assert verify_signature(session, sig)

    def test_deterministic(self) -> None:
        s1 = _make_session()
        s2 = _make_session()
        assert sign_session(s1) == sign_session(s2)

    def test_constant_time_compare_rejects_length_mismatch(self) -> None:
        from backend.report.signing import _constant_time_compare

        assert not _constant_time_compare("abc", "ab")
        assert not _constant_time_compare("a", "bb")
        assert _constant_time_compare("abc123", "abc123")
        assert not _constant_time_compare("abc123", "abc124")
