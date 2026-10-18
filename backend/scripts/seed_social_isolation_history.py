"""Seed multi-week CopingRecord history for real student accounts, so
Social Isolation Detection's real-student path has something to cluster.

Social Isolation clusters a STUDENT-LEVEL AGGREGATE profile built from a
student's own CopingRecord history (belonging/loneliness/support signals —
see ml/social_peer_matching/real_features.py), not Wellbeing Indicator
data. It needs at least MIN_HISTORY_WEEKS (2) tagged CopingRecord entries
per student. A fresh install has none — Coping Strategies has no Student
Picker yet, so real usage doesn't tag itself unless the student runs it on
their own account — so this generates a believable history the same way
seed_forecast_history.py does for Wellbeing Forecasting.

Rows are tagged `source="seeded"` on the CopingRecord (same field already
used by seed_forecast_history.py's WellbeingAssessment rows) so they stay
distinguishable from genuine check-ins.

Run from the backend/ directory:

    .venv/Scripts/python.exe scripts/seed_social_isolation_history.py
    .venv/Scripts/python.exe scripts/seed_social_isolation_history.py --dry-run
    .venv/Scripts/python.exe scripts/seed_social_isolation_history.py --weeks 6
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from app.models.coping import CopingRecord  # noqa: E402
from app.models.user import User  # noqa: E402

DEFAULT_WEEKS = 5  # 2 clears eligibility, rest so a real trend/std is visible

# Four social shapes, cycled across students — mirrors
# seed_forecast_history.py's four wellbeing shapes, but tuned to what
# social_perception_score / isolation_index actually respond to
# (belonging, loneliness, group_inclusion, support, class_support).
SHAPES = {
    "well_connected": lambda i, n: 0.75 + 0.05 * (i % 2),          # consistently strong, small noise
    "isolated":        lambda i, n: 0.20 + 0.05 * (i % 2),          # consistently weak, small noise
    "improving":       lambda i, n: 0.25 + 0.55 * (i / max(n - 1, 1)),  # rising connectedness
    "declining":       lambda i, n: 0.75 - 0.55 * (i / max(n - 1, 1)),  # falling connectedness
}
SHAPE_NAMES = list(SHAPES)

TRIGGERS = ["Exams", "Family", "Friends", "Homework", "Teachers", "Time pressure"]
STRATEGIES = [
    "Deep breathing", "Exercise/Sports", "Gaming/Entertainment", "Ignoring/Avoidance",
    "Journaling", "Music/Relaxation", "Sleeping", "Talking to someone",
]


def build_checkin(position: float, week: int) -> dict:
    """One week's CopingFeaturesIn-shaped feature dict, all correlated
    fields derived from a single 0-1 "connectedness position" so belonging
    stays consistent with loneliness/support/class_support rather than
    being independent noise — same principle as
    seed_forecast_history.py's build_checkin()."""
    p = max(0.0, min(1.0, position))
    inv = 1.0 - p
    return {
        "week": week,
        "stress_trigger": TRIGGERS[week % len(TRIGGERS)],
        "coping_primary_strategy": STRATEGIES[week % len(STRATEGIES)],
        "strategies_used": [STRATEGIES[week % len(STRATEGIES)]],
        "break_frequency": round(1.0 + 4.0 * p, 1),
        "talks_to_someone": 1 if p > 0.45 else 0,
        "belonging_score": round(1.0 + 4.0 * p, 1),
        "loneliness_score": round(1.0 + 4.0 * inv, 1),
        "help_seeking_comfort": round(1.0 + 4.0 * p, 1),
        "group_inclusion": round(1.0 + 4.0 * p, 1),
        "has_support_person": 1 if p > 0.4 else 0,
        "class_support": round(1.0 + 4.0 * p, 1),
        "class_competition": round(1.0 + 3.0 * inv, 1),
        "peer_helping": round(1.0 + 4.0 * p, 1),
    }


async def seed(weeks: int, dry_run: bool) -> None:
    students = await User.find(User.role == "student").to_list()
    if not students:
        print("No student accounts found. Register at least one student in the app first.")
        return

    print(f"{len(students)} student account(s); {weeks} check-in(s) each"
          f"{' [DRY RUN — nothing will be written]' if dry_run else ''}\n")

    inserted = skipped = 0
    now = datetime.now(timezone.utc)

    for idx, student in enumerate(students):
        shape_name = SHAPE_NAMES[idx % len(SHAPE_NAMES)]
        shape = SHAPES[shape_name]
        student_id = str(student.id)
        print(f"  {student.full_name} ({student.email}) -> {shape_name}")

        existing_count = await CopingRecord.find(
            CopingRecord.student_id == student_id, CopingRecord.source == "seeded",
        ).count()
        if existing_count >= weeks:
            skipped += existing_count
            continue

        for i in range(existing_count, weeks):
            features = build_checkin(shape(i, weeks), week=i + 1)
            created_at = now - timedelta(weeks=(weeks - (i + 1)))

            if dry_run:
                print(f"      would insert #{i + 1}: belonging={features['belonging_score']} "
                      f"loneliness={features['loneliness_score']}")
            else:
                await CopingRecord(
                    student_id=student_id,
                    student_name=student.full_name,
                    user_id=student.id,
                    features=features,
                    # Placeholder — the real predicted values live on genuine
                    # runs; seeded rows exist only to build a survey history,
                    # not to claim a specific coping-model prediction.
                    top_recommendation=features["coping_primary_strategy"],
                    selected_effectiveness=1,
                    source="seeded",
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
            raise SystemExit("--weeks needs an integer, e.g. --weeks 6") from None
    if weeks < 2:
        raise SystemExit("--weeks must be at least 2 (the social-profile minimum).")

    unknown = [a for a in args if a not in {"--dry-run", "--weeks", str(weeks)}]
    if unknown:
        raise SystemExit(f"Unknown argument(s): {' '.join(unknown)}\n\n{__doc__}")

    await connect_to_mongo()
    try:
        await seed(weeks, dry_run)
    finally:
        await close_mongo_connection()


asyncio.run(main())
