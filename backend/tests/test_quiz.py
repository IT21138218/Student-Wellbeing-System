"""Adaptive quiz generation: difficulty/Bloom's mapping + question generation.

Pure-function tests — no DB, no live Gemini call (mocked via monkeypatch),
mirroring the style of test_risk.py / test_student_access.py.
"""

import pytest

from ml.quiz_generation.generator import (
    DIFFICULTY_MAP,
    _to_question_out,
    generate_questions,
    resolve_difficulty,
)


@pytest.mark.parametrize(
    "risk,perf,expected",
    [
        ("HIGH", "Low", ("VERY_EASY", "Remember")),
        ("HIGH", "Mid", ("EASY", "Understand")),
        ("HIGH", "High", ("MEDIUM", "Apply")),
        ("MEDIUM", "Low", ("EASY", "Understand")),
        ("MEDIUM", "Mid", ("MEDIUM", "Apply")),
        ("MEDIUM", "High", ("MEDIUM_HARD", "Analyze")),
        ("LOW", "Low", ("MEDIUM", "Apply")),
        ("LOW", "Mid", ("MEDIUM_HARD", "Analyze")),
        ("LOW", "High", ("HARD", "Evaluate/Create")),
    ],
)
def test_resolve_difficulty_matches_notebook_map(risk, perf, expected):
    assert resolve_difficulty(risk, perf) == expected
    assert DIFFICULTY_MAP[(risk, perf)] == expected


def test_resolve_difficulty_falls_back_to_medium_apply_for_unknown_combo():
    # Defensive default — every real risk/performance pair is in DIFFICULTY_MAP,
    # but resolve_difficulty must not crash on an unexpected value.
    assert resolve_difficulty("HIGH", "Unknown") == ("MEDIUM", "Apply")


def test_generate_questions_returns_demo_set_without_api_key():
    out = generate_questions(
        content="Photosynthesis converts light energy into chemical energy.",
        grade="Grade 10",
        num_questions=3,
        difficulty="MEDIUM",
        bloom_level="Apply",
        api_key="",
    )
    assert len(out) == 3
    for q in out:
        assert set(q["options"]) == {"A", "B", "C", "D"}
        assert q["correct"] in q["options"]


def test_to_question_out_maps_notebook_shape_to_api_contract():
    raw = {
        "question": "What is X?",
        "option_a": "a", "option_b": "b", "option_c": "c", "option_d": "d",
        "correct_answer": "B",
        "explanation": "because b",
    }
    out = _to_question_out(raw)
    assert out == {
        "question": "What is X?",
        "options": {"A": "a", "B": "b", "C": "c", "D": "d"},
        "correct": "B",
        "explanation": "because b",
    }


def test_generate_questions_raises_runtime_error_on_gemini_failure(monkeypatch):
    """A malformed/failed Gemini response must surface as RuntimeError so the
    route can turn it into a 502, not a raw exception leaking to the client."""
    import google.generativeai as genai

    class _BrokenModel:
        def __init__(self, *a, **kw): ...
        def generate_content(self, prompt):
            raise ValueError("boom")

    monkeypatch.setattr(genai, "configure", lambda **kw: None)
    monkeypatch.setattr(genai, "GenerativeModel", lambda *a, **kw: _BrokenModel())

    with pytest.raises(RuntimeError, match="Gemini quiz generation failed"):
        generate_questions(
            content="x" * 100, grade="Grade 10", num_questions=1,
            difficulty="MEDIUM", bloom_level="Apply", api_key="fake-key",
        )
