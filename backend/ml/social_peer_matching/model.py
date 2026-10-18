"""Inference-side loader for the Social Peer Matching / Isolation Detection
model.

Loads Member 3's REAL trained KMeans + StandardScaler (copied from
`Member 3/Social_Peer_Matching/Model Files/`) — no retraining.

DATA SOURCE CAVEAT (same pattern as ml/wellbeing_forecasting): this model
clusters a STUDENT-LEVEL AGGREGATE profile — means/stds of survey answers
across a student's multiple weekly check-ins, plus a loneliness trend
slope. Your live app has no accumulated multi-week survey history yet, so
this serves clustering from the real, already-aggregated 200-student
profile export the notebook itself produced
(`artifacts/student_social_profiles.csv`) as a "replay" demo — genuinely
real data and a genuinely live model call (KMeans.predict() runs for
real), just not YOUR current live users yet. Once real survey history
accumulates in Mongo, `get_student_profile()` is the one function to swap
for a live aggregation query — nothing else changes.
"""

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.social_peer_matching.features import CLUSTER_FEATURES, CLUSTER_ICONS, CLUSTER_LABELS, RECOMMENDATIONS

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "real_model.pkl"
SCALER_PATH = ARTIFACT_DIR / "real_scaler.pkl"
PROFILES_PATH = ARTIFACT_DIR / "student_social_profiles.csv"

# As reported in Member 3/Social_Peer_Matching/Model Files/clustering_results.csv
# (K-Means row — the model actually exported and used here).
REPORTED_EVAL_METRICS = {
    "silhouette_score": 0.395898548345506,
    "calinski_harabasz": 176.7011766829135,
    "davies_bouldin_index": 0.9818106905670055,
    "n_clusters": 2,
}


class SocialModelNotTrained(RuntimeError):
    pass


@lru_cache
def _load_artifact() -> dict:
    if not MODEL_PATH.exists() or not SCALER_PATH.exists():
        raise SocialModelNotTrained(f"Missing real_model.pkl/real_scaler.pkl in {ARTIFACT_DIR}.")
    return {"model": joblib.load(MODEL_PATH), "scaler": joblib.load(SCALER_PATH)}


@lru_cache
def _load_profiles() -> pd.DataFrame:
    if not PROFILES_PATH.exists():
        raise SocialModelNotTrained(f"Missing {PROFILES_PATH.name} in {ARTIFACT_DIR}.")
    return pd.read_csv(PROFILES_PATH)


def list_students() -> list[dict]:
    """All known students with real aggregated survey profiles, for the UI to pick from."""
    df = _load_profiles()
    return [
        {
            "student_id": r.student_id,
            "survey_count": int(r.survey_count),
            "social_group": r.social_group,
            "is_isolated": bool(r.is_isolated),
        }
        for r in df.sort_values("student_id").itertuples()
    ]


def get_student_profile(student_id: str) -> pd.Series:
    """TODO: once live usage accumulates real multi-week survey history,
    replace this lookup with a live aggregation query (mean/std per
    student over their stored CopingFeaturesIn-style weekly check-ins) —
    the contract (a row with CLUSTER_FEATURES + is_isolated) stays
    identical, only the source changes."""
    df = _load_profiles()
    match = df[df["student_id"] == student_id]
    if match.empty:
        raise ValueError(f"No profile found for student_id={student_id!r}.")
    return match.iloc[0]


def detect_from_real_profile(student_id: str, profile: dict) -> dict:
    """Same clustering pipeline as detect_and_match, fed from a real
    student's aggregated CopingRecord history (see real_features.py)
    instead of the CSV replay profile.

    Two real, documented differences from the CSV path — not silently
    approximated:
    - isolation_risk_flag here is cluster-membership ONLY. The CSV path
      also consults an IsolationForest anomaly detector fit on the whole
      200-student training cohort; that artifact was never exported, so
      it can't be replicated for a real student. `anomaly_detector_available`
      is False so the caller/UI can say so rather than imply full parity.
    - Peer matches are drawn from the CSV cohort, not other real students —
      a fresh install won't have enough real eligible students (2+
      check-ins each) to form a meaningful real peer pool.
      `peer_pool` is always "training_cohort" here.
    """
    artifact = _load_artifact()
    profiles = _load_profiles()

    X = pd.DataFrame([profile])[CLUSTER_FEATURES]
    X_scaled = artifact["scaler"].transform(X)

    cluster_id = int(artifact["model"].predict(X_scaled)[0])
    social_group = CLUSTER_LABELS.get(cluster_id, f"Cluster {cluster_id}")
    isolation_risk_flag = social_group == "At-Risk / Isolated"

    distances = artifact["model"].transform(X_scaled)[0]
    cluster_distances = sorted(
        (
            {"cluster": CLUSTER_LABELS.get(i, f"Cluster {i}"), "distance": round(float(d), 2)}
            for i, d in enumerate(distances)
        ),
        key=lambda x: x["distance"],
    )

    others_healthy = profiles[(profiles["is_isolated"] == 0) & (profiles["social_group"] != "At-Risk / Isolated")]
    pool = others_healthy if len(others_healthy) >= 3 else profiles
    pool_scaled = artifact["scaler"].transform(pool[CLUSTER_FEATURES])
    dists = np.linalg.norm(pool_scaled - X_scaled[0], axis=1)
    max_d = dists.max() if len(dists) else 1
    order = np.argsort(dists)[:3]
    peer_matches = [
        {
            "student_id": pool.iloc[i]["student_id"],
            "cluster": pool.iloc[i]["social_group"],
            "compatibility": round(1 - min(dists[i] / max_d, 1), 2) if max_d else 1.0,
        }
        for i in order
    ]

    return {
        "student_id": student_id,
        "cluster_label": cluster_id,
        "cluster_name": social_group,
        "cluster_icon": CLUSTER_ICONS.get(cluster_id, "⚪"),
        "isolation_risk_flag": isolation_risk_flag,
        "anomaly_detector_available": False,
        "peer_pool": "training_cohort",
        "survey_count": int(profile["survey_count"]),
        "profile": {k: round(float(profile[k]), 2) for k in CLUSTER_FEATURES},
        "eval_metrics": REPORTED_EVAL_METRICS,
        "cluster_distances": cluster_distances,
        "peer_matches": peer_matches,
        "recommendations": RECOMMENDATIONS.get(social_group, RECOMMENDATIONS["Moderately Connected"]),
    }


def detect_and_match(student_id: str) -> dict:
    artifact = _load_artifact()
    profiles = _load_profiles()
    student = get_student_profile(student_id)

    X = pd.DataFrame([student[CLUSTER_FEATURES]])[CLUSTER_FEATURES]
    X_scaled = artifact["scaler"].transform(X)

    cluster_id = int(artifact["model"].predict(X_scaled)[0])  # LIVE model call, not a CSV lookup
    social_group = CLUSTER_LABELS.get(cluster_id, f"Cluster {cluster_id}")
    is_isolated_flag = bool(student["is_isolated"])
    isolation_risk_flag = is_isolated_flag or social_group == "At-Risk / Isolated"

    # Distance to each cluster centroid (KMeans.transform gives exactly this).
    distances = artifact["model"].transform(X_scaled)[0]
    cluster_distances = sorted(
        (
            {"cluster": CLUSTER_LABELS.get(i, f"Cluster {i}"), "distance": round(float(d), 2)}
            for i, d in enumerate(distances)
        ),
        key=lambda x: x["distance"],
    )

    # Real peer matching: nearest OTHER students (by scaled Euclidean
    # distance) who are NOT isolation-flagged — genuinely computed from
    # the real 200-student profile export, not fabricated.
    others = profiles[profiles["student_id"] != student_id].copy()
    others_healthy = others[(others["is_isolated"] == 0) & (others["social_group"] != "At-Risk / Isolated")]
    pool = others_healthy if len(others_healthy) >= 3 else others
    pool_scaled = artifact["scaler"].transform(pool[CLUSTER_FEATURES])
    dists = np.linalg.norm(pool_scaled - X_scaled[0], axis=1)
    max_d = dists.max() if len(dists) else 1
    order = np.argsort(dists)[:3]
    peer_matches = [
        {
            "student_id": pool.iloc[i]["student_id"],
            "cluster": pool.iloc[i]["social_group"],
            "compatibility": round(1 - min(dists[i] / max_d, 1), 2) if max_d else 1.0,
        }
        for i in order
    ]

    return {
        "student_id": student_id,
        "cluster_label": cluster_id,
        "cluster_name": social_group,
        "cluster_icon": CLUSTER_ICONS.get(cluster_id, "⚪"),
        "isolation_risk_flag": isolation_risk_flag,
        "anomaly_detector_available": True,  # CSV profile's is_isolated was computed with the real IsolationForest at training time
        "peer_pool": "training_cohort",
        "survey_count": int(student["survey_count"]),
        "profile": {k: round(float(student[k]), 2) for k in CLUSTER_FEATURES},
        "eval_metrics": REPORTED_EVAL_METRICS,
        "cluster_distances": cluster_distances,
        "peer_matches": peer_matches,
        "recommendations": RECOMMENDATIONS.get(social_group, RECOMMENDATIONS["Moderately Connected"]),
    }
