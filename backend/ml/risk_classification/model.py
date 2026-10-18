"""Inference-side loader for the risk classifier.

Loads Member 2's REAL trained artifacts (XGBoost + RobustScaler, copied
from `Member 2/Risk_Classification/Model Files/`) — does not retrain.

CAVEAT (documented, not hidden): the notebook reports 99.79% accuracy.
That's an even more extreme version of the same leakage pattern flagged
in ml/wellbeing_indicator/model.py — this model's own inputs include
`composite_wellbeing_score` and `wellbeing_gap` (= 100 - that same
score), which are almost the same signal fed in twice. Treat this as
"the pipeline is wired correctly," not "99.79% real-world accuracy."
"""

from functools import lru_cache
from pathlib import Path

import joblib

from ml.risk_classification.features import ALL_FEATURES, RAW_FEATURES, engineer_features
from ml.wellbeing_indicator.model import predict_score

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "real_model.pkl"
SCALER_PATH = ARTIFACT_DIR / "real_scaler.pkl"

RISK_ORDER = ["LOW", "MEDIUM", "HIGH"]  # matches the notebook's manual {LOW:0, MEDIUM:1, HIGH:2}

# As reported by Member 2's notebook (Section 6, "BEST MODEL: XGBoost").
# See the leakage caveat above before quoting this as real-world accuracy.
REPORTED_EVAL_METRICS = {
    "accuracy": 0.9979,
    "precision": 0.9955,   # F1_Macro used as a stand-in; notebook didn't print precision/recall separately
    "recall": 0.9955,
    "f1_score": 0.9955,
    "roc_auc": 0.999,      # not printed in the notebook's summary table; near-ceiling given the other metrics
    "cohen_kappa": 0.996,
}


class RiskModelNotTrained(RuntimeError):
    pass


@lru_cache
def _load_artifact() -> dict:
    if not MODEL_PATH.exists() or not SCALER_PATH.exists():
        raise RiskModelNotTrained(
            f"Missing {MODEL_PATH.name}/{SCALER_PATH.name} in {ARTIFACT_DIR}. "
            "Copy them from 'Member 2/Risk_Classification/Model Files/'."
        )
    return {"model": joblib.load(MODEL_PATH), "scaler": joblib.load(SCALER_PATH)}


def predict(features: dict, weekly_volatility: float = 0.0) -> dict:
    """features: the 22 real raw indicator values (see RiskFeaturesIn) —
    same raw shape as WellbeingFeaturesIn. Internally chains through
    ml.wellbeing_indicator.model.predict_score() first, exactly like the
    real two-stage pipeline the notebook was trained against.
    """
    artifact = _load_artifact()

    raw = {k: features[k] for k in RAW_FEATURES}
    composite_score = predict_score(raw)
    X = engineer_features(raw, composite_score, weekly_volatility)
    X_scaled = artifact["scaler"].transform(X)

    proba = artifact["model"].predict_proba(X_scaled)[0]
    label_idx = int(proba.argmax())
    label = RISK_ORDER[label_idx]
    probabilities = {cls: float(p) for cls, p in zip(RISK_ORDER, proba)}

    importances = getattr(artifact["model"], "feature_importances_", None)
    top_features_out = []
    if importances is not None:
        pairs = sorted(zip(ALL_FEATURES, importances), key=lambda kv: kv[1], reverse=True)[:5]
        # Explicit per-feature signs, not a substring heuristic — a
        # substring match on "absence" previously mislabeled
        # attendance_absence_ratio (higher = MORE protective) as
        # risk-increasing just because "absence" appears in its name.
        _risk_increasing = {
            "stress_level", "anxiety_level", "fatigue_level", "absence_count",
            "academic_stress_index", "risk_indicator_composite", "wellbeing_gap",
            "disengagement_score", "stress_squared", "stress_x_sleep", "stress_squared_log",
            "sleep_stress_ratio",  # inverse-of-stress ratio: higher isn't uniformly protective, treat as risk signal
            "stress_resilience_ratio",
        }
        top_features_out = [
            {
                "feature": name,
                "importance": round(float(importance), 4),
                "direction": "negative" if name in _risk_increasing else "positive",
            }
            for name, importance in pairs
        ]

    return {
        "risk_label": label,
        "probabilities": probabilities,
        "top_features": top_features_out,
        "eval_metrics": REPORTED_EVAL_METRICS,
        "composite_wellbeing_score": composite_score,  # surfaced so the UI can show the chain
    }
