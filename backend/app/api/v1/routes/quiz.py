from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import require_roles
from app.core.config import get_settings
from app.models.quiz import (
    PDFExtractOut, QuestionBankItem, QuestionBankNoteIn, QuizAttemptIn, QuizAttemptOut, QuizGenerateIn,
    QuizGenerateOut, QuizHistoryItem, QuizMarksItem,
)
from app.models.user import User
from app.services.quiz_service import (
    MAX_PDF_BYTES, extract_pdf_text, get_history, get_question_bank, get_student_marks, save_question_note,
    submit_attempt,
)
from ml.quiz_generation.generator import generate_questions, resolve_difficulty

router = APIRouter(prefix="/quiz", tags=["quiz"])

# Admin: full access always. Teacher: full access, own subject. Student:
# full access (they're the one taking the quiz). Counselor and Parent:
# no access — this module isn't part of their workflow.
_ALLOWED = require_roles("teacher", "student")
# No args => only admin passes (see deps.require_roles) — same pattern as
# students.py's _ADMIN_ONLY.
_ADMIN_ONLY = require_roles()


@router.post("/generate", response_model=QuizGenerateOut, dependencies=[Depends(_ALLOWED)])
async def generate_quiz(payload: QuizGenerateIn) -> QuizGenerateOut:
    settings = get_settings()
    difficulty, bloom = resolve_difficulty(payload.risk_label, payload.performance_level)
    try:
        questions = generate_questions(
            content=payload.content,
            grade=payload.grade,
            num_questions=payload.num_questions,
            difficulty=difficulty,
            bloom_level=bloom,
            api_key=settings.gemini_api_key,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return QuizGenerateOut(difficulty=difficulty, bloom_level=bloom, questions=questions)


@router.post("/extract-pdf", response_model=PDFExtractOut, dependencies=[Depends(_ALLOWED)])
async def extract_pdf(file: UploadFile = File(...)) -> PDFExtractOut:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are supported.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is too large (max 15MB).")
    try:
        text, num_pages, truncated = extract_pdf_text(data)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return PDFExtractOut(text=text, num_pages=num_pages, truncated=truncated)


@router.post("/attempt", response_model=QuizAttemptOut)
async def save_attempt(payload: QuizAttemptIn, user: User = Depends(_ALLOWED)) -> QuizAttemptOut:
    return await submit_attempt(payload, user)


@router.get("/history", response_model=list[QuizHistoryItem])
async def quiz_history(user: User = Depends(_ALLOWED), student_id: str | None = None) -> list[QuizHistoryItem]:
    return await get_history(user, student_id=student_id)


@router.get("/bank", response_model=list[QuestionBankItem])
async def question_bank(
    user: User = Depends(_ALLOWED),
    student_id: str | None = None,
    grade: str | None = None,
    difficulty: str | None = None,
    bloom_level: str | None = None,
    correct: bool | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[QuestionBankItem]:
    """Defaults to the caller's own questions. An admin passing no student_id
    sees every student's questions; anyone (admin included) may pass
    student_id to drill into one student specifically."""
    return await get_question_bank(
        user, student_id=student_id, grade=grade, difficulty=difficulty, bloom_level=bloom_level,
        correct=correct, q=q, date_from=date_from, date_to=date_to,
    )


@router.get("/marks", response_model=list[QuizMarksItem], dependencies=[Depends(_ADMIN_ONLY)])
async def student_marks() -> list[QuizMarksItem]:
    """Every student's aggregated quiz marks — admin only."""
    return await get_student_marks()


@router.put("/bank/note")
async def question_bank_note(payload: QuestionBankNoteIn, user: User = Depends(_ALLOWED)) -> dict:
    try:
        note = await save_question_note(user, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"note": note}
