from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


class _FakeHFResponse:
    def __init__(
        self,
        questions: list[dict[str, Any]] | None = None,
        content: str | None = None,
    ) -> None:
        self._questions = questions
        self._content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        content = self._content
        if content is None:
            content = json.dumps({"questions": self._questions or []})
        return {
            "choices": [
                {
                    "message": {
                        "content": content,
                    }
                }
            ]
        }


@pytest.fixture(autouse=True)
def _reset_hf_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_API_TOKEN", "test-hf-token")
    monkeypatch.setattr("backend.core.config._settings", None)
    from backend.app.api import papers

    papers._generate_rate_limits.clear()


def _valid_question(question_id: str = "q1") -> dict[str, Any]:
    return {
        "id": question_id,
        "type": "mcq-single",
        "title": "Capital",
        "body": "What is the capital of France?",
        "marks": 1,
        "negative_marks": 0,
        "topic": "Geography",
        "difficulty": "easy",
        "options": ["Paris", "London"],
        "correct_answer": "Paris",
    }


def _request_body() -> dict[str, Any]:
    return {
        "subject": "Geography",
        "question_count": 1,
        "question_types": ["mcq-single"],
        "difficulty": "easy",
    }


class TestHFGeneration:
    def test_generate_returns_parsed_questions(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            return _FakeHFResponse([_valid_question()])

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/papers/generate", json=_request_body())
            assert resp.status_code == 200
            data = resp.json()
            assert data["generated"] == 1
            assert data["questions"][0]["correct_answer"] == "Paris"
            assert data["model_used"] == "openai/gpt-oss-120b:fastest"

    def test_malformed_questions_are_dropped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            malformed = {"id": "bad", "type": "mcq-single"}
            return _FakeHFResponse([malformed, _valid_question("q2")])

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/papers/generate", json=_request_body())
            assert resp.status_code == 200
            data = resp.json()
            assert data["generated"] == 1
            assert data["questions"][0]["id"] == "q2"

    def test_unset_hf_token_returns_503(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.core.config import Settings
        monkeypatch.setattr("backend.core.config._settings", Settings(hf_api_token=""))
        app = create_app()
        with TestClient(app) as client:
            resp = client.post("/api/papers/generate", json=_request_body())
            assert resp.status_code == 503

    def test_eleventh_request_per_hour_returns_429(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            return _FakeHFResponse([_valid_question()])

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            for _ in range(10):
                assert client.post("/api/papers/generate", json=_request_body()).status_code == 200
            resp = client.post("/api/papers/generate", json=_request_body())
            assert resp.status_code == 429

    def test_chat_ask_response_returns_clarifying_question(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            return _FakeHFResponse(content=json.dumps({
                "action": "ask",
                "message": "What subject should the paper cover?",
            }))

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            resp = client.post(
                "/api/papers/generate/chat",
                json={"conversation": [{"role": "user", "content": "I need a midterm."}]},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["action"] == "ask"
            assert "subject" in data["message"].lower()

    def test_chat_turn_cap_forces_generation(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured_payload: dict[str, Any] = {}

        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            captured_payload.update(kwargs["json"])
            return _FakeHFResponse(content=json.dumps({
                "action": "generate",
                "assumptions": "Assumed five medium DBMS MCQs.",
                "questions": [_valid_question()],
            }))

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            resp = client.post(
                "/api/papers/generate/chat",
                json={
                    "conversation": [
                        {"role": "user", "content": "I need an exam."},
                        {"role": "assistant", "content": "Which subject?"},
                        {"role": "user", "content": "DBMS."},
                        {"role": "assistant", "content": "How many questions?"},
                        {"role": "user", "content": "You decide."},
                    ]
                },
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["action"] == "generate"
            assert data["questions"][0]["correct_answer"] == "Paris"
            assert any(
                message["content"] == "Generate now. Do not ask another clarifying question."
                for message in captured_payload["messages"]
            )

    def test_chat_malformed_json_returns_502(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_post(self: Any, *args: Any, **kwargs: Any) -> _FakeHFResponse:
            return _FakeHFResponse(content="not json")

        monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
        app = create_app()
        with TestClient(app) as client:
            resp = client.post(
                "/api/papers/generate/chat",
                json={"conversation": [{"role": "user", "content": "Generate a DBMS quiz."}]},
            )
            assert resp.status_code == 502
