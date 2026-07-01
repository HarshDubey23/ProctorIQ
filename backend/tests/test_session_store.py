from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.core.session_store import InMemorySessionStore
from backend.models.session import Event, Session, Verdict


@pytest.fixture
def store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def sample_session() -> Session:
    return Session(
        id="s1",
        start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        mode="exam",
    )


class TestInMemorySessionStore:
    @pytest.mark.asyncio
    async def test_create_and_get(self, store: InMemorySessionStore) -> None:
        sess = Session(
            id="s1",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        created = await store.create_session(sess)
        assert created.id == "s1"

        fetched = await store.get_session("s1")
        assert fetched is not None
        assert fetched.id == "s1"

        missing = await store.get_session("nonexistent")
        assert missing is None

    @pytest.mark.asyncio
    async def test_create_returns_copy(self, store: InMemorySessionStore) -> None:
        sess = Session(id="s1", start=datetime.now(timezone.utc), mode="self_test")
        created = await store.create_session(sess)
        created.final_score = 10.0
        fetched = await store.get_session("s1")
        assert fetched is not None
        assert fetched.final_score is None

    @pytest.mark.asyncio
    async def test_add_event(self, store: InMemorySessionStore) -> None:
        sess = Session(
            id="s1",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(sess)
        event = Event(
            id="ev1",
            session_id="s1",
            event_type="distracted",
            timestamp_s=10.0,
        )
        added = await store.add_event("s1", event)
        assert added.id == "ev1"

        fetched = await store.get_session("s1")
        assert fetched is not None
        assert len(fetched.events) == 1
        assert fetched.events[0].event_type == "distracted"

    @pytest.mark.asyncio
    async def test_add_event_to_nonexistent_session_raises(
        self, store: InMemorySessionStore
    ) -> None:
        event = Event(
            id="ev1",
            session_id="ghost",
            event_type="focused",
            timestamp_s=0.0,
        )
        with pytest.raises(ValueError, match="not found"):
            await store.add_event("ghost", event)

    @pytest.mark.asyncio
    async def test_update_session(self, store: InMemorySessionStore) -> None:
        sess = Session(
            id="s1",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(sess)

        updated = Session(
            id="s1",
            start=sess.start,
            end=datetime(2025, 1, 1, 11, 0, 0, tzinfo=timezone.utc),
            mode="exam",
            final_score=-1.0,
            verdict=Verdict.FLAGGED,
        )
        await store.update_session(updated)

        fetched = await store.get_session("s1")
        assert fetched is not None
        assert fetched.final_score == -1.0
        assert fetched.verdict == Verdict.FLAGGED

    @pytest.mark.asyncio
    async def test_list_sessions(self, store: InMemorySessionStore) -> None:
        for i in range(3):
            sess = Session(
                id=f"s{i}",
                start=datetime(2025, 1, 1, 10 + i, 0, 0, tzinfo=timezone.utc),
                mode="exam",
            )
            await store.create_session(sess)

        if i % 2 == 0:  # Just to silence linter
            pass

        summaries = await store.list_sessions(limit=10, offset=0)
        assert len(summaries) == 3

    @pytest.mark.asyncio
    async def test_list_sessions_respects_limit_offset(
        self, store: InMemorySessionStore
    ) -> None:
        for i in range(5):
            sess = Session(
                id=f"s{i}",
                start=datetime(2025, 1, 1, 10 + i, 0, 0, tzinfo=timezone.utc),
                mode="exam",
            )
            await store.create_session(sess)

        page = await store.list_sessions(limit=2, offset=1)
        assert len(page) == 2

    @pytest.mark.asyncio
    async def test_event_counts_in_summary(self, store: InMemorySessionStore) -> None:
        sess = Session(
            id="s1",
            start=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            mode="exam",
        )
        await store.create_session(sess)
        for ev_type in ["distracted", "distracted", "absent"]:
            await store.add_event(
                "s1",
                Event(id=ev_type, session_id="s1", event_type=ev_type, timestamp_s=10.0),
            )

        summaries = await store.list_sessions()
        assert len(summaries) == 1
        assert summaries[0].event_counts["distracted"] == 2
        assert summaries[0].event_counts["absent"] == 1
