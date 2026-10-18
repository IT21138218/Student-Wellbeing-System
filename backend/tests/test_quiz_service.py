"""Adaptive quiz support: PDF text extraction + attempt scoring + the
Question Bank's per-question flattening/filtering.

Pure-function tests — no DB, mirroring the style of test_quiz.py /
test_student_access.py. submit_attempt/get_history/get_question_bank (the
DB-touching halves of quiz_service.py) aren't covered here, same as
wellbeing_service.py's predict_and_store/get_history — this project's tests
don't spin up Mongo. _bank_items_from_attempt is the pure part of
get_question_bank, built via QuizAttempt.model_construct (no DB, same trick
test_student_access.py uses for User) so its filtering logic can still be
tested directly.
"""

import io
from datetime import datetime, timezone

import pytest

from beanie import PydanticObjectId

from app.models.quiz import QuizAttempt, QuizQuestionOut
from app.services.quiz_service import _bank_items_from_attempt, _marks_from_attempts, _score_attempt, extract_pdf_text


def _make_pdf_bytes(text: str) -> bytes:
    """Build a minimal one-page real PDF containing `text`, via pypdf's own
    writer — avoids hand-rolling PDF syntax or shipping a binary fixture."""
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)

    content = DecodedStreamObject()
    content.set_data(f"BT /F1 24 Tf 10 100 Td ({text}) Tj ET".encode())
    content_ref = writer._add_object(content)

    font = DictionaryObject()
    font[NameObject("/Type")] = NameObject("/Font")
    font[NameObject("/Subtype")] = NameObject("/Type1")
    font[NameObject("/BaseFont")] = NameObject("/Helvetica")
    font_ref = writer._add_object(font)

    fontdict = DictionaryObject()
    fontdict[NameObject("/F1")] = font_ref
    resources = DictionaryObject()
    resources[NameObject("/Font")] = fontdict
    page[NameObject("/Resources")] = resources
    page[NameObject("/Contents")] = content_ref

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_extract_pdf_text_reads_real_text():
    data = _make_pdf_bytes("Hello World")
    text, num_pages, truncated = extract_pdf_text(data)
    assert "Hello World" in text
    assert num_pages == 1
    assert truncated is False


def test_extract_pdf_text_raises_runtime_error_on_corrupt_file():
    with pytest.raises(RuntimeError, match="Could not read PDF"):
        extract_pdf_text(b"not a pdf at all")


def test_extract_pdf_text_raises_runtime_error_when_no_text_found():
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)  # no content stream at all
    buf = io.BytesIO()
    writer.write(buf)

    with pytest.raises(RuntimeError, match="No extractable text"):
        extract_pdf_text(buf.getvalue())


def test_extract_pdf_text_truncates_past_max_chars():
    data = _make_pdf_bytes("x" * 50)
    text, _, truncated = extract_pdf_text(data)
    # The fixture text itself is short — force the truncation branch by
    # shrinking the cap for this assertion instead of generating 20k chars.
    import app.services.quiz_service as svc

    original_max = svc.MAX_EXTRACTED_CHARS
    svc.MAX_EXTRACTED_CHARS = 5
    try:
        text2, _, truncated2 = svc.extract_pdf_text(data)
        assert len(text2) == 5
        assert truncated2 is True
    finally:
        svc.MAX_EXTRACTED_CHARS = original_max


def _q(correct: str) -> QuizQuestionOut:
    return QuizQuestionOut(
        question="Q?", options={"A": "a", "B": "b", "C": "c", "D": "d"}, correct=correct, explanation="",
    )


def test_score_attempt_counts_only_matching_answers():
    questions = [_q("A"), _q("B"), _q("C")]
    answers = {"0": "A", "1": "A", "2": "C"}  # 2 of 3 correct
    correct, total = _score_attempt(questions, answers)
    assert (correct, total) == (2, 3)


def test_score_attempt_treats_unanswered_as_wrong():
    questions = [_q("A"), _q("B")]
    correct, total = _score_attempt(questions, {"0": "A"})  # index 1 never answered
    assert (correct, total) == (1, 2)


def test_score_attempt_empty_questions_is_zero_of_zero():
    assert _score_attempt([], {}) == (0, 0)


def _make_attempt(questions, answers, **overrides) -> QuizAttempt:
    # model_construct skips validation and Beanie/DB init — same trick
    # test_student_access.py uses for User.
    defaults = dict(
        difficulty="MEDIUM", bloom_level="Apply", grade="Grade 10",
        created_at=datetime.now(timezone.utc), questions=questions, answers=answers,
    )
    defaults.update(overrides)
    return QuizAttempt.model_construct(**defaults)


def test_bank_items_flags_correct_and_incorrect_and_unattempted():
    questions = [
        {"question": "Q1", "options": {"A": "a", "B": "b"}, "correct": "A", "explanation": ""},
        {"question": "Q2", "options": {"A": "a", "B": "b"}, "correct": "B", "explanation": ""},
        {"question": "Q3", "options": {"A": "a", "B": "b"}, "correct": "A", "explanation": ""},
    ]
    attempt = _make_attempt(questions, {"0": "A", "1": "A"})  # 2 answered, 1 skipped
    items = _bank_items_from_attempt(attempt, {})
    assert [i.is_correct for i in items] == [True, False, None]


def test_bank_items_keyword_filter_is_case_insensitive():
    questions = [
        {"question": "Photosynthesis basics", "options": {"A": "a", "B": "b"}, "correct": "A", "explanation": ""},
        {"question": "Cell division", "options": {"A": "a", "B": "b"}, "correct": "A", "explanation": ""},
    ]
    attempt = _make_attempt(questions, {})
    items = _bank_items_from_attempt(attempt, {}, needle="photo")
    assert len(items) == 1 and items[0].question == "Photosynthesis basics"


def test_bank_items_correct_filter_keeps_only_matching_and_drops_unattempted():
    questions = [
        {"question": "Q1", "options": {"A": "a"}, "correct": "A", "explanation": ""},
        {"question": "Q2", "options": {"A": "a"}, "correct": "A", "explanation": ""},
        {"question": "Q3", "options": {"A": "a"}, "correct": "A", "explanation": ""},
    ]
    attempt = _make_attempt(questions, {"0": "A", "1": "B"})  # correct, wrong, unattempted

    only_correct = _bank_items_from_attempt(attempt, {}, correct=True)
    assert [i.question for i in only_correct] == ["Q1"]

    only_incorrect = _bank_items_from_attempt(attempt, {}, correct=False)
    assert [i.question for i in only_incorrect] == ["Q2"]


def test_bank_items_joins_private_notes_by_attempt_and_index():
    questions = [{"question": "Q1", "options": {"A": "a"}, "correct": "A", "explanation": ""}]
    attempt = _make_attempt(questions, {})
    note_by_key = {(attempt.id, 0): "remember the mnemonic"}
    items = _bank_items_from_attempt(attempt, note_by_key)
    assert items[0].note == "remember the mnemonic"


def test_bank_items_carries_student_identity_for_the_admin_view():
    questions = [{"question": "Q1", "options": {"A": "a"}, "correct": "A", "explanation": ""}]
    sid = PydanticObjectId()
    attempt = _make_attempt(questions, {}, student_id=sid, student_name="Jane Doe")
    items = _bank_items_from_attempt(attempt, {})
    assert items[0].student_id == str(sid)
    assert items[0].student_name == "Jane Doe"


def test_marks_from_attempts_aggregates_per_student():
    sid = PydanticObjectId()
    now = datetime.now(timezone.utc)
    earlier = _make_attempt([], {}, student_id=sid, student_name="Jane Doe", score=60.0,
                             created_at=now.replace(year=now.year - 1))
    later = _make_attempt([], {}, student_id=sid, student_name="Jane Doe", score=80.0, created_at=now)

    marks = _marks_from_attempts([earlier, later])
    assert len(marks) == 1
    m = marks[0]
    assert m.student_id == str(sid)
    assert m.attempt_count == 2
    assert m.avg_score == 70.0
    assert m.best_score == 80.0
    assert m.latest_score == 80.0  # the more recent attempt, not insertion order


def test_marks_from_attempts_skips_untagged_attempts():
    untagged = _make_attempt([], {}, student_id=None, score=50.0)
    assert _marks_from_attempts([untagged]) == []


def test_marks_from_attempts_sorts_by_student_name():
    zed = _make_attempt([], {}, student_id=PydanticObjectId(), student_name="Zed", score=90.0)
    amy = _make_attempt([], {}, student_id=PydanticObjectId(), student_name="Amy", score=90.0)
    marks = _marks_from_attempts([zed, amy])
    assert [m.student_name for m in marks] == ["Amy", "Zed"]
