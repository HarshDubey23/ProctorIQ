from __future__ import annotations

import base64
import json
import os
from typing import Any

import httpx

_API = "https://api.github.com"


class CollectionUnavailableError(Exception):
    pass


def get_collect_github_token() -> str:
    return os.environ.get("COLLECT_GITHUB_TOKEN", "")


def _github_repo() -> str:
    return os.environ.get("COLLECT_GITHUB_REPO", "")


def _github_branch() -> str:
    return os.environ.get("COLLECT_GITHUB_BRANCH", "collected-data")


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }


async def commit_json_file(path: str, payload: dict[str, Any], message: str) -> None:
    token = get_collect_github_token()
    if not token:
        raise CollectionUnavailableError("COLLECT_GITHUB_TOKEN is not configured")
    content = base64.b64encode(json.dumps(payload).encode()).decode()
    url = f"{_API}/repos/{_github_repo()}/contents/{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(2):
            resp = await client.put(
                url,
                headers=_headers(token),
                json={"message": message, "content": content, "branch": _github_branch()},
            )
            if resp.status_code in (429, 500, 502, 503) and attempt == 0:
                import asyncio
                await asyncio.sleep(1)
                continue
            resp.raise_for_status()
            return


async def list_existing_clip_paths() -> list[str]:
    token = get_collect_github_token()
    if not token:
        return []
    url = f"{_API}/repos/{_github_repo()}/git/trees/{_github_branch()}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params={"recursive": "1"}, headers=_headers(token))
        resp.raise_for_status()
        tree = resp.json()["tree"]
    return [
        item["path"]
        for item in tree
        if item["path"].startswith("ml/data/raw/") and item["path"].endswith(".json")
    ]
