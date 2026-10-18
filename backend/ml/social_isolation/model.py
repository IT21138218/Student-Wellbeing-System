"""Inference-side loader for the social isolation clustering model."""

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.social_isolation.features import CLUSTER_ICONS, CLUSTER_NAMES, NUMERIC_FEATURES

ARTIFACT_PATH = Path(__file__).parent / "artifacts" / "model.joblib"


class SocialModelNotTrained(RuntimeError):
    pass


@lru_cache
def _load_artifact() -> dict:
    if not ARTIFACT_PATH.exists():
        raise SocialModelNotTrained(
            f"No trained model at {ARTIFACT_PATH}. Run: python -m ml.social_isolation.train"
        )
    return joblib.load(ARTIFACT_PATH)


def predict(features: dict) -> dict:
    artifact = _load_artifact()
    scaler, kmeans = artifact["scaler"], artifact["kmeans"]

    df = pd.DataFrame([{k: features[k] for k in NUMERIC_FEATURES}])
    X_scaled = scaler.transform(df)

    raw_label = int(kmeans.predict(X_scaled)[0])
    semantic_label = artifact["raw_to_semantic"][raw_label]

    distances_raw = kmeans.transform(X_scaled)[0]  # distance to each raw centroid
    cluster_distances = sorted(
        (
            {"cluster": CLUSTER_NAMES[artifact["raw_to_semantic"][raw]], "distance": round(float(d), 2)}
            for raw, d in enumerate(distances_raw)
        ),
        key=lambda x: x["distance"],
    )

    # Peer matching: nearest peers (by Euclidean distance in scaled space) from the pool
    peer_pool = artifact["peer_pool"]
    scored_peers = []
    for peer in peer_pool:
        dist = float(np.linalg.norm(X_scaled[0] - np.array(peer["features_scaled"])))
        scored_peers.append((dist, peer))
    scored_peers.sort(key=lambda x: x[0])
    max_dist = max((d for d, _ in scored_peers), default=1) or 1
    top_peers = [
        {
            "name": peer["name"],
            "cluster": "Socially Integrated",
            "compatibility": round(1 - min(dist / max_dist, 1), 2),
            "shared_strengths": "Similar social & engagement profile",
            "avatar_color": peer["avatar_color"],
        }
        for dist, peer in scored_peers[:3]
    ]

    return {
        "cluster_label": semantic_label,
        "cluster_name": CLUSTER_NAMES[semantic_label],
        "cluster_icon": CLUSTER_ICONS[semantic_label],
        "cluster_profiles": artifact["cluster_profiles"],
        "eval_metrics": artifact["eval_metrics"],
        "cluster_distances": cluster_distances,
        "peer_matches": top_peers,
    }
