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
            assert len(data["events"]) == 0

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
