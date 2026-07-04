from __future__ import annotations

import asyncio
from collections import defaultdict

from backend.core.github_commit import list_existing_clip_paths


class CollectStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._clip_counts: dict[str, int] = defaultdict(int)
        self._known_hashes: set[str] = set()
        self._ready = False

    async def rehydrate(self) -> None:
        async with self._lock:
            if self._ready:
                return
            for path in await list_existing_clip_paths():
                parts = path.split("/")
                if len(parts) < 5:
                    continue
                contributor_folder = parts[-3]
                _label = parts[-2]
                filename = parts[-1]
                contributor_id = contributor_folder.rsplit("_", 1)[0]
                self._clip_counts[contributor_id] += 1
                hash_part = filename.removesuffix(".json")
                self._known_hashes.add(hash_part)
            self._ready = True

    async def contributor_count(self) -> int:
        async with self._lock:
            return len(self._clip_counts)

    async def knows_contributor(self, contributor_id: str) -> bool:
        async with self._lock:
            return contributor_id in self._clip_counts

    async def clip_count_for(self, contributor_id: str) -> int:
        async with self._lock:
            return self._clip_counts.get(contributor_id, 0)

    async def has_hash(self, clip_hash: str) -> bool:
        async with self._lock:
            return clip_hash in self._known_hashes

    async def record_accepted(self, contributor_id: str, clip_hash: str) -> None:
        async with self._lock:
            self._clip_counts[contributor_id] += 1
            self._known_hashes.add(clip_hash)

    def reset_sync(self) -> None:
        self._clip_counts.clear()
        self._known_hashes.clear()
        self._ready = False


_store = CollectStore()


async def _get_collect_store() -> CollectStore:
    await _store.rehydrate()
    return _store
