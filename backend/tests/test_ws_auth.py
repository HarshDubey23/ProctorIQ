from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.main import create_app


def _create_session(client: TestClient, session_id: str = "ws-auth-session") -> str:
    resp = client.post("/api/sessions", json={"id": session_id, "mode": "exam"})
    assert resp.status_code == 201
    token = resp.json()["ws_token"]
    assert isinstance(token, str)
    return token


class TestWebSocketAuth:
    def test_missing_token_is_rejected(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            _create_session(client)
            with pytest.raises(WebSocketDisconnect) as exc:
                with client.websocket_connect("/ws/ws-auth-session"):
                    pass
            assert exc.value.code == 4401

    def test_wrong_token_is_rejected(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            _create_session(client)
            with pytest.raises(WebSocketDisconnect) as exc:
                with client.websocket_connect("/ws/ws-auth-session?token=wrong"):
                    pass
            assert exc.value.code == 4401

    def test_valid_token_receives_tick(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            token = _create_session(client)
            with client.websocket_connect(f"/ws/ws-auth-session?token={token}") as ws:
                tick = ws.receive_json()
            assert tick["session_id"] == "ws-auth-session"
            assert tick["type"] == "tick"
