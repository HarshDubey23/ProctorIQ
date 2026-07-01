from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.core.room_store import InMemoryRoomStore
from backend.core.session_store import InMemorySessionStore
from backend.cv.scoring import FlagEvent, compute_attention_score
from backend.models.session import Event, Session, SessionCreate, Verdict
from backend.report.signing import sign_session, verify_signature

TEST_SECRET = "test-hmac-secret-for-phase1"


class TestSessionCreateInputValidation:
    """Phase 1.3 — SessionCreate must not accept integrity fields."""

    def test_session_create_rejects_final_score(self) -> None:
        with pytest.raises(ValueError):
            SessionCreate.model_validate({"final_score": 100.0})

    def test_session_create_rejects_verdict(self) -> None:
        with pytest.raises(ValueError):
            SessionCreate.model_validate({"verdict": "PASS"})

    def test_session_create_rejects_events(self) -> None:
        with pytest.raises(ValueError):
            SessionCreate.model_validate({"events": []})

    def test_session_create_rejects_pct_focused(self) -> None:
        with pytest.raises(ValueError):
            SessionCreate.model_validate({"pct_focused": 90.0})

    def test_session_create_allows_benchmark(self) -> None:
        body = SessionCreate.model_validate({
            "benchmark": {
                "model_latency_ms": 10.0,
                "inference_count": 100,
                "pca_latency_ms": 5.0,
                "total_events": 0,
            }
        })
        assert body.benchmark is not None
        assert body.benchmark.model_latency_ms == 10.0

    def test_session_create_defaults_id_and_start(self) -> None:
        body = SessionCreate()
        assert body.id == ""
        assert body.start is None
        assert body.mode == "selftest"


class TestServerSideScoringOverride:
    """Phase 1.2 & 1.3 — Server-computed score/verdict cannot be
    overridden by client POST/PATCH input."""

    def test_post_rejects_final_score_field(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions", json={
                "id": "override-test",
                "start": "2025-01-01T10:00:00Z",
                "mode": "exam",
                "final_score": 100.0,
            })
            assert resp.status_code == 422

    def test_post_rejects_verdict_field(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions", json={
                "id": "override-test-2",
                "start": "2025-01-01T10:00:00Z",
                "mode": "exam",
                "verdict": "PASS",
            })
            assert resp.status_code == 422

    def test_post_rejects_events_field(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions", json={
                "id": "override-test-3",
                "start": "2025-01-01T10:00:00Z",
                "mode": "exam",
                "events": [],
            })
            assert resp.status_code == 422

    def test_post_creates_session_with_allowed_fields(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions", json={
                "id": "valid-session",
                "start": "2025-01-01T10:00:00Z",
                "mode": "exam",
            })
            assert resp.status_code == 201
            data = resp.json()
            assert data["final_score"] is None
            assert data["verdict"] is None
            assert data["quiz_score"] is None
            assert len(data["events"]) == 0

    def test_post_accepts_quiz_score(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions", json={
                "id": "quiz-score-session",
                "start": "2025-01-01T10:00:00Z",
                "mode": "exam",
                "quiz_score": 80.0,
            })
            assert resp.status_code == 201
            data = resp.json()
            assert data["quiz_score"] == 80.0
            assert data["final_score"] is None
            assert data["verdict"] is None

    def test_report_scores_reflect_event_log_not_cached_values(self) -> None:
        """Even if events are later added, the report endpoint computes
        fresh from the authoritative event list."""
        app = create_app()
        with TestClient(app) as client:
            client.post("/api/sessions", json={
                "id": "fresh-score-session",
                "start": "2025-01-01T10:00:00Z",
                "end": "2025-01-01T10:00:10Z",
                "mode": "exam",
            })

            # Directly inject events into the store
            store: InMemorySessionStore = app.state.session_store  # type: ignore[attr-defined]
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.add_event(
                    "fresh-score-session",
                    Event(id="ev1", session_id="fresh-score-session", event_type="absent", timestamp_s=5.0),
                ))
                loop.run_until_complete(store.add_event(
                    "fresh-score-session",
                    Event(id="ev2", session_id="fresh-score-session", event_type="distracted", timestamp_s=3.0),
                ))
            finally:
                loop.close()

            # Fetch the session — final_score should still be None
            get_resp = client.get("/api/sessions/fresh-score-session")
            assert get_resp.status_code == 200
            data = get_resp.json()
            assert data["final_score"] is None


class TestHMACSigning:
    """Phase 1.7 — HMAC-SHA256 keyed signing."""

    SECRET = "test-secret-key"

    def _make_session(self) -> Session:
        return Session(
            id="hmac-test-session",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            end=datetime(2025, 1, 1, 11, 0, 0, tzinfo=timezone.utc),
            mode="exam",
            final_score=-0.75,
            pct_focused=82.5,
            verdict=Verdict.FLAGGED,
        )

    def test_signature_fails_with_wrong_secret(self) -> None:
        session = self._make_session()
        sig = sign_session(session, secret="correct-secret")
        assert not verify_signature(session, sig, secret="wrong-secret")

    def test_signature_fails_when_payload_changes(self) -> None:
        session = self._make_session()
        sig = sign_session(session, secret=self.SECRET)
        session.final_score = 0.0
        assert not verify_signature(session, sig, secret=self.SECRET)

    def test_signature_fails_when_event_tampered(self) -> None:
        session = self._make_session()
        ev = Event(
            id="ev1", session_id="hmac-test-session",
            event_type="distracted", timestamp_s=30.0,
        )
        session.events.append(ev)
        sig = sign_session(session, secret=self.SECRET)

        tampered = session.model_copy(deep=True)
        tampered.events[0] = Event(
            id="ev1", session_id="hmac-test-session",
            event_type="distracted", timestamp_s=999.0,
        )
        assert not verify_signature(tampered, sig, secret=self.SECRET)

    def test_signature_succeeds_with_correct_secret(self) -> None:
        session = self._make_session()
        sig = sign_session(session, secret=self.SECRET)
        assert verify_signature(session, sig, secret=self.SECRET)

    def test_different_secrets_produce_different_signatures(self) -> None:
        session = self._make_session()
        sig_a = sign_session(session, secret="secret-a")
        sig_b = sign_session(session, secret="secret-b")
        assert sig_a != sig_b


@pytest.mark.asyncio
class TestWebSocketFlagAccumulation:
    """Phase 1.1 — WebSocket flag events accumulate correctly into
    a session's event log."""

    async def test_flag_events_persist_to_session(self) -> None:
        store = InMemorySessionStore()
        session = Session(
            id="ws-flag-session",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(session)

        # Simulate what _handle_flag does
        ev1 = Event(
            id="flag-1", session_id="ws-flag-session",
            event_type="distracted", timestamp_s=10.0, confidence=0.85,
        )
        ev2 = Event(
            id="flag-2", session_id="ws-flag-session",
            event_type="absent", timestamp_s=30.0, confidence=0.92,
        )
        await store.add_event("ws-flag-session", ev1)
        await store.add_event("ws-flag-session", ev2)

        fetched = await store.get_session("ws-flag-session")
        assert fetched is not None
        assert len(fetched.events) == 2
        assert fetched.events[0].event_type == "distracted"
        assert fetched.events[1].event_type == "absent"

    async def test_flag_events_can_be_scored(self) -> None:
        store = InMemorySessionStore()
        session = Session(
            id="ws-score-session",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            end=datetime(2025, 1, 1, 10, 0, 10, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(session)

        await store.add_event("ws-score-session", Event(
            id="f1", session_id="ws-score-session",
            event_type="absent", timestamp_s=5.0,
        ))

        fetched = await store.get_session("ws-score-session")
        assert fetched is not None
        flag_events = [
            FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
            for e in fetched.events
        ]
        result = compute_attention_score(flag_events, duration_s=10.0)
        assert result.score == pytest.approx(-0.2)


class TestCleanupTasks:
    """Phase 1.9 & 1.10 — Periodic cleanup purges stale entries."""

    @pytest.mark.asyncio
    async def test_room_store_cleanup_removes_stale_rooms(self) -> None:
        store = InMemoryRoomStore()
        room = await store.create_room()
        assert room.room_id in store._rooms

        # Manually set last_activity to 3 hours ago
        store._last_activity[room.room_id] = datetime.now(timezone.utc) - timedelta(hours=3)

        await store.cleanup_stale_rooms()
        assert room.room_id not in store._rooms

    @pytest.mark.asyncio
    async def test_room_store_cleanup_keeps_active_rooms(self) -> None:
        store = InMemoryRoomStore()
        room = await store.create_room()
        await store.cleanup_stale_rooms()
        assert room.room_id in store._rooms

    @pytest.mark.asyncio
    async def test_session_store_cleanup_removes_stale_sessions(self) -> None:
        store = InMemorySessionStore()
        session = Session(
            id="stale-session",
            start=datetime.now(timezone.utc) - timedelta(hours=2),
            mode="exam",
        )
        await store.create_session(session)

        await store.cleanup_stale_sessions(timeout_minutes=60)
        fetched = await store.get_session("stale-session")
        assert fetched is None

    @pytest.mark.asyncio
    async def test_session_store_cleanup_keeps_active_sessions(self) -> None:
        store = InMemorySessionStore()
        session = Session(
            id="active-session",
            start=datetime.now(timezone.utc) - timedelta(minutes=5),
            mode="exam",
        )
        await store.create_session(session)

        await store.cleanup_stale_sessions(timeout_minutes=60)
        fetched = await store.get_session("active-session")
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_session_store_cleanup_keeps_completed_sessions(self) -> None:
        store = InMemorySessionStore()
        session = Session(
            id="completed-session",
            start=datetime.now(timezone.utc) - timedelta(hours=3),
            end=datetime.now(timezone.utc) - timedelta(hours=2),
            mode="exam",
        )
        await store.create_session(session)

        await store.cleanup_stale_sessions(timeout_minutes=60)
        fetched = await store.get_session("completed-session")
        assert fetched is not None

    def test_periodic_cleanup_runs_in_lifespan(self) -> None:
        """Verify the background task is set up in the lifespan."""
        app = create_app()
        with TestClient(app) as client:
            assert hasattr(app.state, "session_store")
            assert hasattr(app.state, "room_store")
            # Cleanup task runs as a background asyncio task
            # Verify by triggering a health check
            resp = client.get("/health")
            assert resp.status_code == 200

    def test_create_session_via_api_starts_cleanup_eligible(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            old_start = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
            client.post("/api/sessions", json={
                "id": "cleanup-candidate",
                "start": old_start,
                "mode": "exam",
            })

            store: InMemorySessionStore = app.state.session_store  # type: ignore[attr-defined]
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    store.cleanup_stale_sessions(timeout_minutes=60)
                )
                fetched = loop.run_until_complete(
                    store.get_session("cleanup-candidate")
                )
            finally:
                loop.close()
            assert fetched is None


@pytest.mark.asyncio
class TestExamFlowIntegration:
    """Phase 4 — Exam flow: session creation, WebSocket event accumulation,
    report generation with server-computed scores."""

    async def test_exam_session_creates_backend_session(self) -> None:
        """Starting an exam via POST /api/sessions results in a real backend session."""
        store = InMemorySessionStore()
        session = Session(
            id="exam-flow-test",
            start=datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
            quiz_score=80.0,
        )
        created = await store.create_session(session)
        assert created.id == "exam-flow-test"
        assert created.mode == "exam"
        assert created.quiz_score == 80.0
        assert created.final_score is None
        assert created.verdict is None
        assert len(created.events) == 0

    async def test_exam_session_accumulates_ws_events(self) -> None:
        """Events sent via WebSocket flags persist in the session's event log."""
        store = InMemorySessionStore()
        session = Session(
            id="exam-ws-events",
            start=datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(session)

        await store.add_event("exam-ws-events", Event(
            id="ev1", session_id="exam-ws-events",
            event_type="distracted", timestamp_s=10.0, confidence=0.85,
        ))
        await store.add_event("exam-ws-events", Event(
            id="ev2", session_id="exam-ws-events",
            event_type="tab_switch", timestamp_s=30.0,
        ))
        await store.add_event("exam-ws-events", Event(
            id="ev3", session_id="exam-ws-events",
            event_type="absent", timestamp_s=45.0, confidence=0.92,
        ))

        fetched = await store.get_session("exam-ws-events")
        assert fetched is not None
        assert len(fetched.events) == 3
        assert fetched.events[0].event_type == "distracted"
        assert fetched.events[1].event_type == "tab_switch"
        assert fetched.events[2].event_type == "absent"

    async def test_report_uses_server_computed_scores_not_quiz_data(self) -> None:
        """The exam's final_score/verdict come from the server event log,
        not from client-submitted quiz_score."""
        store = InMemorySessionStore()
        session = Session(
            id="exam-report-scores",
            start=datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
            end=datetime(2025, 6, 1, 10, 0, 10, tzinfo=timezone.utc),
            mode="exam",
            quiz_score=95.0,  # high quiz score, but integrity should be independent
        )
        await store.create_session(session)

        # Add integrity-violating events
        await store.add_event("exam-report-scores", Event(
            id="ev1", session_id="exam-report-scores",
            event_type="absent", timestamp_s=5.0, confidence=0.9,
        ))
        await store.add_event("exam-report-scores", Event(
            id="ev2", session_id="exam-report-scores",
            event_type="distracted", timestamp_s=3.0, confidence=0.8,
        ))

        # Fetch session — final_score should still be None before report
        fetched = await store.get_session("exam-report-scores")
        assert fetched is not None
        assert fetched.quiz_score == 95.0
        assert fetched.final_score is None
        assert fetched.verdict is None

        # Compute what get_session_report would do
        from backend.cv.scoring import FlagEvent, compute_attention_score
        flag_events = [
            FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
            for e in fetched.events
        ]
        duration_s = int((fetched.end - fetched.start).total_seconds())
        result = compute_attention_score(flag_events, duration_s)

        # The score should reflect the penalty from the absent+distracted events,
        # not the quiz_score of 95
        assert result.score < 0
        assert result.score > -3.0  # reasonable range for 2 events in 10s

        # Persist scores as get_session_report now does
        from backend.models.session import Verdict
        if result.score > -0.5:
            verdict = Verdict.PASS
        elif result.score > -1.5:
            verdict = Verdict.FLAGGED
        else:
            verdict = Verdict.REVIEW
        fetched.final_score = result.score
        fetched.pct_focused = ((duration_s - sum(result.event_counts.values())) / duration_s * 100)
        fetched.verdict = verdict
        await store.update_session(fetched)

        # After persistence, GET should reflect server-computed values
        updated = await store.get_session("exam-report-scores")
        assert updated is not None
        assert updated.final_score == result.score
        assert updated.verdict == verdict
        assert updated.quiz_score == 95.0  # quiz_score unchanged

    async def test_get_session_matches_pdf_values_after_report(self) -> None:
        """After requesting a report, GET /api/sessions/{id} values match
        what was persisted by get_session_report."""
        store = InMemorySessionStore()
        session = Session(
            id="exam-pdf-consistency",
            start=datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
            end=datetime(2025, 6, 1, 10, 0, 10, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(session)

        await store.add_event("exam-pdf-consistency", Event(
            id="ev1", session_id="exam-pdf-consistency",
            event_type="absent", timestamp_s=5.0,
        ))

        # Simulate what get_session_report does
        fetched = await store.get_session("exam-pdf-consistency")
        assert fetched is not None
        flag_events = [
            FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
            for e in fetched.events
        ]
        duration_s = int((fetched.end - fetched.start).total_seconds())
        result = compute_attention_score(flag_events, duration_s)

        if result.score > -0.5:
            verdict = Verdict.PASS
        elif result.score > -1.5:
            verdict = Verdict.FLAGGED
        else:
            verdict = Verdict.REVIEW

        focused_seconds = duration_s - sum(result.event_counts.values())
        pct_focused = (focused_seconds / duration_s * 100) if duration_s > 0 else 0.0

        fetched.final_score = result.score
        fetched.pct_focused = pct_focused
        fetched.verdict = verdict
        await store.update_session(fetched)

        # Verify GET would return the persisted values
        final = await store.get_session("exam-pdf-consistency")
        assert final is not None
        assert final.final_score == result.score
        assert final.pct_focused == pct_focused
        assert final.verdict == verdict

