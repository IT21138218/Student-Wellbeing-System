"""Inference-side loader for the REAL coping effectiveness classifier
(Member 3's SVC model).

CAVEAT: the model was trained with `probability=False` (faster/simpler
fit), so `predict_proba()` isn't available on it — scikit-learn raises if
you call it on an SVC that wasn't fit with `probability=True`. We use
`decision_function()` (the SVC's raw per-class margins) and softmax them
into a probability-shaped output instead. This is an approximate
confidence signal, not a calibrated probability — documented here rather
than silently presented as real probabilities.
"""

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from ml.coping_recommendation.features import STRATEGIES, STRATEGY_ICONS, build_feature_row

ARTIFACT_PATH = Path(__file__).parent / "artifacts" / "real_model.pkl"

EFFECTIVENESS_LABELS = {0: "Not Effective", 1: "Somewhat Effective", 2: "Very Effective"}

# As reported in Member 3/Coping_Recommendation/Model Files/coping_model_results.csv
# (SVM row — the best of the 4 models tried). Deliberately modest, unlike
# the other modules' suspicious ~99%/100% results — this one shows no sign
# of label leakage, which is a healthier (if less flattering) outcome.
REPORTED_EVAL_METRICS = {
    "accuracy": 0.5346534653465347,
    "precision": 0.5011433926897845,   # F1_Macro used to fill both precision/recall since
    "recall": 0.5011433926897845,      # the results CSV doesn't break those out separately
    "f1_macro": 0.5011433926897845,
    "roc_auc": None,                   # not computable: probability=False means no predict_proba
    "cohen_kappa": 0.2809210028023933,
}


class CopingModelNotTrained(RuntimeError):
    pass


@lru_cache
def _load_artifact():
    if not ARTIFACT_PATH.exists():
        raise CopingModelNotTrained(f"Missing {ARTIFACT_PATH.name} in {ARTIFACT_PATH.parent}.")
    return joblib.load(ARTIFACT_PATH)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


EFFECTIVENESS_MARGIN_THRESHOLD = 0.15
RECOMMENDATION_MARGIN_THRESHOLD = 0.10


def compute_low_confidence(effectiveness_probs, recommendation_scores) -> bool:
    """Two independent "is this actually a confident call?" checks, both
    derived from softmaxed SVM margins (not calibrated probabilities — see
    this module's docstring), so treated as a rough signal, not a precise
    one.

    effectiveness_probs: the 3 softmaxed class probabilities for the
    selected strategy's predicted effectiveness. Low margin between the
    top two = the model isn't sure which effectiveness class is right.

    recommendation_scores: each of the 8 strategies' prob_class2 score. Low
    margin between the top two = the top recommendation isn't clearly
    better than the runner-up.

    Pure — no model/artifact access — so it's unit-testable without loading
    real_model.pkl.
    """
    eff_sorted = sorted(effectiveness_probs, reverse=True)
    effectiveness_margin = eff_sorted[0] - eff_sorted[1] if len(eff_sorted) > 1 else 1.0

    rec_sorted = sorted(recommendation_scores, reverse=True)
    recommendation_margin = rec_sorted[0] - rec_sorted[1] if len(rec_sorted) > 1 else 1.0

    return (
        effectiveness_margin < EFFECTIVENESS_MARGIN_THRESHOLD
        or recommendation_margin < RECOMMENDATION_MARGIN_THRESHOLD
    )


def predict(raw: dict, strategies_used: list[str]) -> dict:
    """raw: the 11 numeric fields + stress_trigger (see CopingFeaturesIn).
    strategies_used: 1+ strategies the student tried this week.
    Returns the PRIMARY strategy's predicted effectiveness, plus a ranking
    of all 8 strategies scored as if each had been the primary one (so the
    UI can suggest alternatives), same pattern as risk_classification's
    top_features ranking.
    """
    model = _load_artifact()
    primary_strategy = raw["coping_primary_strategy"]

    ranked = []
    for candidate in STRATEGIES:
        X = build_feature_row(raw, strategies_used=strategies_used, primary_strategy=candidate)
        margins = model.decision_function(X)[0]  # shape (n_classes,) for ovr
        probs = _softmax(margins)
        ranked.append({
            "strategy": candidate,
            "icon": STRATEGY_ICONS[candidate],
            "prob_class2": float(probs[2]),
        })
    ranked.sort(key=lambda r: r["prob_class2"], reverse=True)

    X_selected = build_feature_row(raw, strategies_used=strategies_used, primary_strategy=primary_strategy)
    selected_class = int(model.predict(X_selected)[0])
    selected_margins = model.decision_function(X_selected)[0]
    selected_probs = _softmax(selected_margins)

    low_confidence = compute_low_confidence(selected_probs, [r["prob_class2"] for r in ranked])

    return {
        "selected_strategy": primary_strategy,
        "selected_effectiveness": selected_class,
        "selected_probs": {str(i): float(p) for i, p in enumerate(selected_probs)},
        "top_recommendation": ranked[0]["strategy"],
        "top_rec_icon": ranked[0]["icon"],
        "ranked_strategies": ranked,
        "eval_metrics": REPORTED_EVAL_METRICS,
        "low_confidence": low_confidence,
    }
