from __future__ import annotations

import asyncio

from backend.models.accommodation import AccommodationProfile


class InMemoryAccommodationStore:
    def __init__(self) -> None:
        self._profiles: dict[str, AccommodationProfile] = {}
        self._lock = asyncio.Lock()

    async def list(self) -> list[AccommodationProfile]:
        async with self._lock:
            return [p.model_copy(deep=True) for p in self._profiles.values()]

    async def create(self, profile: AccommodationProfile) -> AccommodationProfile:
        async with self._lock:
            self._profiles[profile.id] = profile.model_copy(deep=True)
            return self._profiles[profile.id].model_copy(deep=True)

    async def delete(self, profile_id: str) -> bool:
        async with self._lock:
            return self._profiles.pop(profile_id, None) is not None
