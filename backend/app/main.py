from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.core.session_store import InMemorySessionStore
from backend.core.room_store import InMemoryRoomStore


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.session_store = InMemorySessionStore()
    app.state.room_store = InMemoryRoomStore()
    yield


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
