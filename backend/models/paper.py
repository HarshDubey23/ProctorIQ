from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

QuestionType = Literal["mcq-single","mcq-multi","true-false","short-answer","long-answer","numerical","code"]


def default_generation_question_types() -> list[QuestionType]:
    return ["mcq-single"]

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
    host_id: str = ""
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


class PaperGenerationRequest(BaseModel):
    subject: str
    topic: str = ""
    instructions: str = ""
    question_count: int = Field(default=5, ge=1, le=20)
    question_types: list[QuestionType] = Field(default_factory=default_generation_question_types)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "medium"


class PaperGenerationResponse(BaseModel):
    questions: list[Question]
    requested: int
    generated: int
    model_used: str


class PaperGenerationChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class PaperGenerationChatRequest(BaseModel):
    conversation: list[PaperGenerationChatMessage] = Field(min_length=1, max_length=20)
    paper_context: list[Question] = Field(default_factory=list)


class PaperGenerationChatAskResponse(BaseModel):
    action: Literal["ask"]
    message: str
    model_used: str


class PaperGenerationChatGenerateResponse(BaseModel):
    action: Literal["generate"]
    questions: list[Question]
    assumptions: str = ""
    model_used: str


PaperGenerationChatResponse = PaperGenerationChatAskResponse | PaperGenerationChatGenerateResponse


class ReviewQuestion(BaseModel):
    id: str
    body: str
    correct_answer: str | None
    student_answer: str | None


class PaperReviewResponse(BaseModel):
    questions: list[ReviewQuestion]

def to_public(paper: Paper) -> PublicPaper:
    return PublicPaper(
        id=paper.id, title=paper.title, subject=paper.subject,
        instructions=paper.instructions, duration_minutes=paper.duration_minutes,
        questions=[PublicQuestion(id=q.id, type=q.type, title=q.title, body=q.body,
                                  marks=q.marks, options=q.options) for q in paper.questions],
    )
