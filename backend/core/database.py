"""Async SQLite engine and session management for persistent stores."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import Connection
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
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(conn: Connection) -> None:
    # create_all never alters existing tables; add columns introduced since the DB was made.
    for table in SQLModel.metadata.sorted_tables:
        existing = {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info("{table.name}")')}
        for col in table.columns:
            if col.name in existing:
                continue
            default = getattr(col.default, "arg", None)
            if callable(default):
                default = None
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col.type.compile(conn.dialect)}'
            if default is not None:
                ddl += " DEFAULT " + (f"'{default}'" if isinstance(default, str) else str(default))
            conn.exec_driver_sql(ddl)


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
