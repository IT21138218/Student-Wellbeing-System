"""Train the coping strategy effectiveness classifier.

Run from backend/:
    python -m ml.coping_recommendation.train

Replace `load_dataset()` with real labeled data (e.g. students rating
how effective a strategy was after trying it) once available — the
pipeline (encode -> RandomForest -> evaluate -> export) stays the same.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, cohen_kappa_score, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml.coping_recommendation.features import (
    CATEGORICAL_FEATURES, NUMERIC_FEATURES, STRATEGIES, TRIGGERS,
)

ARTIFACT_DIR = Path(__file__).parent / "artifacts"

# strategies that plausibly help most with each trigger — used only to
# shape the synthetic training signal, not part of the served model.
_GOOD_MATCH = {
    "Exam Pressure": {"Deep Breathing", "Time Management", "Mindfulness"},
    "Workload": {"Time Management", "Take a Break", "Study Group"},
    "Peer Conflict": {"Talk to a Friend", "Seek Counseling"},
    "Family Pressure": {"Talk to a Friend", "Seek Counseling", "Journaling"},
    "Social Anxiety": {"Deep Breathing", "Mindfulness", "Seek Counseling"},
    "Financial Stress": {"Seek Counseling", "Time Management"},
}


def load_dataset(n: int = 2000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "stress_trigger": rng.choice(TRIGGERS, n),
        "coping_primary_strategy": rng.choice(STRATEGIES, n),
        "belonging_score": rng.uniform(1, 100, n),
        "loneliness_score": rng.uniform(1, 10, n),
        "group_inclusion": rng.uniform(1, 100, n),
        "has_support_person": rng.integers(0, 2, n),
        "talks_to_someone": rng.integers(0, 2, n),
        "break_frequency": rng.uniform(0, 10, n),
        "help_seeking_comfort": rng.uniform(1, 100, n),
        "class_support": rng.uniform(1, 100, n),
        "class_competition": rng.uniform(1, 100, n),
        "peer_helping": rng.uniform(1, 100, n),
    })

    is_good_match = df.apply(
        lambda r: r["coping_primary_strategy"] in _GOOD_MATCH[r["stress_trigger"]], axis=1
    )
    score = (
        is_good_match.astype(float) * 30
        + df.belonging_score * 0.15
        + df.help_seeking_comfort * 0.1
        + df.has_support_person * 10
        + df.talks_to_someone * 8
        - df.loneliness_score * 2
        + rng.normal(0, 12, n)
    )
    df["effectiveness"] = pd.cut(score, bins=[-np.inf, 30, 55, np.inf], labels=[0, 1, 2]).astype(int)
    return df


def train() -> dict:
    df = load_dataset()
    X = df[CATEGORICAL_FEATURES + NUMERIC_FEATURES]
    y = df["effectiveness"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    preprocessor = ColumnTransformer([
        ("cat", OneHotEncoder(categories=[TRIGGERS, STRATEGIES], handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ("num", StandardScaler(), NUMERIC_FEATURES),
    ])

    pipeline = Pipeline([
        ("preprocess", preprocessor),
        ("clf", RandomForestClassifier(n_estimators=300, max_depth=10, random_state=42)),
    ])
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, average="macro"),
        "recall": recall_score(y_test, y_pred, average="macro"),
        "f1_macro": f1_score(y_test, y_pred, average="macro"),
        "roc_auc": roc_auc_score(y_test, y_proba, multi_class="ovr"),
        "cohen_kappa": cohen_kappa_score(y_test, y_pred),
    }
    print("Metrics:", json.dumps(metrics, indent=2))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "eval_metrics": metrics}, ARTIFACT_DIR / "model.joblib")
    print(f"Saved model to {ARTIFACT_DIR / 'model.joblib'}")
    return metrics


if __name__ == "__main__":
    train()
