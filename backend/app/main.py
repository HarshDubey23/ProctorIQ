from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.core.config import get_settings
from backend.core.session_store import InMemorySessionStore
from backend.core.room_store import InMemoryRoomStore


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.session_store = InMemorySessionStore()
    app.state.room_store = InMemoryRoomStore()

    settings = get_settings()

    async def _periodic_cleanup() -> None:
        while True:
            await asyncio.sleep(300)
            try:
                await app.state.room_store.cleanup_stale_rooms()
            except Exception:
                pass
            try:
                await app.state.session_store.cleanup_stale_sessions(
                    timeout_minutes=settings.session_timeout_minutes
                )
            except Exception:
                pass

    cleanup_task = asyncio.create_task(_periodic_cleanup())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    from backend.app.api.health import router as health_router
    from backend.app.api.sessions import router as sessions_router
    from backend.app.api.verify import router as verify_router
    from backend.app.api.rooms import router as rooms_router
    from backend.app.middleware import register_middleware
    from backend.app.ws.handler import router as ws_router
    from backend.app.ws.room_handler import router as room_ws_router
    from backend.core.logging import setup_logging

    setup_logging()

    app = FastAPI(
        title="ProctorIQ API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.include_router(health_router)
    app.include_router(sessions_router, prefix="/api")
    app.include_router(verify_router, prefix="/api")
    app.include_router(rooms_router, prefix="/api")
    app.include_router(ws_router)
    app.include_router(room_ws_router)

    register_middleware(app)

    return app


app = create_app()
