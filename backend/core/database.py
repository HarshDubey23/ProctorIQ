"""Async engine and session management for the persistent stores (SQLite or Postgres)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import Connection, inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

_engine = None
_sessionmaker = None


def engine_args(target: str) -> tuple[str, dict[str, Any]]:
    """Turn DATABASE_URL or a SQLite file path into an async SQLAlchemy URL plus connect args."""
    if "://" not in target:
        return f"sqlite+aiosqlite:///{target}", {}
    parts = urlsplit(target)
    if not parts.scheme.startswith("postgres"):
        return target, {}
    # asyncpg rejects libpq query options such as sslmode, so drop them and set SSL here.
    # Supabase's pooler can't keep prepared statements across pooled connections:
    # turn off both SQLAlchemy's cache (URL option) and asyncpg's (connect arg).
    url = urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, "prepared_statement_cache_size=0", ""))
    connect_args: dict[str, Any] = {"statement_cache_size": 0}
    if parts.hostname not in ("localhost", "127.0.0.1"):
        connect_args["ssl"] = "require"
    return url, connect_args


async def init_db(target: str) -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        return
    url, connect_args = engine_args(target)
    _engine = create_async_engine(url, echo=False, connect_args=connect_args, pool_pre_ping=True)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    async with _engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(conn: Connection) -> None:
    # create_all never alters existing tables; add columns introduced since the DB was made.
    inspector = inspect(conn)
    for table in SQLModel.metadata.sorted_tables:
        existing = {c["name"] for c in inspector.get_columns(table.name)}
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
        raise RuntimeError("Database not initialized — call init_db() first")
    async with _sessionmaker() as session:
        yield session
