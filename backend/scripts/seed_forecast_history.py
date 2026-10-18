"""Seed multi-week WellbeingAssessment history for real student accounts.

Wellbeing Forecasting needs at least 3 check-ins per student before it can
run on real data (see ml/wellbeing_forecasting/real_features.py). A fresh
install has none, so this generates a believable history per registered
student to make the real-student path testable end to end.

Rows are tagged `source="seeded"` so they stay distinguishable from genuine
check-ins and can be excluded from real-cohort aggregates later.

Run from the backend/ directory:

    .venv/Scripts/python.exe scripts/seed_forecast_history.py
    .venv/Scripts/python.exe scripts/seed_forecast_history.py --dry-run
    .venv/Scripts/python.exe scripts/seed_forecast_history.py --weeks 8
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.wellbeing import WellbeingAssessment  # noqa: E402

DEFAULT_WEEKS = 5  # 3 clears eligibility, +2 so both sides of the threshold stay testable

# Four trend shapes, cycled across students. Each returns a 0-1 "wellbeing
# position" for week i of n, and every correlated field below is derived
# FROM that position — so stress/attendance/exam always move consistently
# with the wellbeing trend rather than being independent noise.
SHAPES = {
    "improving": lambda i, n: 0.30 + 0.50 * (i / max(n - 1, 1)),
    "declining": lambda i, n: 0.80 - 0.50 * (i / max(n - 1, 1)),
    "stable":    lambda i, n: 0.55 + (0.03 if i % 2 else -0.03),      # small realistic noise, no direction
    "volatile":  lambda i, n: [0.35, 0.70, 0.40, 0.75, 0.45, 0.72, 0.42, 0.68][i % 8],  # up-down-up
}
SHAPE_NAMES = list(SHAPES)


def _risk_label(score: float) -> str:
    """Same LOW/MEDIUM/HIGH banding the Wellbeing Indicator applies."""
    if score >= 70:
        return "LOW"
    if score >= 45:
        return "MEDIUM"
    return "HIGH"


def build_checkin(position: float) -> tuple[dict, float]:
    """One check-in's 22 raw features + composite score, all derived from a
    single 0-1 wellbeing position so correlated fields stay coherent:
    higher wellbeing -> lower stress/anxiety/fatigue, higher
    attendance/exam/motivation/sleep."""
    p = max(0.0, min(1.0, position))
    inv = 1.0 - p

    composite = round(30.0 + 55.0 * p, 1)          # ~30-85
    features = {
        "grade": 10,
        "week": 1,                                  # per-check-in form value; forecasting overrides with sequence
        "avg_exam_score": round(45.0 + 40.0 * p, 1),
        "study_hours": round(1.5 + 3.0 * p, 1),
        "homework_completion_rate": round(0.45 + 0.50 * p, 2),
        "attendance_rate": round(70.0 + 28.0 * p, 1),
        "absence_count": int(round(6 * inv)),
        "stress_level": round(2.0 + 7.0 * inv, 1),
        "anxiety_level": round(1.5 + 7.0 * inv, 1),
        "sleep_hours": round(5.0 + 3.0 * p, 1),
        "fatigue_level": round(1.5 + 7.0 * inv, 1),
        "motivation_level": round(1.0 + 4.0 * p, 1),
        "confidence_level": round(1.0 + 4.0 * p, 1),
        "peer_interaction": round(1.0 + 4.0 * p, 1),
        "teacher_support": round(1.5 + 3.0 * p, 1),
        "class_participation": round(1.0 + 4.0 * p, 1),
        "teacher_engagement_score": round(1.5 + 3.0 * p, 1),
        "behavior_rating": round(1.5 + 3.5 * p, 1),
        "academic_stress_index": round(0.85 * inv + 0.05, 2),
        "attendance_stability_index": round(0.55 + 0.44 * p, 2),
        "performance_trend_index": round(-0.8 + 1.6 * p, 2),
        "behavioral_score": round(0.30 + 0.65 * p, 2),
    }
    return features, composite


async def seed(weeks: int, dry_run: bool) -> None:
    students = await User.find(User.role == "student").to_list()
    if not students:
        print("No student accounts found. Register at least one student in the app first.")
        return

    print(f"{len(students)} student account(s); {weeks} check-in(s) each"
          f"{' [DRY RUN — nothing will be written]' if dry_run else ''}\n")

    inserted = skipped = 0
    # Backdated so history displays in chronological order in the UI. The
    # model never reads these dates — it only uses the per-student sequence
    # (see real_features.py) — so the exact spacing is cosmetic.
    now = datetime.now(timezone.utc)

    for idx, student in enumerate(students):
        shape_name = SHAPE_NAMES[idx % len(SHAPE_NAMES)]
        shape = SHAPES[shape_name]
        student_id = str(student.id)
        print(f"  {student.full_name} ({student.email}) -> {shape_name}")

        for i in range(weeks):
            sequence = i + 1
            existing = await WellbeingAssessment.find_one(
                WellbeingAssessment.student_id == student_id,
                WellbeingAssessment.sequence == sequence,
                WellbeingAssessment.source == "seeded",
            )
            if existing:
                skipped += 1
                continue

            features, composite = build_checkin(shape(i, weeks))
            created_at = now - timedelta(weeks=(weeks - sequence))

            if dry_run:
                print(f"      would insert #{sequence}: score={composite} "
                      f"stress={features['stress_level']} attendance={features['attendance_rate']}")
            else:
                await WellbeingAssessment(
                    student_id=student_id,
                    student_name=student.full_name,
                    user_id=student.id,
                    features=features,
                    composite_wellbeing_score=composite,
                    risk_label=_risk_label(composite),
                    source="seeded",
                    sequence=sequence,
                    created_at=created_at,
                ).insert()
            inserted += 1

    verb = "would insert" if dry_run else "inserted"
    print(f"\n{verb} {inserted}, skipped {skipped} (already present).")


async def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    weeks = DEFAULT_WEEKS
    if "--weeks" in args:
        try:
            weeks = int(args[args.index("--weeks") + 1])
        except (IndexError, ValueError):
            raise SystemExit("--weeks needs an integer, e.g. --weeks 8") from None
    if weeks < 3:
        raise SystemExit("--weeks must be at least 3 (the forecasting minimum).")

    unknown = [a for a in args if a not in {"--dry-run", "--weeks", str(weeks)}]
    if unknown:
        raise SystemExit(f"Unknown argument(s): {' '.join(unknown)}\n\n{__doc__}")

    await connect_to_mongo()
    try:
        await seed(weeks, dry_run)
    finally:
        await close_mongo_connection()


asyncio.run(main())
