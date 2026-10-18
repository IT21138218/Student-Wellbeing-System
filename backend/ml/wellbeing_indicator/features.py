"""Feature schema for the Wellbeing Indicator regressor.

Matches the REAL trained model in artifacts/real_model.pkl (a Lasso
regression trained by Member 1's own notebook,
`Member 1/Wellbeing_Indicator/Model files/Wellbeing_Indicator_Model_.ipynb`,
on `Member 1/student_wellbeing_dataset.csv`) — not a synthetic stand-in.

engineer_features() below is copied verbatim from Section 4 / Section 6 of
that notebook so scaling and column order match exactly what the model
was fit on.
"""

import numpy as np
import pandas as pd

# Order matches model.feature_names_in_ exactly — the model and scaler
# were both fit on columns in this order (raw CSV column order, then
# the 10 engineered columns appended at the end).
RAW_FEATURES = [
    "grade", "week", "avg_exam_score", "study_hours", "homework_completion_rate",
    "attendance_rate", "absence_count", "stress_level", "anxiety_level", "sleep_hours",
    "fatigue_level", "motivation_level", "confidence_level", "peer_interaction",
    "teacher_support", "class_participation", "teacher_engagement_score", "behavior_rating",
    "academic_stress_index", "attendance_stability_index", "performance_trend_index",
    "behavioral_score",
]

ENGINEERED_FEATURES = [
    "sleep_stress_ratio", "engagement_composite", "academic_effort_index",
    "social_support_index", "stress_squared", "sleep_squared", "stress_x_sleep",
    "motivation_x_study", "absence_count_log", "stress_squared_log",
]

ALL_FEATURES = RAW_FEATURES + ENGINEERED_FEATURES


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Verbatim port of the notebook's Section 4 feature engineering."""
    out = df.copy()
    out["sleep_stress_ratio"] = out["sleep_hours"] / out["stress_level"]
    out["engagement_composite"] = (out["motivation_level"] + out["confidence_level"] + out["class_participation"]) / 3
    out["academic_effort_index"] = out["study_hours"] * out["homework_completion_rate"]
    out["social_support_index"] = (out["peer_interaction"] + out["teacher_support"]) / 2
    out["stress_squared"] = out["stress_level"] ** 2
    out["sleep_squared"] = out["sleep_hours"] ** 2
    out["stress_x_sleep"] = out["stress_level"] * out["sleep_hours"]
    out["motivation_x_study"] = out["motivation_level"] * out["study_hours"]
    out["absence_count_log"] = np.log1p(out["absence_count"])
    out["stress_squared_log"] = np.log1p(out["stress_squared"])
    return out[ALL_FEATURES]


# Dimension breakdown shown in the UI — explicit, interpretable formulas
# (not a second model; same rationale as risk_classification's engineered
# features) built from real dataset columns, each rescaled to 0-100 using
# the actual observed ranges in student_wellbeing_dataset.csv.
def compute_dimensions(f: dict) -> dict[str, float]:
    def pct(v, lo, hi):
        return float(np.clip((v - lo) / (hi - lo) * 100, 0, 100))

    sleep_wellbeing = pct(f["sleep_hours"], 4, 9)
    stress_management = 100 - pct((f["stress_level"] + f["anxiety_level"] + f["fatigue_level"]) / 3, 1, 6)
    academic_engagement = np.mean([
        pct(f["avg_exam_score"], 0, 100),
        pct(f["homework_completion_rate"] * 100, 0, 100),
        pct(f["class_participation"], 1, 5),
        pct(f["motivation_level"], 1, 5),
        pct(f["confidence_level"], 1, 5),
    ])
    social_support = np.mean([
        pct(f["peer_interaction"], 1, 5),
        pct(f["teacher_support"], 1, 5),
        pct(f["teacher_engagement_score"], 1, 5),
    ])
    behavioral_stability = np.mean([
        pct(f["behavior_rating"], 1, 5),
        pct(f["behavioral_score"] * 100, 0, 100),
        pct(f["attendance_stability_index"] * 100, 0, 100),
    ])

    return {
        "sleep_wellbeing": round(sleep_wellbeing, 1),
        "stress_management": round(stress_management, 1),
        "academic_engagement": round(float(academic_engagement), 1),
        "social_support": round(float(social_support), 1),
        "behavioral_stability": round(float(behavioral_stability), 1),
    }
