"""Real-student feature building for Wellbeing Forecasting.

The CSV path (features.py / model.py) is untouched by this module — it stays
the default for the training-cohort demo. This is the parallel path that
turns a real student's stored WellbeingAssessment history into the SAME
42-column feature vector the fitted scaler/model expect.

Two things ported verbatim from Member 2's notebook that matter here:

1. NO REAL DATES. The notebook only ever groups by student_id and sorts by
   an integer `week` column (1-8 in training). It never checks 7-day
   spacing. So a real student's check-ins get a sequential 1,2,3... index
   as their `week`, regardless of the actual calendar gaps between them.

2. `df.fillna(0)` runs AFTER every transform. Early rows' missing
   lag/rolling values therefore become 0 rather than NaN — silently. That
   is exactly why MIN_HISTORY_WEEKS is 3 below: with fewer records, the
   lag2/momentum/attendance_trend features would be zero-filled and the
   prediction would be built on fabricated zeros with no error raised.
"""

import pandas as pd

from ml.wellbeing_forecasting.features import ALL_FEATURES, BASE_FEATURES, engineer_features

# Deliberately NOT the MIN_HISTORY_WEEKS in features.py (which is 1, unused,
# and describes the CSV replay path where every student already has 8 weeks).
# 3 is the deepest any feature looks back (lag2 + rolling(3) + linregress
# over 3 points) — below it, see the fillna(0) note in this module's docstring.
MIN_HISTORY_WEEKS = 3

# The 4 columns that get time-engineered. Everything else in BASE_FEATURES is
# passed through as the latest check-in's raw value.
TIME_ENGINEERED_BASE_COLUMNS = [
    "composite_wellbeing_score", "avg_exam_score", "stress_level", "attendance_rate",
]


def assessments_to_frame(assessments: list) -> pd.DataFrame:
    """Turn WellbeingAssessment documents (already sorted oldest-first) into
    the BASE_FEATURES frame engineer_features() expects.

    `composite_wellbeing_score` is a top-level field on the document; the
    other 22 base columns live in its `features` dict (the raw
    WellbeingFeaturesIn payload). `week` is OVERWRITTEN with the sequence
    position — the form's own `week` value is what the user typed for that
    single check-in, not a position in their history, so using it would
    scramble the ordering the lag/rolling features depend on.
    """
    rows = []
    for seq, a in enumerate(assessments, start=1):
        feats = dict(a.features or {})
        row = {col: feats.get(col) for col in BASE_FEATURES}
        row["composite_wellbeing_score"] = a.composite_wellbeing_score
        row["week"] = seq  # sequence position, not the form's `week` field
        rows.append(row)
    return pd.DataFrame(rows, columns=BASE_FEATURES)


def build_real_forecast_features(assessments: list) -> pd.DataFrame:
    """One real student's history -> the single latest engineered feature
    row, column-for-column identical to what the CSV pipeline produces.

    Reuses engineer_features() rather than reimplementing the transforms, so
    the real path can never drift from the CSV path's pandas semantics
    (rolling(3, min_periods=1), diff(), ewm(alpha=0.3, min_periods=1),
    linregress slope over the last 3 points, fillna(0) last).

    Raises ValueError below MIN_HISTORY_WEEKS — callers should check
    eligibility first and return a 200 progress response instead.
    """
    if len(assessments) < MIN_HISTORY_WEEKS:
        raise ValueError(
            f"Need at least {MIN_HISTORY_WEEKS} check-ins to forecast; got {len(assessments)}."
        )
    history = assessments_to_frame(assessments)
    engineered = engineer_features(history)
    return engineered.iloc[[-1]][ALL_FEATURES]
