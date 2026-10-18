"""Feature schema for the Wellbeing Forecasting model.

Ported verbatim from Member 2's notebook:
`Member 2/Wellbeing_Forecasting/Part1_EDA_TimeSeries_Features.py` (Section 3).

Unlike risk_classification / wellbeing_indicator, this model needs a
STUDENT'S WEEKLY HISTORY (lag values, 3-week rolling stats, momentum,
trend) — it cannot be computed from one snapshot. `engineer_features()`
takes a student's rows sorted by week and returns the last row's fully
engineered feature vector, ready for the model.
"""

import numpy as np
import pandas as pd
from scipy import stats

# Base columns from the dataset used directly (no engineering needed)
BASE_FEATURES = [
    "grade", "week", "avg_exam_score", "study_hours", "homework_completion_rate",
    "attendance_rate", "absence_count", "stress_level", "anxiety_level", "sleep_hours",
    "fatigue_level", "motivation_level", "confidence_level", "peer_interaction",
    "teacher_support", "class_participation", "teacher_engagement_score", "behavior_rating",
    "academic_stress_index", "attendance_stability_index", "performance_trend_index",
    "behavioral_score", "composite_wellbeing_score",
]

# Exact order the real model/scaler were fit on (scaler.feature_names_in_).
ALL_FEATURES = BASE_FEATURES + [
    "composite_wellbeing_score_lag1", "composite_wellbeing_score_lag2",
    "avg_exam_score_lag1", "avg_exam_score_lag2",
    "stress_level_lag1", "stress_level_lag2",
    "attendance_rate_lag1", "attendance_rate_lag2",
    "composite_wellbeing_score_rolling_mean3", "composite_wellbeing_score_rolling_std3",
    "stress_level_rolling_mean3", "stress_level_rolling_std3",
    "score_delta", "stress_delta", "wellbeing_delta", "momentum",
    "cumulative_stress_3w", "attendance_trend", "wellbeing_ema",
]

MIN_HISTORY_WEEKS = 1  # a single week works (lag/rolling just fill with 0 / NaN->0, same as training)


def _rolling_slope(series: pd.Series, window: int = 3) -> pd.Series:
    """Verbatim port of the notebook's rolling_slope()."""
    result = []
    for i in range(len(series)):
        if i < window - 1:
            result.append(0)
        else:
            y = series.iloc[i - window + 1:i + 1].values
            x = np.arange(window)
            slope, _, _, _, _ = stats.linregress(x, y)
            result.append(slope)
    return pd.Series(result, index=series.index)


def engineer_features(student_history: pd.DataFrame) -> pd.DataFrame:
    """student_history: one student's rows (BASE_FEATURES present),
    sorted ascending by week. Returns the same rows with all engineered
    columns added — use `.iloc[[-1]]` to get the latest week's forecast
    input. Formulas match the notebook's Section 3 exactly, including its
    `df.fillna(0)` at the end.
    """
    df = student_history.sort_values("week").reset_index(drop=True).copy()

    for col in ["composite_wellbeing_score", "avg_exam_score", "stress_level", "attendance_rate"]:
        df[f"{col}_lag1"] = df[col].shift(1)
        df[f"{col}_lag2"] = df[col].shift(2)

    for col in ["composite_wellbeing_score", "stress_level"]:
        df[f"{col}_rolling_mean3"] = df[col].rolling(3, min_periods=1).mean()
        df[f"{col}_rolling_std3"] = df[col].rolling(3, min_periods=1).std()

    df["score_delta"] = df["avg_exam_score"].diff()
    df["stress_delta"] = df["stress_level"].diff()
    df["wellbeing_delta"] = df["composite_wellbeing_score"].diff()
    df["momentum"] = df["composite_wellbeing_score_lag1"] - df["composite_wellbeing_score_lag2"]
    df["cumulative_stress_3w"] = df["stress_level"].rolling(3, min_periods=1).sum()
    df["attendance_trend"] = _rolling_slope(df["attendance_rate"], 3)
    df["wellbeing_ema"] = df["composite_wellbeing_score"].ewm(alpha=0.3, min_periods=1).mean()

    df = df.fillna(0)
    return df[ALL_FEATURES]
