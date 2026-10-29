"""Server-side grading for every question type.

Option answers may be stored or submitted either as the option text or as its
index ("0", "1", ...): builder and AI drafts store text, older papers store indexes.
Text is what the exam client sends, so option shuffling can't change the result.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field

from backend.models.paper import Paper, Question

OPTION_TYPES = {"mcq-single", "mcq-multi", "true-false"}
MANUAL_TYPES = {"long-answer", "code"}


@dataclass
class QuestionResult:
    question_id: str
    awarded: float | None  # None = waiting for the host to grade it
    max_marks: float
    status: str  # correct | wrong | blank | pending | graded


@dataclass
class GradeResult:
    marks: float
    max_marks: float
    correct: int
    pending_manual: int
    questions: list[QuestionResult] = field(default_factory=list)

    @property
    def percent(self) -> float:
        return round(max(0.0, self.marks) / self.max_marks * 100, 2) if self.max_marks > 0 else 0.0


def _norm(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _option_indexes(q: Question, raw: str, multi: bool) -> frozenset[int] | None:
    options = q.options or []
    by_text = {_norm(o): i for i, o in enumerate(options)}
    parts = [p for p in (raw.split(",") if multi else [raw]) if p.strip()]
    if multi and len(parts) > 1 and _norm(raw) in by_text:
        parts = [raw]  # a single option whose text itself contains a comma
    picked: set[int] = set()
    for part in parts:
        key = _norm(part)
        if key in by_text:
            picked.add(by_text[key])
        elif key.isdigit() and int(key) < len(options):
            picked.add(int(key))
        else:
            return None
    return frozenset(picked)


def _is_correct(q: Question, answer: str) -> bool | None:
    """True/False for auto-gradable answers, None when a human has to decide."""
    expected = q.correct_answer
    if q.type in MANUAL_TYPES:
        return None
    if expected is None or not expected.strip():
        return None
    if q.type in OPTION_TYPES:
        multi = q.type == "mcq-multi"
        got, want = _option_indexes(q, answer, multi), _option_indexes(q, expected, multi)
        return got is not None and got == want
    if q.type == "numerical":
        try:
            a, b = float(answer.strip()), float(expected.strip())
        except ValueError:
            return False
        return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-9)
    return _norm(answer) == _norm(expected)  # short-answer with a reference answer


def grade(paper: Paper, answers: Mapping[str, str | None], manual_marks: Mapping[str, float]) -> GradeResult:
    result = GradeResult(marks=0.0, max_marks=0.0, correct=0, pending_manual=0)
    for q in paper.questions:
        result.max_marks += q.marks
        answer = answers.get(q.id)
        if answer is None or not answer.strip():
            qr = QuestionResult(q.id, 0.0, q.marks, "blank")
        elif q.id in manual_marks:
            awarded = max(0.0, min(q.marks, manual_marks[q.id]))
            qr = QuestionResult(q.id, awarded, q.marks, "graded")
        else:
            ok = _is_correct(q, answer)
            if ok is None:
                qr = QuestionResult(q.id, None, q.marks, "pending")
                result.pending_manual += 1
            elif ok:
                qr = QuestionResult(q.id, q.marks, q.marks, "correct")
                result.correct += 1
            else:
                qr = QuestionResult(q.id, -abs(q.negative_marks), q.marks, "wrong")
        if qr.awarded is not None:
            result.marks += qr.awarded
        result.questions.append(qr)
    result.marks = round(result.marks, 2)
    return result
