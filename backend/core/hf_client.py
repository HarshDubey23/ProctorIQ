from __future__ import annotations

import json
import re
from typing import Any

import httpx
from pydantic import ValidationError

from backend.core.config import get_settings
from backend.models.paper import (
    PaperGenerationChatAskResponse,
    PaperGenerationChatGenerateResponse,
    PaperGenerationChatRequest,
    PaperGenerationChatResponse,
    PaperGenerationRequest,
    Question,
)

_API = "https://router.huggingface.co/v1/chat/completions"


class HFNotConfiguredError(Exception):
    pass


class HFGenerationError(Exception):
    pass


def _build_prompt(req: PaperGenerationRequest) -> tuple[str, str]:
    types_list = ", ".join(req.question_types)
    system = (
        "You are an exam question generator. You output ONLY valid JSON, "
        "no markdown fences, no commentary. You always follow the exact schema given."
    )
    user = f"""Generate exactly {req.question_count} exam questions.

Subject: {req.subject}
Topic focus: {req.topic or "general, appropriate to the subject"}
Difficulty: {req.difficulty}
Allowed question types (use a mix of these, roughly evenly): {types_list}
Extra instructions from the host: {req.instructions or "none"}

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
    "options": [<array of strings, ONLY for mcq-single, mcq-multi, true-false>, or null for other types],
    "correct_answer": "<for mcq-single/true-false: exact text of the correct option>, <for mcq-multi: comma-separated exact option texts>, <for numerical: the numeric answer as a string>, <for short-answer/long-answer/code: a brief model answer for the host's reference, or null>"
  }}
]}}

Rules:
- For true-false questions, options must be exactly ["True", "False"].
- correct_answer for mcq-single/mcq-multi/true-false MUST exactly match one (or more, comma-separated) of the strings in options.
- Do not repeat the same question twice.
- Output ONLY the JSON object above. No prose before or after it."""
    return system, user


def _extract_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    loaded = json.loads(text)
    if not isinstance(loaded, dict):
        raise json.JSONDecodeError("Expected JSON object", text, 0)
    return loaded


async def _post_chat_completion(
    *,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float = 0.7,
    force_json: bool = True,
) -> tuple[dict[str, Any], str]:
    settings = get_settings()
    if not settings.hf_api_token:
        raise HFNotConfiguredError("HF_API_TOKEN is not configured on this server")

    body: dict[str, Any] = {
        "model": settings.hf_model_id,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if force_json:
        body["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {settings.hf_api_token}"}
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(3):
            try:
                resp = await client.post(_API, headers=headers, json=body)
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                return _extract_json(content), settings.hf_model_id
            except (httpx.HTTPStatusError, httpx.TimeoutException, json.JSONDecodeError, KeyError) as exc:
                last_error = exc
    raise HFGenerationError(f"Generation failed after 3 attempts: {last_error}")


def _parse_questions(raw_questions: Any) -> list[Question]:
    questions: list[Question] = []
    if not isinstance(raw_questions, list):
        return questions
    for i, question in enumerate(raw_questions):
        if isinstance(question, dict):
            question.setdefault("id", f"gen_{i}")
            try:
                questions.append(Question(**question))
            except ValidationError:
                continue
    return questions


async def generate_questions(req: PaperGenerationRequest) -> tuple[list[Question], str]:
    system, user = _build_prompt(req)
    parsed, model_used = await _post_chat_completion(
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=400 * req.question_count,
    )
    questions = _parse_questions(parsed.get("questions", []))
    if not questions:
        raise HFGenerationError("Model returned no valid questions")
    return questions, model_used


def _build_chat_system_prompt(user_turn_count: int, has_context: bool) -> str:
    cap_instruction = (
        "The conversation has reached the clarifying-question cap. You MUST generate now "
        "using sensible defaults and explain assumptions."
        if user_turn_count >= 3
        else "Ask at most one short clarifying question only when subject is missing or impossible to infer."
    )
    context_instruction = (
        "The host may be refining an existing draft; respect the provided paper_context summary."
        if has_context
        else "No saved draft context was provided."
    )
    return f"""You are an exam paper generation assistant.
Output ONLY valid JSON. No markdown fences, no prose outside JSON.
Return exactly one of these shapes:
{{"action":"ask","message":"<one short clarifying question>"}}
{{"action":"generate","questions":[<Question objects>],"assumptions":"<short note on any defaults you guessed>"}}

Minimum required information before generation: subject. If the subject can be inferred from the conversation, generate.
Allowed question types: mcq-single, mcq-multi, true-false, short-answer, long-answer, numerical, code.
Every generated question must include id, type, title, body, marks, negative_marks, topic, difficulty, options, and correct_answer.
For true-false, options must be exactly ["True", "False"].
For option-based questions, correct_answer must exactly match one or more options.
{cap_instruction}
{context_instruction}"""


async def generate_questions_chat(req: PaperGenerationChatRequest) -> PaperGenerationChatResponse:
    user_turn_count = sum(1 for message in req.conversation if message.role == "user")
    system = _build_chat_system_prompt(user_turn_count, bool(req.paper_context))
    context = ""
    if req.paper_context:
        context = "Existing paper_context titles: " + "; ".join(
            question.title for question in req.paper_context[:20]
        )

    messages = [{"role": "system", "content": system}]
    if context:
        messages.append({"role": "user", "content": context})
    messages.extend(
        {"role": message.role, "content": message.content}
        for message in req.conversation
    )
    if user_turn_count >= 3:
        messages.append(
            {
                "role": "user",
                "content": "Generate now. Do not ask another clarifying question.",
            }
        )

    parsed, model_used = await _post_chat_completion(
        messages=messages,
        max_tokens=4096,
    )
    action = parsed.get("action")
    if action == "ask":
        if user_turn_count >= 3:
            raise HFGenerationError("Model asked after the clarifying-question cap")
        message = parsed.get("message")
        if not isinstance(message, str) or not message.strip():
            raise HFGenerationError("Model returned an invalid ask response")
        return PaperGenerationChatAskResponse(
            action="ask",
            message=message.strip(),
            model_used=model_used,
        )
    if action == "generate":
        questions = _parse_questions(parsed.get("questions", []))
        if not questions:
            raise HFGenerationError("Model returned no valid questions")
        assumptions = parsed.get("assumptions", "")
        return PaperGenerationChatGenerateResponse(
            action="generate",
            questions=questions,
            assumptions=assumptions if isinstance(assumptions, str) else "",
            model_used=model_used,
        )
    raise HFGenerationError("Model returned an unsupported chat action")
