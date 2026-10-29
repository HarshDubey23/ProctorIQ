from __future__ import annotations

import asyncio

from sqlmodel import Field, SQLModel, select

from backend.core.database import get_session
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

    async def list_by_host_id(self, host_id: str) -> list[Paper]:
        async with self._lock:
            return [p.model_copy(deep=True) for p in self._papers.values() if p.host_id == host_id]


class PaperRow(SQLModel, table=True):
    __tablename__ = "papers"
    id: str = Field(primary_key=True)
    host_token: str = Field(index=True)
    host_id: str = Field(default="", index=True)
    data_json: str


class SqlitePaperStore:
    async def create(self, paper: Paper) -> Paper:
        async with get_session() as db:
            db.add(PaperRow(id=paper.id, host_token=paper.host_token, host_id=paper.host_id,
                            data_json=paper.model_dump_json()))
            await db.commit()
            return paper

    async def get(self, paper_id: str) -> Paper | None:
        async with get_session() as db:
            row = await db.get(PaperRow, paper_id)
            return Paper.model_validate_json(row.data_json) if row else None

    async def list_by_host(self, host_token: str) -> list[Paper]:
        async with get_session() as db:
            rows = (await db.execute(select(PaperRow).where(PaperRow.host_token == host_token))).scalars()
            return [Paper.model_validate_json(r.data_json) for r in rows]

    async def list_by_host_id(self, host_id: str) -> list[Paper]:
        async with get_session() as db:
            rows = (await db.execute(select(PaperRow).where(PaperRow.host_id == host_id))).scalars()
            return [Paper.model_validate_json(r.data_json) for r in rows]
