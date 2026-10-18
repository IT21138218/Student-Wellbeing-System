"""Feature schema for the risk classifier.

Matches Member 2's REAL trained model (`Member 2/Risk_Classification/Model
Files/best_risk_classifier.pkl` — an XGBoost classifier + RobustScaler),
ported verbatim from their notebook's Section 3.

This is a TWO-STAGE pipeline, not standalone: the model's own feature list
includes `composite_wellbeing_score` as an input, meaning it expects
Member 1's Wellbeing Indicator to run FIRST. See
ml/risk_classification/model.py, which calls
ml.wellbeing_indicator.model.predict_score() internally to get it.
"""

import numpy as np
import pandas as pd

RAW_FEATURES = [
    "grade", "week", "avg_exam_score", "study_hours", "homework_completion_rate",
    "attendance_rate", "absence_count", "stress_level", "anxiety_level", "sleep_hours",
    "fatigue_level", "motivation_level", "confidence_level", "peer_interaction",
    "teacher_support", "class_participation", "teacher_engagement_score", "behavior_rating",
    "academic_stress_index", "attendance_stability_index", "performance_trend_index",
    "behavioral_score",
]

# The model's own feature order (from best_risk_classifier.feature_names_in_):
# RAW_FEATURES, then composite_wellbeing_score, then these 6.
ENGINEERED_FEATURES = [
    "composite_wellbeing_score", "risk_indicator_composite", "wellbeing_gap",
    "disengagement_score", "attendance_absence_ratio", "stress_resilience_ratio",
    "weekly_volatility",
]

ALL_FEATURES = RAW_FEATURES + ENGINEERED_FEATURES


def engineer_features(raw: dict, composite_wellbeing_score: float, weekly_volatility: float = 0.0) -> pd.DataFrame:
    """Verbatim port of the notebook's Section 3 feature engineering.

    `composite_wellbeing_score` must come from
    ml.wellbeing_indicator.model.predict_score(raw) — this function doesn't
    compute it itself, since that requires a whole separate model.

    `weekly_volatility` (std-dev of a student's wellbeing score across
    their own weekly history) genuinely cannot be computed from a single
    snapshot — there's no "this week's" data to take a standard deviation
    of. Defaults to 0.0 (i.e. "assume stable") for a one-off live
    prediction; ml/risk_classification/model.py computes the real value
    when scoring one of the dataset's known students (see the "replay
    mode" pattern already used by ml/wellbeing_forecasting).
    """
    r = raw
    row = dict(r)
    row["composite_wellbeing_score"] = composite_wellbeing_score
    row["risk_indicator_composite"] = r["stress_level"] * (1 - r["attendance_rate"] / 100) * r["fatigue_level"]
    row["wellbeing_gap"] = 100 - composite_wellbeing_score
    row["disengagement_score"] = (5 - r["motivation_level"]) + (5 - r["class_participation"]) + (5 - r["teacher_engagement_score"])
    row["attendance_absence_ratio"] = r["attendance_rate"] / (r["absence_count"] + 1)
    row["stress_resilience_ratio"] = r["stress_level"] / (r["sleep_hours"] - 3) if r["sleep_hours"] != 3 else r["stress_level"] / 0.01
    row["weekly_volatility"] = weekly_volatility

    return pd.DataFrame([{k: row[k] for k in ALL_FEATURES}])
