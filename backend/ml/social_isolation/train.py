"""Train the social isolation clustering model (unsupervised).

Run from backend/:
    python -m ml.social_isolation.train

Replace `load_dataset()` with real student social-survey data once
available. KMeans cluster ids are arbitrary on each fit, so we relabel
clusters 0/1/2 by mean loneliness_score (ascending) to keep
"Socially Integrated" / "At-Risk" / "Isolated" consistent run to run.

Also builds a small synthetic peer pool (students in the "Integrated"
cluster) used for peer-matching at inference time.
TODO: replace the synthetic peer pool with a real query against the
`students` collection filtered to students whose latest assessment
landed in the Integrated cluster.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler

from ml.social_isolation.features import CLUSTER_NAMES, NUMERIC_FEATURES

ARTIFACT_DIR = Path(__file__).parent / "artifacts"

FIRST_NAMES = ["Alex", "Sam", "Taylor", "Jordan", "Morgan", "Casey", "Riley", "Avery"]
LAST_NAMES = ["Johnson", "Smith", "Doe", "Lee", "Perera", "Fernando", "Silva", "Kumar"]
AVATAR_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"]


def load_dataset(n: int = 1500, seed: int = 42) -> pd.DataFrame:
    """Synthetic data built from 3 latent social-engagement archetypes
    (integrated / marginal / isolated) with per-student noise, so the
    clusters KMeans finds are actually separable — pure uniform-random
    features would give near-zero silhouette and defeat the demo.
    Swap for a real student social survey once available.
    """
    rng = np.random.default_rng(seed)
    # (belonging, loneliness, help_seeking, support_prob, talks_prob, class_support, inclusion, peer_help, competition, extracurricular)
    archetypes = [
        (78, 2.5, 72, 0.85, 0.80, 74, 76, 70, 50, 65),  # integrated
        (50, 5.5, 44, 0.50, 0.50, 50, 48, 46, 55, 35),  # marginal
        (24, 8.0, 22, 0.15, 0.15, 27, 21, 20, 55, 15),  # isolated
    ]
    weights = [0.45, 0.35, 0.20]  # class balance
    choice = rng.choice(3, size=n, p=weights)

    continuous_idx = [0, 1, 2, 5, 6, 7, 8, 9]  # all except support_prob/talks_prob
    rows = []
    for c in choice:
        base = archetypes[c]
        row = list(base)
        for i in continuous_idx:
            row[i] = float(np.clip(base[i] + rng.normal(0, 8), 0, 100))
        row[3] = int(rng.random() < base[3])  # has_support_person
        row[4] = int(rng.random() < base[4])  # talks_to_someone
        rows.append(row)

    df = pd.DataFrame(rows, columns=[
        "belonging_score", "loneliness_score", "help_seeking_comfort",
        "has_support_person", "talks_to_someone", "class_support",
        "group_inclusion", "peer_helping", "class_competition", "extracurricular",
    ])
    df["loneliness_score"] = df["loneliness_score"].clip(1, 10)
    return df


def train() -> dict:
    df = load_dataset()
    X = df[NUMERIC_FEATURES]

    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)

    kmeans = KMeans(n_clusters=3, n_init=10, random_state=42).fit(X_scaled)
    raw_labels = kmeans.labels_

    metrics = {
        "silhouette_score": float(silhouette_score(X_scaled, raw_labels)),
        "davies_bouldin_index": float(davies_bouldin_score(X_scaled, raw_labels)),
        "calinski_harabasz": float(calinski_harabasz_score(X_scaled, raw_labels)),
        "n_clusters": 3,
    }
    print("Metrics:", json.dumps(metrics, indent=2))

    # Relabel raw KMeans cluster ids -> semantic 0/1/2 by mean loneliness (ascending)
    df["raw_cluster"] = raw_labels
    order = df.groupby("raw_cluster")["loneliness_score"].mean().sort_values().index.tolist()
    raw_to_semantic = {raw: semantic for semantic, raw in enumerate(order)}
    df["semantic_cluster"] = df["raw_cluster"].map(raw_to_semantic)

    cluster_profiles = []
    for semantic_id, name in CLUSTER_NAMES.items():
        rows = df[df["semantic_cluster"] == semantic_id]
        centroids = {f: round(float(rows[f].mean()), 1) for f in NUMERIC_FEATURES}
        cluster_profiles.append({"id": semantic_id, "name": name, "centroids": centroids})

    # Synthetic peer pool drawn from the "Integrated" cluster (semantic id 0)
    rng = np.random.default_rng(7)
    integrated_rows = df[df["semantic_cluster"] == 0].sample(n=min(30, (df["semantic_cluster"] == 0).sum()), random_state=7)
    peer_pool = []
    for i, (_, row) in enumerate(integrated_rows.iterrows()):
        peer_pool.append({
            "name": f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}",
            "avatar_color": AVATAR_COLORS[i % len(AVATAR_COLORS)],
            "features_scaled": scaler.transform(row[NUMERIC_FEATURES].to_frame().T)[0].tolist(),
        })

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "scaler": scaler,
        "kmeans": kmeans,
        "raw_to_semantic": raw_to_semantic,
        "cluster_profiles": cluster_profiles,
        "eval_metrics": metrics,
        "peer_pool": peer_pool,
    }, ARTIFACT_DIR / "model.joblib")

    print(f"Saved model to {ARTIFACT_DIR / 'model.joblib'}")
    return metrics


if __name__ == "__main__":
    train()
