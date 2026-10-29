from __future__ import annotations

import asyncio
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


# Every commit moves the branch head, so GitHub rejects simultaneous commits to one
# branch with 409. Commit one at a time; retry covers writers outside this process.
_commit_lock = asyncio.Lock()
_RETRYABLE = (409, 429, 500, 502, 503)
_ATTEMPTS = 4


async def commit_json_file(path: str, payload: dict[str, Any], message: str) -> None:
    token = get_collect_github_token()
    if not token:
        raise CollectionUnavailableError("COLLECT_GITHUB_TOKEN is not configured")
    content = base64.b64encode(json.dumps(payload).encode()).decode()
    url = f"{_API}/repos/{_github_repo()}/contents/{path}"
    async with _commit_lock, httpx.AsyncClient(timeout=30) as client:
        for attempt in range(_ATTEMPTS):
            try:
                resp = await client.put(
                    url,
                    headers=_headers(token),
                    json={"message": message, "content": content, "branch": _github_branch()},
                )
            except httpx.TransportError as exc:
                if attempt == _ATTEMPTS - 1:
                    raise CollectionUnavailableError(f"Could not reach GitHub: {exc}") from exc
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            if resp.status_code in _RETRYABLE:
                if attempt == _ATTEMPTS - 1:
                    raise CollectionUnavailableError(f"GitHub kept refusing the commit (HTTP {resp.status_code})")
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            if resp.status_code in (404, 422):
                raise CollectionUnavailableError(
                    "GitHub rejected the commit — confirm the 'collected-data' branch exists "
                    "and COLLECT_GITHUB_REPO is correct"
                )
            if resp.status_code in (401, 403):
                raise CollectionUnavailableError(
                    "GitHub token rejected — confirm COLLECT_GITHUB_TOKEN is valid and scoped "
                    "to Contents: Read and write on this repo"
                )
            if resp.is_error:
                raise CollectionUnavailableError(f"GitHub rejected the commit (HTTP {resp.status_code})")
            return


async def list_existing_clip_paths() -> list[str]:
    token = get_collect_github_token()
    if not token:
        return []
    url = f"{_API}/repos/{_github_repo()}/git/trees/{_github_branch()}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params={"recursive": "1"}, headers=_headers(token))
        if resp.status_code != 200:
            return []  # fail open — a transient read error on rehydrate shouldn't crash startup
        tree = resp.json()["tree"]
    return [
        item["path"]
        for item in tree
        if item["path"].startswith("ml/data/raw/") and item["path"].endswith(".json")
    ]
