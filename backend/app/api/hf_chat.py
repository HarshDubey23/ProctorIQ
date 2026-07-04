from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core.config import get_settings

router = APIRouter(prefix="/hf", tags=["huggingface"])

_API = "https://router.huggingface.co/v1/chat/completions"


class ChatMessage(BaseModel):
    role: str = Field(description="user or assistant")
    content: str = Field(description="message content")


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    system_prompt: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2048


class ChatResponse(BaseModel):
    reply: str
    model_used: str
    usage: dict[str, int] | None = None


@router.post("/chat", response_model=ChatResponse)
async def hf_chat(body: ChatRequest) -> ChatResponse:
    settings = get_settings()
    if not settings.hf_api_token:
        raise HTTPException(503, "HF_API_TOKEN not configured on this server")

    system = body.system_prompt or "You are a helpful exam assistant."
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages]

    payload = {
        "model": settings.hf_model_id,
        "messages": messages,
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
    }
    headers = {"Authorization": f"Bearer {settings.hf_api_token}"}

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(_API, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            usage = data.get("usage")
            return ChatResponse(reply=reply, model_used=settings.hf_model_id, usage=usage)
        except httpx.HTTPStatusError as exc:
            detail = f"Hugging Face API error: {exc.response.status_code}"
            try:
                detail += f" - {exc.response.text[:500]}"
            except Exception:
                pass
            raise HTTPException(502, detail) from exc
        except (httpx.TimeoutException, KeyError, json.JSONDecodeError) as exc:
            raise HTTPException(502, f"Hugging Face request failed: {exc}") from exc


class GenerateQuestionSetRequest(BaseModel):
    subject: str
    topic: str = ""
    difficulty: str = "medium"
    count: int = 5
    types: list[str] = ["mcq-single"]
    instructions: str = ""


@router.post("/generate-questions")
async def hf_generate_questions(body: GenerateQuestionSetRequest) -> dict[str, Any]:
    settings = get_settings()
    if not settings.hf_api_token:
        raise HTTPException(503, "HF_API_TOKEN not configured on this server")

    types_list = ", ".join(body.types)
    system = (
        "You are an exam question generator. You output ONLY valid JSON, "
        "no markdown fences, no commentary."
    )
    user_prompt = f"""Generate exactly {body.count} exam questions.

Subject: {body.subject}
Topic focus: {body.topic or "general, appropriate to the subject"}
Difficulty: {body.difficulty}
Allowed question types: {types_list}
Extra instructions: {body.instructions or "none"}

Return a single JSON object of the exact shape:
{{"questions": [
  {{
    "id": "q1",
    "type": "<one of: mcq-single, mcq-multi, true-false, short-answer, long-answer, numerical, code>",
    "title": "<short title>",
    "body": "<the actual question text>",
    "marks": <number>,
    "negative_marks": <number, 0 if none>,
    "topic": "<subtopic>",
    "difficulty": "<easy|medium|hard>",
    "options": [<array of strings for mcq/true-false>, or null],
    "correct_answer": "<correct answer text or null>"
  }}
]}}

- For true-false, options must be exactly ["True", "False"].
- Output ONLY the JSON object. No prose before or after it."""

    payload = {
        "model": settings.hf_model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 400 * body.count,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.hf_api_token}"}

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=120) as client:
        for _ in range(3):
            try:
                resp = await client.post(_API, headers=headers, json=payload)
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                text = content.strip()
                fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
                if fence:
                    text = fence.group(1)
                parsed = json.loads(text)
                raw_questions = parsed.get("questions", [])
                questions = []
                for i, q in enumerate(raw_questions):
                    if isinstance(q, dict):
                        q.setdefault("id", f"gen_{i}")
                        questions.append(q)
                if questions:
                    return {"questions": questions, "generated": len(questions), "requested": body.count, "model_used": settings.hf_model_id}
                last_error = Exception("Model returned no valid questions")
            except (httpx.HTTPStatusError, httpx.TimeoutException, json.JSONDecodeError, KeyError) as exc:
                last_error = exc
        raise HTTPException(502, f"Generation failed after 3 attempts: {last_error}")
