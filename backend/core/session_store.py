from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Protocol

from backend.models.session import Event, Session, SessionSummary


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
