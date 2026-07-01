from __future__ import annotations
from datetime import datetime, timezone
from backend.models.session import Session, Verdict, Event
from backend.report.pdf import generate_session_pdf


def test_pdf_generation_runs() -> None:
    session = Session(
        id="test-session-pdf",
        start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        end=datetime(2025, 1, 1, 10, 5, 0, tzinfo=timezone.utc),
        mode="exam",
        final_score=85.0,
        pct_focused=90.0,
        verdict=Verdict.PASS,
        events=[
            Event(
                id="ev1",
                session_id="test-session-pdf",
                event_type="distracted",
                timestamp_s=30.0,
                confidence=0.8,
            )
        ]
    )
    pdf_bytes = generate_session_pdf(session)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0


def test_verify_get_endpoint_via_client() -> None:
    from fastapi.testclient import TestClient
    from backend.app.main import create_app

    app = create_app()
    with TestClient(app) as client:
        client.post("/api/sessions", json={
            "id": "session-test-verify-get",
            "start": "2025-01-01T10:00:00Z",
            "mode": "exam",
        })
        res = client.get("/api/verify/session-test-verify-get")
        assert res.status_code == 200
        data = res.json()
        assert "hash" in data
        assert len(data["hash"]) == 64


