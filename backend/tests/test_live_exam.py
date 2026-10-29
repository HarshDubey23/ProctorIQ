from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.main import create_app
from backend.core.grading import grade
from backend.models.paper import Paper, Question

QUESTIONS: list[dict[str, Any]] = [
    {"id": "mcq", "type": "mcq-single", "title": "Capital of France?", "body": "",
     "options": ["London", "Paris", "Berlin"], "correct_answer": "Paris", "marks": 2, "negative_marks": 0.5},
    {"id": "multi", "type": "mcq-multi", "title": "Primes?", "body": "",
     "options": ["2", "4", "5", "9"], "correct_answer": "2,5", "marks": 2},
    {"id": "tf", "type": "true-false", "title": "Sky is blue", "body": "",
     "options": ["True", "False"], "correct_answer": "True", "marks": 1},
    {"id": "num", "type": "numerical", "title": "Usable hosts in /26", "body": "", "correct_answer": "62", "marks": 1},
    {"id": "short", "type": "short-answer", "title": "HTTP verb to create", "body": "",
     "correct_answer": "POST", "marks": 1},
    {"id": "essay", "type": "long-answer", "title": "Explain TCP handshake", "body": "", "marks": 5},
]
CORRECT = {"mcq": "Paris", "multi": "5,2", "tf": "True", "num": "62.0", "short": " post ",
           "essay": "SYN, SYN-ACK, ACK ..."}


def _paper(**overrides: Any) -> Paper:
    return Paper(id="p", host_token="t", title="T", questions=[Question(**q) for q in QUESTIONS], **overrides)


class TestGrading:
    def test_all_correct_auto_types_and_essay_pending(self) -> None:
        r = grade(_paper(), CORRECT, {})
        assert r.correct == 5
        assert r.marks == 7  # everything except the 5-mark essay
        assert r.max_marks == 12
        assert r.pending_manual == 1
        assert [q.status for q in r.questions] == ["correct"] * 5 + ["pending"]

    def test_wrong_answer_applies_negative_marks_and_blank_does_not(self) -> None:
        r = grade(_paper(), {"mcq": "London", "multi": None, "tf": ""}, {})
        assert r.questions[0].awarded == -0.5
        assert r.questions[1].status == "blank" and r.questions[1].awarded == 0
        assert r.questions[2].status == "blank"
        assert r.marks == -0.5
        assert r.percent == 0.0  # percent never goes negative

    def test_option_answers_accept_index_or_text_either_side(self) -> None:
        legacy = Paper(id="p", host_token="t", title="T", questions=[
            Question(id="q", type="mcq-single", title="x", body="", options=["A", "B"], correct_answer="1"),
        ])
        assert grade(legacy, {"q": "B"}, {}).correct == 1
        assert grade(legacy, {"q": "1"}, {}).correct == 1
        assert grade(legacy, {"q": "A"}, {}).correct == 0

    def test_multi_needs_exact_set(self) -> None:
        assert grade(_paper(), {"multi": "2"}, {}).questions[1].status == "wrong"
        assert grade(_paper(), {"multi": "2,5,9"}, {}).questions[1].status == "wrong"
        assert grade(_paper(), {"multi": "Not an option"}, {}).questions[1].status == "wrong"

    def test_numerical_rejects_non_numbers(self) -> None:
        assert grade(_paper(), {"num": "sixty-two"}, {}).questions[3].status == "wrong"
        assert grade(_paper(), {"num": "62.0001"}, {}).questions[3].status == "wrong"

    def test_manual_marks_are_clamped_to_question_marks(self) -> None:
        r = grade(_paper(), CORRECT, {"essay": 99})
        assert r.questions[5].awarded == 5 and r.questions[5].status == "graded"
        assert r.pending_manual == 0 and r.marks == 12


def _setup(client: TestClient, **paper_overrides: Any) -> dict[str, str]:
    host = client.post("/api/hosts").json()
    paper = client.post(
        "/api/papers", headers={"X-Host-Token": host["host_token"]},
        json={"title": "Live", "duration_minutes": 30, "questions": QUESTIONS, **paper_overrides},
    ).json()
    room = client.post("/api/rooms", headers={"X-Host-Token": host["host_token"]},
                       json={"paper_id": paper["id"]})
    assert room.status_code == 201
    return {"room_id": room.json()["room_id"], "room_token": room.json()["host_token"], "paper_id": paper["id"]}


def _join(client: TestClient, room_id: str, name: str = "Asha") -> dict[str, str]:
    r = client.post(f"/api/rooms/{room_id}/join", json={"display_name": name})
    assert r.status_code == 201
    return {"session_id": r.json()["session_id"], "token": r.json()["student_token"]}


def _st(student: dict[str, str]) -> dict[str, str]:
    return {"X-Student-Token": student["token"]}


class TestLiveExamFlow:
    def test_room_creation_requires_paper_owner(self) -> None:
        with TestClient(create_app()) as client:
            paper = client.post("/api/papers", json={"title": "x", "questions": QUESTIONS}).json()
            assert client.post("/api/rooms", json={"paper_id": paper["id"]}).status_code == 403
            assert client.post("/api/rooms", headers={"X-Host-Token": "nope"},
                               json={"paper_id": paper["id"]}).status_code == 403

    def test_full_flow_join_start_autosave_submit_grade(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            host = {"X-Host-Token": ids["room_token"]}
            s = _join(client, rid)

            # Questions are hidden until you join, and never carry answers.
            assert client.get(f"/api/rooms/{rid}/paper").status_code == 403
            start = client.post(f"/api/rooms/{rid}/start", headers=_st(s), json={"session_id": s["session_id"]})
            assert start.status_code == 200
            body = start.json()
            assert body["status"] == "in_progress" and body["ws_token"] and body["deadline"]
            assert "correct_answer" not in str(body["paper"])
            assert len(body["paper"]["questions"]) == len(QUESTIONS)

            # Autosave, then a reload resumes with the same answers and start time.
            save = client.put(f"/api/rooms/{rid}/answers", headers=_st(s),
                              json={"session_id": s["session_id"], "answers": {"mcq": "Paris", "bogus": "x"}})
            assert save.json() == {"saved": 1, "answered": 1}
            again = client.post(f"/api/rooms/{rid}/start", headers=_st(s), json={"session_id": s["session_id"]})
            assert again.json()["answers"] == {"mcq": "Paris"}
            assert again.json()["started_at"] == body["started_at"]

            # Host sees progress live.
            members = client.get(f"/api/rooms/{rid}", headers=host).json()["members"]
            assert members[0]["status"] == "in_progress" and members[0]["answered"] == 1
            assert "student_token" not in str(members)

            res = client.post(f"/api/rooms/{rid}/submit", headers=_st(s),
                              json={"session_id": s["session_id"], "answers": CORRECT})
            assert res.status_code == 200
            assert res.json()["marks"] == 7 and res.json()["max_marks"] == 12
            assert res.json()["pending_manual"] == 1 and res.json()["status"] == "submitted"

            # No second attempt, no edits after submitting.
            assert client.post(f"/api/rooms/{rid}/submit", headers=_st(s),
                               json={"session_id": s["session_id"], "answers": {}}).status_code == 409
            assert client.put(f"/api/rooms/{rid}/answers", headers=_st(s),
                              json={"session_id": s["session_id"], "answers": {"mcq": "x"}}).status_code == 409

            results = client.get(f"/api/rooms/{rid}/results", headers=host).json()
            st = results["students"][0]
            essay = next(a for a in st["answers"] if a["question_id"] == "essay")
            assert essay["answer"] == CORRECT["essay"] and essay["result"] == "pending"

            graded = client.post(f"/api/rooms/{rid}/members/{s['session_id']}/grade", headers=host,
                                 json={"question_id": "essay", "marks": 4})
            assert graded.json()["marks"] == 11 and graded.json()["pending_manual"] == 0
            assert client.post(f"/api/rooms/{rid}/members/{s['session_id']}/grade", headers=host,
                               json={"question_id": "essay", "marks": 6}).status_code == 422
            mine = client.get(f"/api/rooms/{rid}/my-result", headers=_st(s),
                              params={"session_id": s["session_id"]}).json()
            assert mine["marks"] == 11

    def test_students_cannot_act_for_each_other_or_read_host_data(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            a, b = _join(client, rid, "A"), _join(client, rid, "B")
            assert client.get(f"/api/rooms/{rid}").status_code == 403
            assert client.get(f"/api/rooms/{rid}/results", headers=_st(a)).status_code == 403
            forged = {"X-Student-Token": a["token"]}
            assert client.post(f"/api/rooms/{rid}/start", headers=forged,
                               json={"session_id": b["session_id"]}).status_code == 403
            assert client.post(f"/api/rooms/{rid}/submit", headers=forged,
                               json={"session_id": b["session_id"], "answers": {}}).status_code == 403

    def test_after_deadline_only_the_autosaved_draft_counts(self) -> None:
        app = create_app()
        with TestClient(app) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            s = _join(client, rid)
            client.post(f"/api/rooms/{rid}/start", headers=_st(s), json={"session_id": s["session_id"]})
            client.put(f"/api/rooms/{rid}/answers", headers=_st(s),
                       json={"session_id": s["session_id"], "answers": {"mcq": "Paris"}})

            store = app.state.session_store
            loop = asyncio.new_event_loop()
            try:
                sess = loop.run_until_complete(store.get_session(s["session_id"]))
                sess.start = datetime.now(UTC) - timedelta(minutes=31)
                loop.run_until_complete(store.update_session(sess))
            finally:
                loop.close()

            late = client.put(f"/api/rooms/{rid}/answers", headers=_st(s),
                              json={"session_id": s["session_id"], "answers": {"tf": "True"}})
            assert late.status_code == 409
            res = client.post(f"/api/rooms/{rid}/submit", headers=_st(s),
                              json={"session_id": s["session_id"], "answers": CORRECT})
            assert res.json()["marks"] == 2  # only the saved MCQ, not the late payload

    def test_shuffle_is_stable_per_student(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client, shuffle_questions=True, shuffle_options=True)
            rid = ids["room_id"]
            orders = []
            for i in range(6):
                s = _join(client, rid, f"S{i}")
                p1 = client.post(f"/api/rooms/{rid}/start", headers=_st(s),
                                 json={"session_id": s["session_id"]}).json()["paper"]
                p2 = client.post(f"/api/rooms/{rid}/start", headers=_st(s),
                                 json={"session_id": s["session_id"]}).json()["paper"]
                assert p1 == p2
                assert sorted(q["id"] for q in p1["questions"]) == sorted(q["id"] for q in QUESTIONS)
                orders.append(tuple(q["id"] for q in p1["questions"]))
            assert len(set(orders)) > 1

    def test_closing_room_blocks_new_starts_and_host_can_terminate(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            host = {"X-Host-Token": ids["room_token"]}
            active, late = _join(client, rid, "A"), _join(client, rid, "B")
            client.post(f"/api/rooms/{rid}/start", headers=_st(active), json={"session_id": active["session_id"]})
            term = client.post(f"/api/rooms/{rid}/members/{active['session_id']}/terminate", headers=host, json={})
            assert term.json()["status"] == "terminated"
            assert client.post(f"/api/rooms/{rid}/close", headers=host).status_code == 200
            assert client.post(f"/api/rooms/{rid}/start", headers=_st(late),
                               json={"session_id": late["session_id"]}).status_code == 410


class TestLiveSockets:
    def test_room_feed_needs_host_token(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client)
            with pytest.raises(WebSocketDisconnect) as exc:
                with client.websocket_connect(f"/ws/room/{ids['room_id']}") as ws:
                    ws.receive_json()
            assert exc.value.code == 4401
            with client.websocket_connect(f"/ws/room/{ids['room_id']}?host_token={ids['room_token']}") as ws:
                assert ws.receive_json()["type"] == "room_update"

    def test_flags_reach_host_and_warnings_reach_student(self) -> None:
        with TestClient(create_app()) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            s = _join(client, rid)
            ws_token = client.post(f"/api/rooms/{rid}/start", headers=_st(s),
                                   json={"session_id": s["session_id"]}).json()["ws_token"]
            url = f"/ws/{s['session_id']}?token={ws_token}&room_id={rid}&display_name=Hacker"
            with client.websocket_connect(url) as ws:
                ws.send_json({"type": "flag", "event_type": "tab_switch", "timestamp_s": 99999})
                ws.send_json({"type": "flag", "event_type": "tab_switch", "timestamp_s": 0})
                ws.receive_json()  # first tick
                warn = client.post(f"/api/rooms/{rid}/members/{s['session_id']}/warn",
                                   headers={"X-Host-Token": ids["room_token"]}, json={"message": "Eyes on screen"})
                assert warn.json()["delivered"] is True
                msg = ws.receive_json()
                while msg["type"] == "tick":
                    msg = ws.receive_json()
                assert msg == {"type": "host_warning", "message": "Eyes on screen"}
                for _ in range(3):  # member stats are flushed every couple of ticks
                    ws.receive_json()

            member = client.get(f"/api/rooms/{rid}", headers={"X-Host-Token": ids["room_token"]}).json()["members"][0]
            assert member["display_name"] == "Asha"  # name from the server, not the query string
            assert member["flags"].get("tab_switch") == 2 and member["warnings"] == 1
            assert member["status"] == "disconnected"
            session = client.get(f"/api/sessions/{s['session_id']}").json()
            assert all(e["timestamp_s"] < 60 for e in session["events"])  # server clock, not client's

    def test_socket_rejects_room_it_does_not_belong_to(self) -> None:
        with TestClient(create_app()) as client:
            a, b = _setup(client), _setup(client)
            s = _join(client, a["room_id"])
            tok = client.post(f"/api/rooms/{a['room_id']}/start", headers=_st(s),
                              json={"session_id": s["session_id"]}).json()["ws_token"]
            with pytest.raises(WebSocketDisconnect) as exc:
                with client.websocket_connect(f"/ws/{s['session_id']}?token={tok}&room_id={b['room_id']}") as ws:
                    ws.receive_json()
            assert exc.value.code == 4403


class TestSqlitePersistence:
    def test_papers_rooms_and_answers_survive_restart(self, tmp_path: Any, monkeypatch: Any) -> None:
        from backend.core import config

        monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "exam.db"))
        monkeypatch.setattr(config, "_settings", None)
        with TestClient(create_app()) as client:
            ids = _setup(client)
            rid = ids["room_id"]
            s = _join(client, rid)
            client.post(f"/api/rooms/{rid}/start", headers=_st(s), json={"session_id": s["session_id"]})
            client.post(f"/api/rooms/{rid}/submit", headers=_st(s),
                        json={"session_id": s["session_id"], "answers": CORRECT})
        assert (tmp_path / "exam.db").stat().st_size > 0

        with TestClient(create_app()) as client:
            results = client.get(f"/api/rooms/{rid}/results", headers={"X-Host-Token": ids["room_token"]})
            assert results.status_code == 200
            st = results.json()["students"][0]
            assert st["marks"] == 7 and st["status"] == "submitted"
            assert next(a for a in st["answers"] if a["question_id"] == "essay")["answer"] == CORRECT["essay"]
        monkeypatch.setattr(config, "_settings", None)
