"""Async SQLite engine and session management for persistent stores."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

_engine = None
_sessionmaker = None


async def init_db(sqlite_path: str) -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        return
    _engine = create_async_engine(f"sqlite+aiosqlite:///{sqlite_path}", echo=False)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    async with _engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def close_db() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    if _sessionmaker is None:
        raise RuntimeError("Database not initialized — call init_db(sqlite_path) first")
    async with _sessionmaker() as session:
        yield session
