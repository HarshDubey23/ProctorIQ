from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.core.collect_store import _store


@pytest.fixture(autouse=True)
def _reset_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    _store.reset_sync()
    monkeypatch.setenv("COLLECT_GITHUB_TOKEN", "test-token")

    async def _fake_commit_json_file(path: str, payload: dict[str, Any], message: str) -> None:
        return None

    monkeypatch.setattr("backend.app.api.collect.commit_json_file", _fake_commit_json_file)
    yield


def _make_app() -> FastAPI:
    from backend.app.main import create_app
    app = create_app()
    _store._ready = True  # skip GitHub rehydration in tests
    return app


class TestCollect:
    def _valid_payload(self, contributor_id: str = "test_user_abc123") -> dict[str, Any]:
        return {
            "contributor_id": contributor_id,
            "task_id": "focused",
            "label": "focused",
            "landmarks": [[0.0] * 936 for _ in range(20)],
            "duration_s": 5.0,
        }

    def test_submit_clip(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            resp = client.post("/api/collect/clip", json=self._valid_payload())
            assert resp.status_code == 201
            data = resp.json()
            assert "clip_hash" in data
            assert data["contributor_clip_count"] == 1

    def test_submit_clip_without_collect_token_returns_503(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("COLLECT_GITHUB_TOKEN", raising=False)
        app = _make_app()
        with TestClient(app) as client:
            resp = client.post("/api/collect/clip", json=self._valid_payload())
            assert resp.status_code == 503

    def test_invalid_label_returns_400(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            body = self._valid_payload()
            body["label"] = "invalid"
            resp = client.post("/api/collect/clip", json=body)
            assert resp.status_code == 400

    def test_clip_too_long_returns_413(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            body = self._valid_payload()
            body["duration_s"] = 25.0
            resp = client.post("/api/collect/clip", json=body)
            assert resp.status_code == 413

    def test_duplicate_clip_returns_409(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            body = self._valid_payload()
            resp = client.post("/api/collect/clip", json=body)
            assert resp.status_code == 201
            resp2 = client.post("/api/collect/clip", json=body)
            assert resp2.status_code == 409

    def test_status_endpoint(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            resp = client.get("/api/collect/status")
            assert resp.status_code == 200
            data = resp.json()
            assert "contributors" in data
            assert "max_contributors" in data
            assert data["max_contributors"] == 30

    def test_too_few_frames_returns_422(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            body = self._valid_payload()
            body["landmarks"] = [[0.0] * 936 for _ in range(5)]  # only 5 frames, below MIN_FRAMES
            resp = client.post("/api/collect/clip", json=body)
            assert resp.status_code == 422

    def test_wrong_frame_width_returns_422(self) -> None:
        app = _make_app()
        with TestClient(app) as client:
            body = self._valid_payload()
            body["landmarks"] = [[0.0] * 100 for _ in range(20)]  # 100 coords instead of 936
            resp = client.post("/api/collect/clip", json=body)
            assert resp.status_code == 422

    def test_browser_sized_clip_is_accepted_and_loadable(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Any
    ) -> None:
        """What the collect page actually sends: 150 frames of 4-decimal coords."""
        import json
        import random
        from pathlib import Path

        saved: dict[str, Any] = {}

        async def _capture(path: str, payload: dict[str, Any], message: str) -> None:
            saved["path"], saved["payload"] = path, payload

        monkeypatch.setattr("backend.app.api.collect.commit_json_file", _capture)
        rng = random.Random(0)
        body = self._valid_payload()
        body["landmarks"] = [[round(rng.random(), 4) for _ in range(936)] for _ in range(150)]
        with TestClient(_make_app()) as client:
            resp = client.post("/api/collect/clip", json=body)
        assert resp.status_code == 201, resp.text

        # The committed file must be readable by the training loader, frame for frame.
        from ml.data.loaders import iter_raw_clips

        target = Path(tmp_path) / saved["path"].removeprefix("ml/data/raw/")
        target.parent.mkdir(parents=True)
        target.write_text(json.dumps(saved["payload"]))
        clips = list(iter_raw_clips(Path(tmp_path)))
        assert len(clips) == 1
        arr, label, _ = clips[0]
        assert arr.shape == (150, 936) and label == "focused"
        assert abs(float(arr[0][0]) - body["landmarks"][0][0]) < 1e-6


class TestGitHubCommit:
    """commit_json_file against a fake GitHub (no network)."""

    def _patch(self, monkeypatch: pytest.MonkeyPatch, responses: list[int]) -> list[int]:
        import asyncio

        import httpx

        calls: list[int] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(1)
            return httpx.Response(responses[min(len(calls), len(responses)) - 1], json={})

        real = httpx.AsyncClient
        monkeypatch.setattr(httpx, "AsyncClient",
                            lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
        monkeypatch.setattr(asyncio, "sleep", _no_sleep)
        monkeypatch.setenv("COLLECT_GITHUB_REPO", "o/r")
        return calls

    @pytest.mark.asyncio
    async def test_branch_conflict_is_retried(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.core.github_commit import commit_json_file

        calls = self._patch(monkeypatch, [409, 409, 201])
        await commit_json_file("ml/data/raw/x.json", {"a": 1}, "msg")
        assert len(calls) == 3

    @pytest.mark.asyncio
    async def test_persistent_failure_becomes_clean_503(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from backend.core.github_commit import (
            CollectionUnavailableError,
            commit_json_file,
        )

        calls = self._patch(monkeypatch, [409])
        with pytest.raises(CollectionUnavailableError):
            await commit_json_file("ml/data/raw/x.json", {"a": 1}, "msg")
        assert len(calls) == 4

    @pytest.mark.asyncio
    async def test_concurrent_commits_never_overlap(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import asyncio

        import httpx

        import backend.core.github_commit as gc

        in_flight, peak = 0, 0

        async def fake_put(self: Any, *args: Any, **kwargs: Any) -> httpx.Response:
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return httpx.Response(201, json={})

        monkeypatch.setattr(httpx.AsyncClient, "put", fake_put)
        monkeypatch.setenv("COLLECT_GITHUB_REPO", "o/r")
        await asyncio.gather(*(gc.commit_json_file(f"p{i}.json", {}, "m") for i in range(6)))
        assert peak == 1


async def _no_sleep(_: float) -> None:
    return None
