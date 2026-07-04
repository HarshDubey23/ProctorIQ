from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

QuestionType = Literal["mcq-single","mcq-multi","true-false","short-answer","long-answer","numerical","code"]

class Question(BaseModel):
    id: str
    type: QuestionType
    title: str
    body: str
    marks: float = 1.0
    negative_marks: float = 0.0
    topic: str = "General"
    difficulty: Literal["easy","medium","hard"] = "medium"
    options: list[str] | None = None
    correct_answer: str | None = None

class PaperSection(BaseModel):
    id: str
    title: str
    question_ids: list[str]

class Paper(BaseModel):
    id: str
    host_token: str
    title: str
    subject: str = ""
    instructions: str = ""
    duration_minutes: int = 60
    shuffle_questions: bool = False
    shuffle_options: bool = False
    questions: list[Question]
    sections: list[PaperSection] = Field(default_factory=list)

class PublicQuestion(BaseModel):
    id: str
    type: QuestionType
    title: str
    body: str
    marks: float
    options: list[str] | None = None

class PublicPaper(BaseModel):
    id: str
    title: str
    subject: str
    instructions: str
    duration_minutes: int
    questions: list[PublicQuestion]

def to_public(paper: Paper) -> PublicPaper:
    return PublicPaper(
        id=paper.id, title=paper.title, subject=paper.subject,
        instructions=paper.instructions, duration_minutes=paper.duration_minutes,
        questions=[PublicQuestion(id=q.id, type=q.type, title=q.title, body=q.body,
                                  marks=q.marks, options=q.options) for q in paper.questions],
    )
