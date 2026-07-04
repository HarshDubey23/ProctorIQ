from __future__ import annotations

import asyncio

from backend.models.paper import Paper


class InMemoryPaperStore:
    def __init__(self) -> None:
        self._papers: dict[str, Paper] = {}
        self._lock = asyncio.Lock()

    async def create(self, paper: Paper) -> Paper:
        async with self._lock:
            self._papers[paper.id] = paper.model_copy(deep=True)
            return self._papers[paper.id].model_copy(deep=True)

    async def get(self, paper_id: str) -> Paper | None:
        async with self._lock:
            paper = self._papers.get(paper_id)
            return paper.model_copy(deep=True) if paper else None

    async def list_by_host(self, host_token: str) -> list[Paper]:
        async with self._lock:
            return [p.model_copy(deep=True) for p in self._papers.values() if p.host_token == host_token]
