from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import create_app


def _create_paper(client: TestClient) -> tuple[str, str]:
    resp = client.post("/api/papers", json={
        "title": "Test Paper",
        "duration_minutes": 60,
        "questions": [
            {"id": "q1", "type": "mcq-single", "title": "What is 2+2?",
             "body": "Choose the correct answer", "options": ["3", "4", "5"],
             "correct_answer": "1", "marks": 1.0},
            {"id": "q2", "type": "mcq-single", "title": "Capital of France?",
             "body": "", "options": ["London", "Paris", "Berlin"],
             "correct_answer": "1", "marks": 1.0},
        ],
        "sections": [{"id": "sec1", "title": "Section A", "question_ids": ["q1", "q2"]}],
    })
    assert resp.status_code == 201
    data = resp.json()
    return data["id"], data["host_token"]


class TestPaperCRUD:
    def test_create_paper(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, token = _create_paper(client)
            assert pid.startswith("p_")
            assert len(token) > 10

    def test_get_paper_requires_host_token(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, _ = _create_paper(client)
            resp = client.get(f"/api/papers/{pid}")
            assert resp.status_code == 422

    def test_get_paper_with_wrong_token_returns_403(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, _ = _create_paper(client)
            resp = client.get(f"/api/papers/{pid}", headers={"X-Host-Token": "wrong-token"})
            assert resp.status_code == 403

    def test_get_paper_with_host_token(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, token = _create_paper(client)
            resp = client.get(f"/api/papers/{pid}", headers={"X-Host-Token": token})
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == pid
            assert len(data["questions"]) == 2
            assert data["questions"][0]["correct_answer"] == "1"

    def test_get_public_paper_strips_answers(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, _ = _create_paper(client)
            resp = client.get(f"/api/papers/{pid}/public")
            assert resp.status_code == 200
            data = resp.json()
            assert "correct_answer" not in str(data["questions"][0])
            assert data["questions"][0]["title"] == "What is 2+2?"

    def test_get_nonexistent_paper(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.get("/api/papers/nonexistent/public")
            assert resp.status_code == 404


class TestSubmitAnswers:
    def test_submit_answers_computes_score(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, _ = _create_paper(client)
            room_resp = client.post("/api/rooms", json={"paper_id": pid, "title": "Test Room"})
            assert room_resp.status_code == 201
            room_id = room_resp.json()["room_id"]

            import asyncio
            from backend.core.room_store import InMemoryRoomStore
            from backend.models.room import RoomMember
            from datetime import datetime, timezone
            store: InMemoryRoomStore = app.state.room_store
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room_id,
                    RoomMember(
                        session_id="submit-test-session",
                        display_name="Test User",
                        score=0,
                        current_state="focused",
                        elapsed_seconds=0,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
            finally:
                loop.close()

            client.post("/api/sessions", json={
                "id": "submit-test-session",
                "start": "2026-07-04T10:00:00Z",
                "mode": "exam",
            })

            resp = client.post("/api/sessions/submit-test-session/submit", json={
                "answers": [
                    {"question_id": "q1", "selected_answer": "1"},
                    {"question_id": "q2", "selected_answer": "2"},
                ],
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["correct"] == 1
            assert data["total"] == 2
            assert data["score"] == 50.0

    def test_submit_all_correct(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            pid, _ = _create_paper(client)
            room_resp = client.post("/api/rooms", json={"paper_id": pid})
            assert room_resp.status_code == 201
            room_id = room_resp.json()["room_id"]

            import asyncio
            from backend.core.room_store import InMemoryRoomStore
            from backend.models.room import RoomMember
            from datetime import datetime, timezone
            store: InMemoryRoomStore = app.state.room_store
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(store.upsert_member(
                    room_id,
                    RoomMember(
                        session_id="submit-all-correct",
                        display_name="Test User",
                        score=0,
                        current_state="focused",
                        elapsed_seconds=0,
                        event_count=0,
                        joined_at=datetime.now(timezone.utc),
                    ),
                ))
            finally:
                loop.close()

            client.post("/api/sessions", json={
                "id": "submit-all-correct",
                "start": "2026-07-04T10:00:00Z",
                "mode": "exam",
            })

            resp = client.post("/api/sessions/submit-all-correct/submit", json={
                "answers": [
                    {"question_id": "q1", "selected_answer": "1"},
                    {"question_id": "q2", "selected_answer": "1"},
                ],
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["correct"] == 2
            assert data["score"] == 100.0

    def test_submit_no_session_returns_404(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/sessions/nonexistent/submit", json={"answers": []})
            assert resp.status_code == 404

    def test_create_room_rejects_missing_paper(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/rooms", json={"paper_id": "nonexistent"})
            assert resp.status_code == 404
