"""Feature schema for the REAL coping effectiveness classifier (Member 3's
SVC model, `Member 3/Coping_Recommendation/Model Files/best_coping_model.pkl`).

Ported verbatim from
`Member 3/Coping_Recommendation/Model Files/Coping_Mechanism_Recommendation.ipynb`
Section 3 — including the exact one-hot/multi-label column order the model
was fit on (the SVC doesn't store feature_names_in_, so getting this order
wrong silently mis-predicts rather than erroring).
"""

import pandas as pd

TRIGGERS = ["Exams", "Family", "Friends", "Homework", "Teachers", "Time pressure"]

STRATEGIES = [
    "Deep breathing", "Exercise/Sports", "Gaming/Entertainment", "Ignoring/Avoidance",
    "Journaling", "Music/Relaxation", "Sleeping", "Talking to someone",
]

STRATEGY_ICONS = {
    "Deep breathing": "🌬️", "Exercise/Sports": "🏃", "Gaming/Entertainment": "🎮",
    "Ignoring/Avoidance": "🙈", "Journaling": "📓", "Music/Relaxation": "🎵",
    "Sleeping": "😴", "Talking to someone": "🗣️",
}

_ACTIVE_STRATEGIES = {"Exercise/Sports", "Talking to someone", "Deep breathing"}
_AVOIDANT_STRATEGIES = {"Ignoring/Avoidance", "Sleeping", "Gaming/Entertainment"}

RAW_NUMERIC = [
    "week", "break_frequency", "talks_to_someone", "belonging_score", "loneliness_score",
    "help_seeking_comfort", "group_inclusion", "has_support_person", "class_support",
    "class_competition", "peer_helping",
]


def _mlb_column(strategy: str) -> str:
    return f"uses_{strategy.lower().replace('/', '_').replace(' ', '_')}"


# Exact column order the model was fit on: 11 raw numeric, then 8 MLB
# strategy-used flags (alphabetical, sklearn's MultiLabelBinarizer sorts
# classes), then 6 trigger one-hots (alphabetical, pd.get_dummies), then 8
# primary-strategy one-hots (alphabetical), then 7 engineered scalars.
ALL_FEATURES = (
    RAW_NUMERIC
    + [_mlb_column(s) for s in STRATEGIES]
    + [f"trigger_{t}" for t in TRIGGERS]
    + [f"primary_{s}" for s in STRATEGIES]
    + [
        "social_support_score", "isolation_risk", "coping_diversity",
        "support_network_strength", "class_climate_score",
        "strategy_is_active", "strategy_is_avoidant",
    ]
)


def build_feature_row(raw: dict, strategies_used: list[str], primary_strategy: str) -> pd.DataFrame:
    """raw: the 11 RAW_NUMERIC fields. strategies_used: 1+ strategies the
    student tried (multi-select in the UI — a single-strategy list is
    fine). primary_strategy: which one was primary."""
    row = {k: raw[k] for k in RAW_NUMERIC}

    for s in STRATEGIES:
        row[_mlb_column(s)] = 1 if s in strategies_used else 0
    for t in TRIGGERS:
        row[f"trigger_{t}"] = 1 if t == raw["stress_trigger"] else 0
    for s in STRATEGIES:
        row[f"primary_{s}"] = 1 if s == primary_strategy else 0

    row["social_support_score"] = (raw["belonging_score"] + raw["group_inclusion"] + raw["help_seeking_comfort"]) / 3
    row["isolation_risk"] = raw["loneliness_score"] - raw["belonging_score"]
    row["coping_diversity"] = len(strategies_used)
    row["support_network_strength"] = raw["has_support_person"] + raw["talks_to_someone"] + raw["peer_helping"] / 5
    row["class_climate_score"] = raw["class_support"] - raw["class_competition"]
    row["strategy_is_active"] = 1 if primary_strategy in _ACTIVE_STRATEGIES else 0
    row["strategy_is_avoidant"] = 1 if primary_strategy in _AVOIDANT_STRATEGIES else 0

    return pd.DataFrame([row])[ALL_FEATURES]
