from __future__ import annotations

import asyncio
from datetime import datetime

from sqlmodel import Field, SQLModel, select

from backend.core.database import get_session
from backend.models.host import HostAccount


class InMemoryHostStore:
    def __init__(self) -> None:
        self._hosts: dict[str, HostAccount] = {}
        self._tokens: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create(self, host: HostAccount) -> HostAccount:
        async with self._lock:
            self._hosts[host.host_id] = host.model_copy(deep=True)
            self._tokens[host.host_token] = host.host_id
            return self._hosts[host.host_id].model_copy(deep=True)

    async def get_by_token(self, host_token: str) -> HostAccount | None:
        async with self._lock:
            host_id = self._tokens.get(host_token)
            if host_id is None:
                return None
            host = self._hosts.get(host_id)
            return host.model_copy(deep=True) if host else None


class HostRow(SQLModel, table=True):
    __tablename__ = "hosts"
    host_id: str = Field(primary_key=True)
    host_token: str = Field(index=True, unique=True)
    created_at: str


class SqliteHostStore:
    async def create(self, host: HostAccount) -> HostAccount:
        async with get_session() as db:
            db.add(HostRow(host_id=host.host_id, host_token=host.host_token,
                           created_at=host.created_at.isoformat()))
            await db.commit()
            return host

    async def get_by_token(self, host_token: str) -> HostAccount | None:
        async with get_session() as db:
            row = (await db.execute(select(HostRow).where(HostRow.host_token == host_token))).scalar_one_or_none()
            if row is None:
                return None
            return HostAccount(host_id=row.host_id, host_token=row.host_token,
                               created_at=datetime.fromisoformat(row.created_at))
