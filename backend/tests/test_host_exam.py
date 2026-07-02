from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.core.room_store import InMemoryRoomStore
from backend.core.session_store import InMemorySessionStore
from backend.models.room import Room, RoomMember
from backend.models.session import Session


def _create_room_directly(store: InMemoryRoomStore, **kwargs) -> Room:
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        room = loop.run_until_complete(store.create_room(
            title=kwargs.get("title", ""),
            duration_minutes=kwargs.get("duration_minutes"),
            max_participants=kwargs.get("max_participants"),
        ))
        return room
    finally:
        loop.close()


class TestRoomCreationWithNewFields:
    def test_create_room_with_title(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Midterm Exam"})
            assert resp.status_code == 201
            data = resp.json()
            room_id = data["room_id"]
            get_resp = client.get(f"/api/rooms/{room_id}")
            assert get_resp.json()["title"] == "Midterm Exam"

    def test_create_room_with_duration(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Timed", "duration_minutes": 60})
            assert resp.status_code == 201
            data = resp.json()
            get_resp = client.get(f"/api/rooms/{data['room_id']}")
            assert get_resp.json()["duration_minutes"] == 60

    def test_create_room_with_max_participants(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Limited", "max_participants": 2})
            assert resp.status_code == 201
            data = resp.json()
            get_resp = client.get(f"/api/rooms/{data['room_id']}")
            assert get_resp.json()["max_participants"] == 2

    def test_default_room_status_is_open(self) -> None:
        store = InMemoryRoomStore()
        room = _create_room_directly(store)
        assert room.status == "open"

    def test_host_token_not_exposed_via_get(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Token Test"})
            assert resp.status_code == 201
            data = resp.json()
            get_resp = client.get(f"/api/rooms/{data['room_id']}")
            assert "host_token" not in get_resp.json()

    def test_create_returns_host_token_and_join_url(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "New Room"})
            assert resp.status_code == 201
            data = resp.json()
            assert "host_token" in data
            assert len(data["host_token"]) > 10
            assert data["join_url"] == f"/join/{data['room_id']}"


class TestMaxParticipantsEnforcement:
    def test_join_rejected_when_room_full(self) -> None:
        store = InMemoryRoomStore()
        room = _create_room_directly(store, title="Full Room", max_participants=1)

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(store.upsert_member(
                room.room_id,
                RoomMember(
                    session_id="existing-session",
                    display_name="Existing User",
                    score=50,
                    current_state="focused",
                    elapsed_seconds=10,
                    event_count=0,
                    joined_at=datetime.now(timezone.utc),
                ),
            ))
        finally:
            loop.close()

        with pytest.raises(ValueError, match="maximum capacity"):
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room.room_id,
                    RoomMember(
                        session_id="new-session",
                        display_name="New User",
                        score=50,
                        current_state="focused",
                        elapsed_seconds=10,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
            finally:
                loop.close()

    def test_join_check_endpoint_rejects_full_room(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"max_participants": 1})
            assert resp.status_code == 201
            room_id = resp.json()["room_id"]
            store: InMemoryRoomStore = app.state.room_store
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room_id,
                    RoomMember(
                        session_id="existing",
                        display_name="Existing User",
                        score=50,
                        current_state="focused",
                        elapsed_seconds=10,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
            finally:
                loop.close()
            check_resp = client.get(f"/api/rooms/{room_id}/join-check")
            assert check_resp.status_code == 429

    def test_join_closed_room_rejected(self) -> None:
        store = InMemoryRoomStore()
        room = _create_room_directly(store, title="Closed Room")
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(store.close_room(room.room_id))
        finally:
            loop.close()

        with pytest.raises(ValueError, match="Room is closed"):
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room.room_id,
                    RoomMember(
                        session_id="test-session",
                        display_name="Test User",
                        score=50,
                        current_state="focused",
                        elapsed_seconds=10,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
            finally:
                loop.close()


class TestHostTokenRequired:
    def test_close_room_without_token_returns_422(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Auth Test"})
            assert resp.status_code == 201
            room_id = resp.json()["room_id"]
            close_resp = client.post(f"/api/rooms/{room_id}/close")
            assert close_resp.status_code == 422

    def test_close_room_with_wrong_token_returns_403(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Auth Test 2"})
            assert resp.status_code == 201
            room_id = resp.json()["room_id"]
            close_resp = client.post(
                f"/api/rooms/{room_id}/close",
                headers={"X-Host-Token": "wrong-token"},
            )
            assert close_resp.status_code == 403

    def test_close_room_with_correct_token_succeeds(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Auth Test 3"})
            assert resp.status_code == 201
            data = resp.json()
            room_id = data["room_id"]
            host_token = data["host_token"]
            close_resp = client.post(
                f"/api/rooms/{room_id}/close",
                headers={"X-Host-Token": host_token},
            )
            assert close_resp.status_code == 200
            assert close_resp.json()["status"] == "closed"


class TestReportsHostToken:
    def test_reports_without_token_returns_422(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Reports Auth"})
            assert resp.status_code == 201
            room_id = resp.json()["room_id"]
            reports_resp = client.get(f"/api/rooms/{room_id}/reports")
            assert reports_resp.status_code == 422

    def test_reports_with_wrong_token_returns_403(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Reports Auth 2"})
            assert resp.status_code == 201
            room_id = resp.json()["room_id"]
            reports_resp = client.get(
                f"/api/rooms/{room_id}/reports",
                headers={"X-Host-Token": "wrong"},
            )
            assert reports_resp.status_code == 403

    def test_reports_with_correct_token_returns_summary(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Reports Good"})
            assert resp.status_code == 201
            data = resp.json()
            room_id = data["room_id"]
            host_token = data["host_token"]
            reports_resp = client.get(
                f"/api/rooms/{room_id}/reports",
                headers={"X-Host-Token": host_token},
            )
            assert reports_resp.status_code == 200
            result = reports_resp.json()
            assert result["room_id"] == room_id
            assert "reports" in result


class TestDurationAutoClose:
    @pytest.mark.asyncio
    async def test_duration_auto_close(self) -> None:
        from backend.app.main import _close_expired_rooms
        store = InMemoryRoomStore()
        room = await store.create_room(title="Expiring", duration_minutes=0)
        assert room.status == "open"
        await _close_expired_rooms(store)
        updated = await store.get_room(room.room_id)
        assert updated is not None
        assert updated.status == "closed"

    @pytest.mark.asyncio
    async def test_duration_not_exceeded(self) -> None:
        from backend.app.main import _close_expired_rooms
        store = InMemoryRoomStore()
        room = await store.create_room(title="Active", duration_minutes=60)
        await _close_expired_rooms(store)
        updated = await store.get_room(room.room_id)
        assert updated is not None
        assert updated.status == "open"


class TestCombinedReportEndpoint:
    def test_zip_contains_pdfs_and_csv(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"title": "Zip Test"})
            assert resp.status_code == 201
            data = resp.json()
            room_id = data["room_id"]
            host_token = data["host_token"]

            store: InMemoryRoomStore = app.state.room_store
            session_store: InMemorySessionStore = app.state.session_store
            import asyncio

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room_id,
                    RoomMember(
                        session_id="p1-session",
                        display_name="Alice",
                        score=80,
                        current_state="focused",
                        elapsed_seconds=30,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
                loop.run_until_complete(session_store.create_session(Session(
                    id="p1-session",
                    start=datetime.now(timezone.utc) - timedelta(seconds=30),
                    end=datetime.now(timezone.utc),
                    mode="exam",
                )))
                loop.run_until_complete(store.upsert_member(
                    room_id,
                    RoomMember(
                        session_id="p2-session",
                        display_name="Bob",
                        score=60,
                        current_state="distracted",
                        elapsed_seconds=20,
                        event_count=2,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
                loop.run_until_complete(session_store.create_session(Session(
                    id="p2-session",
                    start=datetime.now(timezone.utc) - timedelta(seconds=20),
                    end=datetime.now(timezone.utc),
                    mode="exam",
                )))
            finally:
                loop.close()

            reports_resp = client.get(
                f"/api/rooms/{room_id}/reports?format=zip",
                headers={"X-Host-Token": host_token},
            )
            assert reports_resp.status_code == 200
            assert reports_resp.headers["content-type"] == "application/zip"

            zf = zipfile.ZipFile(io.BytesIO(reports_resp.content))
            names = zf.namelist()
            assert "summary.csv" in names
            pdfs = [n for n in names if n.endswith(".pdf")]
            assert len(pdfs) >= 1

            csv_content = zf.read("summary.csv").decode("utf-8")
            reader = csv.DictReader(io.StringIO(csv_content))
            rows = list(reader)
            assert len(rows) >= 1
