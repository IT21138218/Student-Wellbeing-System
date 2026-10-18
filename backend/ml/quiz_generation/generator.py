"""Adaptive quiz generation — REAL pipeline.

Ported from Member 1's own notebook:
`Member 1/Adaptive_Quiz/Model Files/Adaptive_Question_Difficulty_with_LLM.ipynb`
(Sections 4 and 5) — same difficulty/Bloom's mapping, same Gemini 2.5 Flash
prompt, verbatim. Uses Google's Gemini API to generate questions strictly
from the lecture content passed in, not general knowledge.

Falls back to a small set of demo questions when GEMINI_API_KEY isn't
configured, so the endpoint still works (with a warning) in environments
that haven't set up an API key yet.
"""

import json
import re
import time
from typing import Literal

Difficulty = Literal["VERY_EASY", "EASY", "MEDIUM", "MEDIUM_HARD", "HARD"]

# risk x performance -> (difficulty, bloom level) — verbatim from the notebook's
# Section 4 `difficulty_map` / `blooms_map`.
DIFFICULTY_MAP: dict[tuple[str, str], tuple[Difficulty, str]] = {
    ("HIGH", "Low"): ("VERY_EASY", "Remember"),
    ("HIGH", "Mid"): ("EASY", "Understand"),
    ("HIGH", "High"): ("MEDIUM", "Apply"),
    ("MEDIUM", "Low"): ("EASY", "Understand"),
    ("MEDIUM", "Mid"): ("MEDIUM", "Apply"),
    ("MEDIUM", "High"): ("MEDIUM_HARD", "Analyze"),
    ("LOW", "Low"): ("MEDIUM", "Apply"),
    ("LOW", "Mid"): ("MEDIUM_HARD", "Analyze"),
    ("LOW", "High"): ("HARD", "Evaluate/Create"),
}

_DEMO_QUESTIONS = [
    {
        "question": "Based on the provided content, which statement best reflects the material?",
        "options": {"A": "Sample option A", "B": "Sample option B", "C": "Sample option C", "D": "Sample option D"},
        "correct": "A",
        "explanation": "Demo mode (no GEMINI_API_KEY configured) — configure it in backend/.env to generate real questions from your lecture content.",
    }
]


def resolve_difficulty(risk_label: str, performance_level: str) -> tuple[Difficulty, str]:
    return DIFFICULTY_MAP.get((risk_label, performance_level), ("MEDIUM", "Apply"))


def _build_prompt(content: str, grade: str, difficulty: str, bloom_level: str, n: int) -> str:
    # Verbatim from the notebook's generate_quiz_gemini().
    return f"""You are an educational quiz generator for Sri Lankan school students.

LECTURE CONTENT:
{content}

STUDENT CONTEXT:
- Grade: {grade}
- Difficulty Level: {difficulty}
- Bloom's Taxonomy Target: {bloom_level}

TASK:
Generate exactly {n} multiple-choice questions STRICTLY based on the lecture content above.
Each question must:
- Be derived from the lecture material (not general knowledge)
- Match the {bloom_level} level of Bloom's taxonomy
- Be appropriate for Grade {grade} students in Sri Lanka
- Include 4 options (A, B, C, D) with exactly one correct answer
- Include a brief explanation referencing the lecture content

OUTPUT FORMAT: Return ONLY a valid JSON array. No markdown, no extra text.
[
  {{
    "question": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_answer": "A/B/C/D",
    "explanation": "...",
    "bloom_level": "{bloom_level}"
  }}
]"""


def _to_question_out(q: dict) -> dict:
    """Notebook's Gemini output uses option_a/b/c/d + correct_answer; the
    API contract (QuizQuestionOut) uses options{A..D} + correct."""
    return {
        "question": q["question"],
        "options": {"A": q["option_a"], "B": q["option_b"], "C": q["option_c"], "D": q["option_d"]},
        "correct": q["correct_answer"],
        "explanation": q.get("explanation", ""),
    }


def generate_questions(
    content: str, grade: str, num_questions: int, difficulty: Difficulty, bloom_level: str, api_key: str,
) -> list[dict]:
    if not api_key:
        return _DEMO_QUESTIONS * num_questions

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = _build_prompt(content, grade, difficulty, bloom_level, num_questions)

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*", "", text)
        raw_questions = json.loads(text)
        return [_to_question_out(q) for q in raw_questions]
    except Exception as e:  # Gemini call failed or returned malformed JSON
        raise RuntimeError(f"Gemini quiz generation failed: {e}") from e
    finally:
        time.sleep(0)  # placeholder for rate-limit pacing if generating for multiple students in a loop
