"""Adaptive quiz support beyond generation: PDF text extraction, and
attempt scoring/persistence so results survive a page refresh.

Extraction and scoring are pure functions (no DB) so they're unit-testable
the same way ml/quiz_generation/generator.py is — see tests/test_quiz.py.
submit_attempt/get_history do the DB write/read and mirror
wellbeing_service.py's predict_and_store/get_history pattern.
"""

import io
from datetime import datetime, timezone

from beanie import PydanticObjectId

from app.models.quiz import (
    QuestionBankItem, QuestionBankNoteIn, QuizAttempt, QuizAttemptIn, QuizAttemptOut, QuizHistoryItem,
    QuizMarksItem, QuizQuestionNote, QuizQuestionOut,
)
from app.models.user import User
from app.services.student_service import resolve_student

MAX_PDF_BYTES = 15 * 1024 * 1024  # 15MB — generous for lecture slides, stops abuse
MAX_EXTRACTED_CHARS = 20_000  # keeps the Gemini prompt (and its cost) bounded


def extract_pdf_text(data: bytes) -> tuple[str, int, bool]:
    """Extract text from PDF bytes. Returns (text, num_pages, truncated).

    Raises RuntimeError on a corrupt/unreadable file or one with no
    extractable text (e.g. scanned images), mirroring
    generator.generate_questions's RuntimeError-on-failure contract.
    """
    import pypdf

    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = [p.extract_text() or "" for p in reader.pages]
    except Exception as e:
        raise RuntimeError(f"Could not read PDF: {e}") from e

    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if not text:
        raise RuntimeError("No extractable text found in this PDF (it may be scanned images).")

    truncated = len(text) > MAX_EXTRACTED_CHARS
    return text[:MAX_EXTRACTED_CHARS], len(pages), truncated


def _score_attempt(questions: list[QuizQuestionOut], answers: dict[str, str]) -> tuple[int, int]:
    """(correct_count, total), computed server-side — a client-submitted
    score can't be trusted, so we re-derive it from the same questions the
    student answered."""
    correct = sum(1 for i, q in enumerate(questions) if answers.get(str(i)) == q.correct)
    return correct, len(questions)


async def submit_attempt(payload: QuizAttemptIn, user: User) -> QuizAttemptOut:
    # A student always files their own attempt; staff (teacher) generating
    # on a student's behalf may tag it via student_id, or leave it untagged.
    student = user if user.role == "student" else await resolve_student(user, payload.student_id)

    correct, total = _score_attempt(payload.questions, payload.answers)
    score = round(correct / total * 100, 1) if total else 0.0

    attempt = await QuizAttempt(
        student_id=student.id if student else None,
        student_name=student.full_name if student else None,
        user_id=user.id,
        grade=payload.grade,
        difficulty=payload.difficulty,
        bloom_level=payload.bloom_level,
        risk_label=payload.risk_label,
        performance_level=payload.performance_level,
        questions=[q.model_dump() for q in payload.questions],
        answers=payload.answers,
        correct_count=correct,
        total=total,
        score=score,
    ).insert()

    return QuizAttemptOut(
        id=str(attempt.id),
        score=score,
        correct_count=correct,
        total=total,
        difficulty=attempt.difficulty,
        bloom_level=attempt.bloom_level or "",
        created_at=attempt.created_at,
    )


async def get_history(user: User, limit: int = 10, student_id: str | None = None) -> list[QuizHistoryItem]:
    """Real quiz-attempt history for the logged-in account, most recent
    first. Optionally narrowed to a single student via student_id."""
    if student_id:
        # Defence in depth, same as wellbeing_service.get_history: the
        # user_id filter below already scopes results to what this account
        # created, this just makes the ownership 403 explicit.
        await resolve_student(user, student_id)

    conditions = [QuizAttempt.user_id == user.id]
    if student_id:
        conditions.append(QuizAttempt.student_id == PydanticObjectId(student_id))

    records = await QuizAttempt.find(*conditions).sort(-QuizAttempt.created_at).limit(limit).to_list()
    return [
        QuizHistoryItem(
            id=str(r.id),
            score=r.score or 0.0,
            correct_count=r.correct_count or 0,
            total=r.total or 0,
            difficulty=r.difficulty,
            bloom_level=r.bloom_level or "",
            grade=r.grade or "",
            created_at=r.created_at,
        )
        for r in records
    ]


def _bank_items_from_attempt(
    attempt: QuizAttempt,
    note_by_key: dict[tuple, str],
    *,
    needle: str | None = None,
    correct: bool | None = None,
) -> list[QuestionBankItem]:
    """Flatten one attempt's questions into QuestionBankItems, applying the
    per-question filters (keyword search, correct/incorrect) that can't be
    pushed into the Mongo query. Pure — no DB access — so it's unit-testable
    the same way _score_attempt is."""
    items: list[QuestionBankItem] = []
    for idx, question in enumerate(attempt.questions):
        if needle and needle not in question.get("question", "").lower():
            continue
        chosen = attempt.answers.get(str(idx))
        is_correct = (chosen == question.get("correct")) if chosen is not None else None
        if correct is not None and is_correct is not correct:
            continue
        items.append(
            QuestionBankItem(
                attempt_id=str(attempt.id),
                question_index=idx,
                question=question.get("question", ""),
                options=question.get("options", {}),
                correct=question.get("correct", ""),
                chosen=chosen,
                is_correct=is_correct,
                difficulty=attempt.difficulty,
                bloom_level=attempt.bloom_level or "",
                grade=attempt.grade or "",
                explanation=question.get("explanation", ""),
                created_at=attempt.created_at,
                note=note_by_key.get((attempt.id, idx), ""),
                student_id=str(attempt.student_id) if attempt.student_id else None,
                student_name=attempt.student_name,
            )
        )
    return items


async def get_question_bank(
    user: User,
    *,
    student_id: str | None = None,
    grade: str | None = None,
    difficulty: str | None = None,
    bloom_level: str | None = None,
    correct: bool | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 500,
) -> list[QuestionBankItem]:
    """Every question the account has ever generated/attempted, flattened
    out of quiz_attempts and joined with this account's private notes.

    Scoping:
    - student_id given: that one student's questions, however they were
      generated (self-service, or by a teacher on their behalf). resolve_student
      enforces the caller may actually look at that student (admin/teacher/
      counselor always can; a parent would be rejected — quiz isn't in a
      parent's role set to begin with).
    - no student_id, caller is admin: every student's questions — the "see
      everything" admin view.
    - no student_id, anyone else (teacher/student): just this account's own
      attempts, same as before this parameter existed.

    Filters that live on the attempt (grade, difficulty, bloom_level, date
    range) are pushed into the Mongo query; `correct` and `q` only make
    sense per-question, so those are applied after flattening, in
    _bank_items_from_attempt.
    """
    conditions = []
    if student_id:
        await resolve_student(user, student_id)
        conditions.append(QuizAttempt.student_id == PydanticObjectId(student_id))
    elif user.role != "admin":
        conditions.append(QuizAttempt.user_id == user.id)
    # admin + no student_id: no ownership filter at all — every attempt, from
    # every student.
    if grade:
        conditions.append(QuizAttempt.grade == grade)
    if difficulty:
        conditions.append(QuizAttempt.difficulty == difficulty)
    if bloom_level:
        conditions.append(QuizAttempt.bloom_level == bloom_level)
    if date_from:
        conditions.append(QuizAttempt.created_at >= date_from)
    if date_to:
        conditions.append(QuizAttempt.created_at <= date_to)

    attempts = await QuizAttempt.find(*conditions).sort(-QuizAttempt.created_at).to_list()

    notes = await QuizQuestionNote.find(QuizQuestionNote.user_id == user.id).to_list()
    note_by_key = {(n.attempt_id, n.question_index): n.note for n in notes}

    needle = q.strip().lower() if q else None
    items: list[QuestionBankItem] = []
    for attempt in attempts:
        items.extend(_bank_items_from_attempt(attempt, note_by_key, needle=needle, correct=correct))
        if len(items) >= limit:
            return items[:limit]
    return items


def _marks_from_attempts(attempts: list[QuizAttempt]) -> list[QuizMarksItem]:
    """Group already-fetched attempts by student and roll each group up into
    one QuizMarksItem. Pure — no DB — so it's unit-testable on its own."""
    by_student: dict[PydanticObjectId, list[QuizAttempt]] = {}
    for a in attempts:
        if a.student_id is None:
            continue  # untagged attempts don't belong to any one student
        by_student.setdefault(a.student_id, []).append(a)

    out: list[QuizMarksItem] = []
    for student_id, group in by_student.items():
        scores = [a.score or 0.0 for a in group]
        latest = max(group, key=lambda a: a.created_at)
        out.append(
            QuizMarksItem(
                student_id=str(student_id),
                student_name=latest.student_name or "Unknown student",
                attempt_count=len(group),
                avg_score=round(sum(scores) / len(scores), 1),
                best_score=max(scores),
                latest_score=latest.score or 0.0,
                latest_created_at=latest.created_at,
            )
        )
    return sorted(out, key=lambda m: m.student_name.lower())


async def get_student_marks() -> list[QuizMarksItem]:
    """Every student's quiz marks, aggregated across all attempts by anyone
    (self-service or teacher-run) — the admin "students' marks" overview.
    Admin-only at the route level; this function itself doesn't filter by
    caller since there's no per-account scoping left to apply."""
    attempts = await QuizAttempt.find_all().to_list()
    return _marks_from_attempts(attempts)  # filters out untagged attempts itself


async def save_question_note(user: User, payload: QuestionBankNoteIn) -> str:
    """Upsert a note on one question. For a student/teacher this is their
    own private note, and ownership is enforced by scoping the lookup to the
    attempt's user_id. Admin is exempt from that check — this is what lets
    an admin leave an "instructor note" on a question from any student's
    attempt. Because the note is still keyed by (this caller's user_id,
    attempt_id, question_index), an admin's instructor note is a completely
    separate row from the student's own private note on the same question —
    no schema change needed, they just never collide."""
    try:
        attempt_oid = PydanticObjectId(payload.attempt_id)
    except Exception as e:
        raise ValueError("attempt_id must be a valid quiz attempt id.") from e

    attempt = await QuizAttempt.get(attempt_oid)
    if not attempt or (attempt.user_id != user.id and user.role != "admin"):
        raise ValueError("No quiz attempt with that id for this account.")
    if not (0 <= payload.question_index < len(attempt.questions)):
        raise ValueError("question_index is out of range for this attempt.")

    existing = await QuizQuestionNote.find_one(
        QuizQuestionNote.user_id == user.id,
        QuizQuestionNote.attempt_id == attempt_oid,
        QuizQuestionNote.question_index == payload.question_index,
    )
    if existing:
        existing.note = payload.note
        existing.updated_at = datetime.now(timezone.utc)
        await existing.save()
    else:
        await QuizQuestionNote(
            user_id=user.id, attempt_id=attempt_oid, question_index=payload.question_index, note=payload.note,
        ).insert()
    return payload.note
