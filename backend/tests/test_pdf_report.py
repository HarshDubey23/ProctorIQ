from __future__ import annotations
from datetime import datetime, timezone
import pytest
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


@pytest.mark.asyncio
async def test_verify_get_endpoint() -> None:
    from backend.app.api.verify import get_session_hash
    from backend.core.session_store import InMemorySessionStore
    from backend.models.session import Session
    from datetime import datetime, timezone

    store = InMemorySessionStore()
    session = Session(
        id="session-test-verify-get",
        start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        mode="exam",
        events=[],
    )
    await store.create_session(session)

    res = await get_session_hash("session-test-verify-get", store=store)
    assert "hash" in res
    assert len(res["hash"]) == 64


