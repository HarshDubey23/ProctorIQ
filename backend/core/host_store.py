from __future__ import annotations

import asyncio

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
