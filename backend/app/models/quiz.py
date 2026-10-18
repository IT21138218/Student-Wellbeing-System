from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

Difficulty = Literal["VERY_EASY", "EASY", "MEDIUM", "MEDIUM_HARD", "HARD"]


class QuizGenerateIn(BaseModel):
    content: str = Field(..., min_length=80)
    grade: str
    num_questions: int = Field(5, ge=1, le=20)
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]
    performance_level: Literal["Low", "Mid", "High"]
    student_id: str | None = None


class QuizQuestionOut(BaseModel):
    question: str
    options: dict[str, str]
    correct: str
    explanation: str


class QuizGenerateOut(BaseModel):
    difficulty: Difficulty
    bloom_level: str
    questions: list[QuizQuestionOut]


class PDFExtractOut(BaseModel):
    text: str
    num_pages: int
    truncated: bool  # True if the extracted text was cut down to MAX_EXTRACTED_CHARS


class QuizAttemptIn(BaseModel):
    """A completed quiz, submitted for server-side scoring and history."""

    student_id: str | None = None
    grade: str
    difficulty: Difficulty
    bloom_level: str
    risk_label: Literal["LOW", "MEDIUM", "HIGH"]
    performance_level: Literal["Low", "Mid", "High"]
    questions: list[QuizQuestionOut]
    answers: dict[str, str] = {}  # question index (as string) -> chosen option letter


class QuizAttemptOut(BaseModel):
    id: str
    score: float
    correct_count: int
    total: int
    difficulty: Difficulty
    bloom_level: str
    created_at: datetime


class QuizHistoryItem(BaseModel):
    id: str
    score: float
    correct_count: int
    total: int
    difficulty: Difficulty
    bloom_level: str
    grade: str
    created_at: datetime


class QuizAttempt(Document):
    student_id: PydanticObjectId | None = None
    # Denormalized at write time so history stays readable even if the
    # student account is later deleted — same pattern as WellbeingAssessment.
    student_name: str | None = None
    user_id: PydanticObjectId | None = None  # the logged-in account that ran this
    grade: str | None = None
    difficulty: Difficulty
    bloom_level: str | None = None
    risk_label: str | None = None
    performance_level: str | None = None
    questions: list[dict]
    answers: dict[str, str] = {}
    correct_count: int | None = None
    total: int | None = None
    score: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "quiz_attempts"


class QuizQuestionNote(Document):
    """A student's private note on one question from one attempt. Scoped to
    user_id — never joined across accounts, so notes are always private to
    whoever wrote them (per the Question Bank's private-notes decision)."""

    user_id: PydanticObjectId
    attempt_id: PydanticObjectId
    question_index: int
    note: str = ""
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "quiz_question_notes"


class QuestionBankItem(BaseModel):
    """One flattened question, joined with how the student answered it (if
    at all) and any private note — the unit the Question Bank page browses."""

    attempt_id: str
    question_index: int
    question: str
    options: dict[str, str]
    correct: str
    chosen: str | None
    is_correct: bool | None  # None when the question was never answered
    difficulty: Difficulty
    bloom_level: str
    grade: str
    explanation: str
    created_at: datetime
    note: str = ""
    student_id: str | None = None
    student_name: str | None = None  # populated in admin's "every student" view


class QuestionBankNoteIn(BaseModel):
    attempt_id: str
    question_index: int
    note: str = Field("", max_length=4000)


class QuizMarksItem(BaseModel):
    """Per-student aggregate — the admin "students' marks" overview."""

    student_id: str
    student_name: str
    attempt_count: int
    avg_score: float
    best_score: float
    latest_score: float
    latest_created_at: datetime
