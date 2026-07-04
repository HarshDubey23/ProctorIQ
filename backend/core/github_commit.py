from __future__ import annotations

import base64
import json
import os
from typing import Any

import httpx

GITHUB_TOKEN = os.environ.get("COLLECT_GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("COLLECT_GITHUB_REPO", "")
GITHUB_BRANCH = os.environ.get("COLLECT_GITHUB_BRANCH", "collected-data")
_API = "https://api.github.com"
_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}


async def commit_json_file(path: str, payload: dict[str, Any], message: str) -> None:
    if not GITHUB_TOKEN:
        return
    content = base64.b64encode(json.dumps(payload).encode()).decode()
    url = f"{_API}/repos/{GITHUB_REPO}/contents/{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(2):
            resp = await client.put(
                url,
                headers=_HEADERS,
                json={"message": message, "content": content, "branch": GITHUB_BRANCH},
            )
            if resp.status_code in (429, 500, 502, 503) and attempt == 0:
                import asyncio
                await asyncio.sleep(1)
                continue
            resp.raise_for_status()
            return


async def list_existing_clip_paths() -> list[str]:
    if not GITHUB_TOKEN:
        return []
    url = f"{_API}/repos/{GITHUB_REPO}/git/trees/{GITHUB_BRANCH}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params={"recursive": "1"}, headers=_HEADERS)
        resp.raise_for_status()
        tree = resp.json()["tree"]
    return [
        item["path"]
        for item in tree
        if item["path"].startswith("ml/data/raw/") and item["path"].endswith(".json")
    ]
