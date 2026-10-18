"""Seed real demo records across all 4 Alerts signal types, so the Alerts
page (app/services/alert_service.py) has something to show on a fresh
install: unescalated HIGH-risk classifications, isolation-flagged social
detections, low-confidence coping recommendations, and HIGH-risk wellbeing
check-ins. Uses realistic Sri Lankan student names (this app's real cohort
is a Sri Lankan school) for the three modules that store a free-text
student_name label (Risk, Coping, Wellbeing — see their models' "denormalized
at write time" comment). Social Isolation's SocialRecord has no free-text
name field — it only shows a real name when student_id links to an actual
registered User (see alert_service.py's name_by_id lookup) — so those rows
cycle through whichever real student accounts already exist, falling back to
a synthetic source_student_id if there are none.

Every row is a plain Mongo insert (no ML model actually run), same
convention as seed_forecast_history.py / seed_social_isolation_history.py.
Tagged with a `_seed_tag` inside `features` (Risk/Coping/Wellbeing all have a
`features: dict` field) so re-running the script is idempotent; SocialRecord
has no `features` field, so its rows are tagged via `cluster_name` instead
(see IDEMPOTENCY below).

Run from the backend/ directory:

    .venv/Scripts/python.exe scripts/seed_alerts_demo.py
    .venv/Scripts/python.exe scripts/seed_alerts_demo.py --dry-run
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_mongo_connection, connect_to_mongo  # noqa: E402
from app.models.coping import CopingRecord  # noqa: E402
from app.models.risk import RiskAssessment  # noqa: E402
from app.models.social import SocialRecord  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.wellbeing import WellbeingAssessment  # noqa: E402

SEED_TAG = "alerts_demo_v1"  # IDEMPOTENCY: presence of this tag = "already seeded"

SRI_LANKAN_NAMES = [
    "Kavindu Perera", "Nethmi Fernando", "Tharindu Silva", "Dilani Wickramasinghe",
    "Sachini Rathnayake", "Chamodi Gunawardena",
]

N_PER_TYPE = 5


def _now_minus(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


async def seed_risk(dry_run: bool) -> int:
    existing = await RiskAssessment.find({"features._seed_tag": SEED_TAG}).count()
    if existing >= N_PER_TYPE:
        return 0
    inserted = 0
    for i in range(existing, N_PER_TYPE):
        name = SRI_LANKAN_NAMES[i % len(SRI_LANKAN_NAMES)]
        score = 35.0 + i * 2.5  # low composite score -> HIGH risk narrative reads correctly
        if dry_run:
            print(f"  [risk] would insert HIGH-risk, unescalated, for {name}")
        else:
            await RiskAssessment(
                student_id=f"SEED-R{i+1:02d}",
                student_name=name,
                user_id=None,
                features={"_seed_tag": SEED_TAG},
                risk_label="HIGH",
                probabilities={"LOW": 0.08, "MEDIUM": 0.17, "HIGH": 0.75},
                composite_wellbeing_score=round(score, 1),
                escalated=False,
                created_at=_now_minus(i),
            ).insert()
        inserted += 1
    return inserted


async def seed_social(dry_run: bool) -> int:
    existing = await SocialRecord.find(SocialRecord.cluster_name == f"At-Risk / Isolated ({SEED_TAG})").count()
    if existing >= N_PER_TYPE:
        return 0

    real_students = await User.find(User.role == "student").to_list()

    inserted = 0
    for i in range(existing, N_PER_TYPE):
        student = real_students[i % len(real_students)] if real_students else None
        if dry_run:
            label = student.full_name if student else f"SEED-S{i+1:02d}"
            print(f"  [social] would insert isolation flag for {label}")
        else:
            await SocialRecord(
                student_id=student.id if student else None,
                user_id=None,
                source_student_id=str(student.id) if student else f"SEED-S{i+1:02d}",
                cluster_name=f"At-Risk / Isolated ({SEED_TAG})",
                isolation_risk_flag=True,
                created_at=_now_minus(i),
            ).insert()
        inserted += 1
    return inserted


async def seed_coping(dry_run: bool) -> int:
    existing = await CopingRecord.find({"features._seed_tag": SEED_TAG}).count()
    if existing >= N_PER_TYPE:
        return 0
    inserted = 0
    for i in range(existing, N_PER_TYPE):
        name = SRI_LANKAN_NAMES[(i + 2) % len(SRI_LANKAN_NAMES)]
        if dry_run:
            print(f"  [coping] would insert low-confidence recommendation for {name}")
        else:
            await CopingRecord(
                student_id=f"SEED-C{i+1:02d}",
                student_name=name,
                user_id=None,
                features={"_seed_tag": SEED_TAG},
                top_recommendation="Talking to someone",
                selected_effectiveness=1,
                low_confidence=True,
                source="seeded",
                created_at=_now_minus(i),
            ).insert()
        inserted += 1
    return inserted


async def seed_wellbeing(dry_run: bool) -> int:
    existing = await WellbeingAssessment.find({"features._seed_tag": SEED_TAG}).count()
    if existing >= N_PER_TYPE:
        return 0
    inserted = 0
    for i in range(existing, N_PER_TYPE):
        name = SRI_LANKAN_NAMES[(i + 4) % len(SRI_LANKAN_NAMES)]
        score = 30.0 + i * 3.0
        if dry_run:
            print(f"  [wellbeing] would insert HIGH-risk check-in for {name}")
        else:
            await WellbeingAssessment(
                student_id=f"SEED-W{i+1:02d}",
                student_name=name,
                user_id=None,
                features={"_seed_tag": SEED_TAG},
                composite_wellbeing_score=round(score, 1),
                risk_label="HIGH",
                source="seeded",
                created_at=_now_minus(i),
            ).insert()
        inserted += 1
    return inserted


async def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    await connect_to_mongo()
    try:
        print(f"Seeding up to {N_PER_TYPE} demo record(s) per alert type"
              f"{' [DRY RUN — nothing will be written]' if dry_run else ''}\n")
        r = await seed_risk(dry_run)
        s = await seed_social(dry_run)
        c = await seed_coping(dry_run)
        w = await seed_wellbeing(dry_run)
        verb = "would insert" if dry_run else "inserted"
        print(f"\nRisk: {verb} {r}. Social: {verb} {s}. Coping: {verb} {c}. Wellbeing: {verb} {w}.")
        print("(0 for a type means it was already seeded — safe to re-run any time.)")
    finally:
        await close_mongo_connection()


asyncio.run(main())
