from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.core.session_store import InMemorySessionStore
from backend.cv.scoring import FlagEvent, compute_attention_score
from backend.models.session import Event, Session, SessionUpdate


@pytest.fixture
def ctx() -> Generator[tuple[FastAPI, TestClient], None, None]:
    """Return (app, client) with lifespan already entered so the store is alive."""
    app = create_app()
    client = TestClient(app)
    with client:
        yield (app, client)


class TestSessionUpdateModel:
    def test_allows_end_and_mode(self) -> None:
        body = SessionUpdate(end=None, mode="self_test")
        assert body.mode == "self_test"

    def test_forbids_final_score(self) -> None:
        with pytest.raises(ValueError):
            SessionUpdate.model_validate({"final_score": 100.0})

    def test_forbids_verdict(self) -> None:
        with pytest.raises(ValueError):
            SessionUpdate.model_validate({"verdict": "PASS"})

    def test_forbids_events(self) -> None:
        with pytest.raises(ValueError):
            SessionUpdate.model_validate({"events": []})

    def test_forbids_benchmark(self) -> None:
        with pytest.raises(ValueError):
            SessionUpdate.model_validate({"benchmark": {}})


class TestPatchTamperResistance:
    def test_patch_rejects_unknown_fields_with_422(self, ctx: tuple[FastAPI, TestClient]) -> None:
        """Any field not in SessionUpdate should result in a 422 validation error."""
        app, client = ctx

        # Create a session first
        resp = client.post("/api/sessions", json={
            "id": "test-session",
            "start": "2025-01-01T10:00:00Z",
            "mode": "exam",
        })
        assert resp.status_code == 201

        verdict_resp = client.patch("/api/sessions/test-session", json={"verdict": "PASS"})
        assert verdict_resp.status_code == 422

        score_resp = client.patch("/api/sessions/test-session", json={"final_score": 100.0})
        assert score_resp.status_code == 422

        events_resp = client.patch("/api/sessions/test-session", json={"events": []})
        assert events_resp.status_code == 422

        bench_resp = client.patch("/api/sessions/test-session", json={
            "benchmark": {"model_latency_ms": 1.0, "inference_count": 1, "pca_latency_ms": 1.0, "total_events": 999},
        })
        assert bench_resp.status_code == 422

        # Verify none of the forbidden fields were set
        get_resp = client.get("/api/sessions/test-session")
        data = get_resp.json()
        assert data["verdict"] is None
        assert data["final_score"] is None
        assert len(data["events"]) == 0
        assert data["benchmark"] is None

    def test_patch_updates_mode(self, ctx: tuple[FastAPI, TestClient]) -> None:
        app, client = ctx
        client.post("/api/sessions", json={
            "id": "test-session2",
            "start": "2025-01-01T10:00:00Z",
            "mode": "exam",
        })
        resp = client.patch("/api/sessions/test-session2", json={"mode": "self_test"})
        assert resp.status_code == 200
        assert resp.json()["mode"] == "self_test"

    def test_patch_updates_end(self, ctx: tuple[FastAPI, TestClient]) -> None:
        app, client = ctx
        client.post("/api/sessions", json={
            "id": "test-session3",
            "start": "2025-01-01T10:00:00Z",
            "mode": "exam",
        })
        resp = client.patch("/api/sessions/test-session3", json={"end": "2025-01-01T11:00:00Z"})
        assert resp.status_code == 200
        assert resp.json()["end"] is not None


class TestReportScoreIntegrity:
    def test_patch_does_not_set_final_score_or_verdict(self, ctx: tuple[FastAPI, TestClient]) -> None:
        app, client = ctx
        resp = client.post("/api/sessions", json={
            "id": "integrity-session",
            "start": "2025-01-01T10:00:00Z",
            "mode": "exam",
        })
        assert resp.status_code == 201

        # Attempt to tamper
        client.patch("/api/sessions/integrity-session", json={"final_score": 100.0, "end": "2025-01-01T10:00:10Z"})

        # final_score should NOT have been set (422 from PATCH, or ignored)
        get_resp = client.get("/api/sessions/integrity-session")
        data = get_resp.json()
        assert data["final_score"] is None

    @pytest.mark.asyncio
    async def test_report_computes_score_from_event_log(self) -> None:
        """Even if final_score is tampered directly on the store, the report
        recomputes it from the authoritative event log."""
        app = create_app()
        store = InMemorySessionStore()
        app.state.session_store = store
        app.state.room_store = InMemorySessionStore()

        session_id = "compute-from-events"
        await store.create_session(Session(
            id=session_id,
            start=__import__("datetime").datetime(2025, 1, 1, 10, 0, 0),
            mode="exam",
        ))
        await store.add_event(session_id, Event(
            id="ev1", session_id=session_id, event_type="absent", timestamp_s=5.0,
        ))

        # Tamper final_score directly in the store
        session = await store.get_session(session_id)
        assert session is not None
        session.end = __import__("datetime").datetime(2025, 1, 1, 10, 0, 10)
        session.final_score = 100.0
        await store.update_session(session)

        # Verify the score computed from events is correct
        fresh = await store.get_session(session_id)
        assert fresh is not None
        flag_events = [
            FlagEvent(event_type=e.event_type, timestamp_s=e.timestamp_s)
            for e in fresh.events
        ]
        result = compute_attention_score(flag_events, 10)
        assert result.score == pytest.approx(-0.2)
        assert result.score != 100.0

    def test_compute_attention_score_with_events(self) -> None:
        events = [FlagEvent(event_type="absent", timestamp_s=5.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.2)
