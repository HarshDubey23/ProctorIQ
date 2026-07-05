from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import null
from sqlmodel import Field, SQLModel, desc, select

from backend.core.database import get_session
from backend.models.session import Event, Session, SessionSummary, Verdict


class SessionRow(SQLModel, table=True):
    __tablename__ = "sessions"
    id: str = Field(primary_key=True)
    start: str
    end: str | None = None
    mode: str
    quiz_score: float | None = None
    final_score: float | None = None
    pct_focused: float | None = None
    verdict: str | None = None
    events_json: str = "[]"
    benchmark_json: str | None = None


class WsTokenRow(SQLModel, table=True):
    __tablename__ = "ws_tokens"
    session_id: str = Field(primary_key=True)
    token: str


class SessionStore(Protocol):
    async def create_session(self, session: Session) -> Session: ...

    async def get_session(self, session_id: str) -> Session | None: ...

    async def set_ws_token(self, session_id: str, token: str) -> None: ...

    async def get_ws_token(self, session_id: str) -> str | None: ...

    async def update_session(self, session: Session) -> Session: ...

    async def add_event(self, session_id: str, event: Event) -> Event: ...

    async def list_sessions(
        self, limit: int = 50, offset: int = 0
    ) -> list[SessionSummary]: ...

    async def cleanup_stale_sessions(self, timeout_minutes: int = 60) -> None: ...


class InMemorySessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._ws_tokens: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create_session(self, session: Session) -> Session:
        async with self._lock:
            self._sessions[session.id] = session.model_copy(deep=True)
            return self._sessions[session.id].model_copy(deep=True)

    async def get_session(self, session_id: str) -> Session | None:
        async with self._lock:
            if session_id not in self._sessions:
                return None
            return self._sessions[session_id].model_copy(deep=True)

    async def set_ws_token(self, session_id: str, token: str) -> None:
        async with self._lock:
            self._ws_tokens[session_id] = token

    async def get_ws_token(self, session_id: str) -> str | None:
        async with self._lock:
            return self._ws_tokens.get(session_id)

    async def update_session(self, session: Session) -> Session:
        async with self._lock:
            self._sessions[session.id] = session.model_copy(deep=True)
            return self._sessions[session.id].model_copy(deep=True)

    async def add_event(self, session_id: str, event: Event) -> Event:
        async with self._lock:
            sess = self._sessions.get(session_id)
            if sess is None:
                raise ValueError(f"Session {session_id} not found")
            sess.events.append(event)
            return event

    async def cleanup_stale_sessions(self, timeout_minutes: int = 60) -> None:
        async with self._lock:
            now = datetime.now(timezone.utc)
            stale = []
            for sid, sess in self._sessions.items():
                if sess.end is None and sess.start:
                    elapsed = (now - sess.start).total_seconds()
                    if elapsed > timeout_minutes * 60:
                        stale.append(sid)
            for sid in stale:
                self._sessions.pop(sid, None)

    async def list_sessions(
        self, limit: int = 50, offset: int = 0
    ) -> list[SessionSummary]:
        async with self._lock:
            summaries: list[SessionSummary] = []
            for session in self._sessions.values():
                event_counts: dict[str, int] = {}
                for ev in session.events:
                    event_counts[ev.event_type] = event_counts.get(ev.event_type, 0) + 1
                summaries.append(
                    SessionSummary(
                        session_id=session.id,
                        start=session.start,
                        end=session.end,
                        mode=session.mode,
                        quiz_score=session.quiz_score,
                        final_score=session.final_score,
                        pct_focused=session.pct_focused,
                        verdict=session.verdict,
                        event_counts=event_counts,
                    )
                )
            summaries.sort(key=lambda s: s.start, reverse=True)
            return summaries[offset : offset + limit]


def _session_from_row(row: SessionRow) -> Session:
    events_data = json.loads(row.events_json) if row.events_json else []
    events = [Event(**ev) for ev in events_data]
    benchmark = None
    if row.benchmark_json:
        from backend.models.session import BenchmarkResult
        benchmark = BenchmarkResult(**json.loads(row.benchmark_json))
    verdict_val: Verdict | None = None
    if row.verdict:
        verdict_val = Verdict(row.verdict)
    return Session(
        id=row.id,
        start=datetime.fromisoformat(row.start),
        end=datetime.fromisoformat(row.end) if row.end else None,
        mode=row.mode,
        quiz_score=row.quiz_score,
        final_score=row.final_score,
        pct_focused=row.pct_focused,
        verdict=verdict_val,
        events=events,
        benchmark=benchmark,
    )


def _row_from_session(session: Session) -> SessionRow:
    return SessionRow(
        id=session.id,
        start=session.start.isoformat(),
        end=session.end.isoformat() if session.end else None,
        mode=session.mode,
        quiz_score=session.quiz_score,
        final_score=session.final_score,
        pct_focused=session.pct_focused,
        verdict=session.verdict.value if session.verdict else None,
        events_json=json.dumps([ev.model_dump() for ev in session.events]),
        benchmark_json=json.dumps(session.benchmark.model_dump()) if session.benchmark else None,
    )


class SqliteSessionStore:
    def __init__(self) -> None:
        self._ws_tokens: dict[str, str] = {}

    async def create_session(self, session: Session) -> Session:
        async with get_session() as db:
            row = _row_from_session(session)
            db.add(row)
            await db.commit()
            await db.refresh(row)
            return _session_from_row(row)

    async def get_session(self, session_id: str) -> Session | None:
        async with get_session() as db:
            row = await db.get(SessionRow, session_id)
            return _session_from_row(row) if row else None

    async def set_ws_token(self, session_id: str, token: str) -> None:
        async with get_session() as db:
            existing = await db.get(WsTokenRow, session_id)
            if existing:
                existing.token = token
            else:
                db.add(WsTokenRow(session_id=session_id, token=token))
            await db.commit()

    async def get_ws_token(self, session_id: str) -> str | None:
        async with get_session() as db:
            row = await db.get(WsTokenRow, session_id)
            return row.token if row else None

    async def update_session(self, session: Session) -> Session:
        async with get_session() as db:
            row = await db.get(SessionRow, session.id)
            if row is None:
                raise ValueError(f"Session {session.id} not found")
            new_row = _row_from_session(session)
            row.start = new_row.start
            row.end = new_row.end
            row.mode = new_row.mode
            row.quiz_score = new_row.quiz_score
            row.final_score = new_row.final_score
            row.pct_focused = new_row.pct_focused
            row.verdict = new_row.verdict
            row.events_json = new_row.events_json
            row.benchmark_json = new_row.benchmark_json
            await db.commit()
            await db.refresh(row)
            return _session_from_row(row)

    async def add_event(self, session_id: str, event: Event) -> Event:
        async with get_session() as db:
            row = await db.get(SessionRow, session_id)
            if row is None:
                raise ValueError(f"Session {session_id} not found")
            events = json.loads(row.events_json) if row.events_json else []
            events.append(event.model_dump())
            row.events_json = json.dumps(events)
            await db.commit()
            return event

    async def cleanup_stale_sessions(self, timeout_minutes: int = 60) -> None:
        async with get_session() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(
                select(SessionRow).where(SessionRow.end == null())
            )
            rows = result.scalars().all()
            for row in rows:
                start = datetime.fromisoformat(row.start) if row.start else None
                if start and (now - start).total_seconds() > timeout_minutes * 60:
                    await db.delete(row)
            await db.commit()

    async def list_sessions(
        self, limit: int = 50, offset: int = 0
    ) -> list[SessionSummary]:
        async with get_session() as db:
            result = await db.execute(
                select(SessionRow).order_by(desc(SessionRow.start)).offset(offset).limit(limit)
            )
            rows = result.scalars().all()
            summaries: list[SessionSummary] = []
            for row in rows:
                events_data = json.loads(row.events_json) if row.events_json else []
                event_counts: dict[str, int] = {}
                for ev in events_data:
                    et = ev.get("event_type", "unknown")
                    event_counts[et] = event_counts.get(et, 0) + 1
                verdict_val: Verdict | None = None
                if row.verdict:
                    verdict_val = Verdict(row.verdict)
                summaries.append(
                    SessionSummary(
                        session_id=row.id,
                        start=datetime.fromisoformat(row.start),
                        end=datetime.fromisoformat(row.end) if row.end else None,
                        mode=row.mode,
                        quiz_score=row.quiz_score,
                        final_score=row.final_score,
                        pct_focused=row.pct_focused,
                        verdict=verdict_val,
                        event_counts=event_counts,
                    )
                )
            return summaries
