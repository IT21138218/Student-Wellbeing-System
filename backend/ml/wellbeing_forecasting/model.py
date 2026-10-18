"""Inference-side loader for the Wellbeing Forecasting model.

Loads Member 2's REAL trained LightGBM regressor + StandardScaler
(copied from Member 2/Wellbeing_Forecasting/Model Files/) — no retraining.

IMPORTANT — data source caveat: this model needs 1+ weeks of a student's
OWN history to compute lag/rolling/trend features (see features.py). Your
live app has no real multi-week history yet (it's brand new), so this
module serves forecasts from the real dataset's known students
(`Member 1/student_wellbeing_dataset.csv`, 300 students x 8 real weeks)
as a "replay" demo — genuinely real data, real model, just not YOUR
current live users. Once the app has been running long enough to
accumulate several weeks of real WellbeingAssessment history per student,
`get_student_history()` below is the one function to swap for a live
Mongo query — nothing else changes.
"""

from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

from ml.wellbeing_forecasting.features import ALL_FEATURES, BASE_FEATURES, engineer_features

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "real_model.pkl"
SCALER_PATH = ARTIFACT_DIR / "real_scaler.pkl"
DATASET_PATH = Path(__file__).parents[2] / ".." / "Member 1" / "student_wellbeing_dataset.csv"


class ForecastModelNotTrained(RuntimeError):
    pass


# As reported by Member 2's notebook (Section: "BEST MODEL: LightGBM"),
# using a correct temporal train/test split (train=weeks 1-6, test=weeks
# 7-8) — no leakage, unlike wellbeing_indicator/risk_classification.
REPORTED_EVAL_METRICS = {
    "mae": 3.2685,
    "rmse": 4.1254,
    "r_squared": 0.8772,
    "mase": 0.4527,
    "directional_accuracy": 72.0,
}


@lru_cache
def _load_artifact() -> dict:
    if not MODEL_PATH.exists() or not SCALER_PATH.exists():
        raise ForecastModelNotTrained(f"Missing real_model.pkl/real_scaler.pkl in {ARTIFACT_DIR}.")
    model = joblib.load(MODEL_PATH)
    importances = {}
    if hasattr(model, "feature_importances_"):
        importances = dict(sorted(
            zip(ALL_FEATURES, model.feature_importances_.tolist()),
            key=lambda kv: kv[1], reverse=True,
        ))
    return {"model": model, "scaler": joblib.load(SCALER_PATH), "feature_importances": importances}


@lru_cache
def _load_dataset() -> pd.DataFrame:
    path = DATASET_PATH.resolve()
    if not path.exists():
        raise FileNotFoundError(f"Real dataset not found at {path}.")
    return pd.read_csv(path)


def list_students() -> list[dict]:
    """All known students with real history, for the UI to pick from."""
    df = _load_dataset()
    latest = df[df["week"] == df.groupby("student_id")["week"].transform("max")]
    return [
        {"student_id": r.student_id, "grade": int(r.grade), "weeks_available": int(r.week), "risk_label": r.risk_label}
        for r in latest.sort_values("student_id").itertuples()
    ]


def get_student_history(student_id: str) -> pd.DataFrame:
    """TODO: once live usage accumulates real weekly history, replace this
    lookup with a Mongo query over WellbeingAssessment for this student_id,
    ordered by week — engineer_features()'s contract stays identical."""
    df = _load_dataset()
    history = df[df["student_id"] == student_id]
    if history.empty:
        raise ValueError(f"No history found for student_id={student_id!r}.")
    return history[[*BASE_FEATURES, "next_week_wellbeing_score"]].assign(student_id=student_id)


def predict_from_real_history(student_id: str, assessments: list) -> dict:
    """Real-student forecast. Same artifact, same scaler, same response shape
    as predict_for_student() — only the history source differs (Mongo
    WellbeingAssessment documents instead of the CSV).

    `actual_next_week_score` is always None here: unlike the CSV (which has
    a known next_week_wellbeing_score column to compare against), a real
    student's next week hasn't happened yet. Reporting anything else would
    be inventing a ground truth that doesn't exist.
    """
    from ml.wellbeing_forecasting.real_features import assessments_to_frame, build_real_forecast_features

    artifact = _load_artifact()
    latest = build_real_forecast_features(assessments)
    latest_scaled = pd.DataFrame(artifact["scaler"].transform(latest), columns=ALL_FEATURES)

    predicted_next_week = float(artifact["model"].predict(latest_scaled)[0])
    history = assessments_to_frame(assessments)
    current_score = float(history["composite_wellbeing_score"].iloc[-1])
    current_week = int(history["week"].iloc[-1])

    trajectory = [
        {"week": int(r.week), "actual_score": float(r.composite_wellbeing_score)}
        for r in history.itertuples()
    ]

    top_features = list(artifact["feature_importances"].items())[:5]
    top_features_out = [
        {"feature": name, "importance": round(float(imp), 1)}
        for name, imp in top_features
    ]

    return {
        "student_id": student_id,
        "current_week": current_week,
        "current_score": round(current_score, 1),
        "predicted_next_week_score": round(predicted_next_week, 1),
        "delta": round(predicted_next_week - current_score, 1),
        "trend": "improving" if predicted_next_week > current_score else "declining" if predicted_next_week < current_score else "stable",
        "actual_next_week_score": None,
        "trajectory": trajectory,
        "weeks_of_history": len(history),
        "top_features": top_features_out,
        "eval_metrics": REPORTED_EVAL_METRICS,
    }


def predict_for_student(student_id: str) -> dict:
    artifact = _load_artifact()
    history = get_student_history(student_id).sort_values("week")

    engineered_full = engineer_features(history[BASE_FEATURES])
    latest = engineered_full.iloc[[-1]][ALL_FEATURES]
    latest_scaled = pd.DataFrame(artifact["scaler"].transform(latest), columns=ALL_FEATURES)

    predicted_next_week = float(artifact["model"].predict(latest_scaled)[0])
    current_score = float(history["composite_wellbeing_score"].iloc[-1])
    current_week = int(history["week"].iloc[-1])
    actual_next_week = history["next_week_wellbeing_score"].iloc[-1]

    trajectory = [
        {"week": int(r.week), "actual_score": float(r.composite_wellbeing_score)}
        for r in history.itertuples()
    ]

    top_features = list(artifact["feature_importances"].items())[:5]
    top_features_out = [
        {"feature": name, "importance": round(float(imp), 1)}
        for name, imp in top_features
    ]

    return {
        "student_id": student_id,
        "current_week": current_week,
        "current_score": round(current_score, 1),
        "predicted_next_week_score": round(predicted_next_week, 1),
        "delta": round(predicted_next_week - current_score, 1),
        "trend": "improving" if predicted_next_week > current_score else "declining" if predicted_next_week < current_score else "stable",
        "actual_next_week_score": round(float(actual_next_week), 1) if pd.notna(actual_next_week) else None,
        "trajectory": trajectory,
        "weeks_of_history": len(history),
        "top_features": top_features_out,
        "eval_metrics": REPORTED_EVAL_METRICS,
    }
