"""Train the risk classifier on the REAL dataset and export it.

Run from backend/:
    python -m ml.risk_classification.train

Loads `Member 1/student_wellbeing_dataset.csv` (real risk_label ground
truth), same real data as ml/wellbeing_indicator. SMOTE matters here more
than it did on synthetic data: the real class distribution is genuinely
imbalanced (LOW 1529, MEDIUM 603, HIGH 268 in the full 2400-row dataset).
"""

import json
from pathlib import Path

import joblib
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.metrics import (
    accuracy_score, classification_report, cohen_kappa_score,
    confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from ml.risk_classification.features import ALL_FEATURES, RAW_FEATURES, engineer_features

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
RISK_ORDER = ["LOW", "MEDIUM", "HIGH"]
DATASET_PATH = Path(__file__).parents[2] / ".." / "Member 1" / "student_wellbeing_dataset.csv"


def load_dataset() -> pd.DataFrame:
    path = DATASET_PATH.resolve()
    if not path.exists():
        raise FileNotFoundError(
            f"Real dataset not found at {path}. Expected 'Member 1/student_wellbeing_dataset.csv' "
            "next to the project root."
        )
    return pd.read_csv(path)


def train() -> dict:
    df = load_dataset()
    X = engineer_features(df[RAW_FEATURES])
    y_enc = LabelEncoder()
    y_enc.fit(RISK_ORDER)
    y = y_enc.transform(df["risk_label"])
    # LabelEncoder sorts alphabetically (HIGH, LOW, MEDIUM) — every metric
    # below must pass `labels=` explicitly or results silently mislabel.
    risk_order_encoded = y_enc.transform(RISK_ORDER)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    scaler = StandardScaler().fit(X_train)
    X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)

    X_train_bal, y_train_bal = SMOTE(random_state=42).fit_resample(X_train_s, y_train)

    ensemble = VotingClassifier(
        estimators=[
            ("rf", RandomForestClassifier(n_estimators=300, max_depth=8, random_state=42)),
            ("gb", GradientBoostingClassifier(n_estimators=200, max_depth=3, random_state=42)),
        ],
        voting="soft",
    )
    ensemble.fit(X_train_bal, y_train_bal)

    y_pred = ensemble.predict(X_test_s)
    y_proba = ensemble.predict_proba(X_test_s)

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, average="macro"),
        "recall": recall_score(y_test, y_pred, average="macro"),
        "f1_score": f1_score(y_test, y_pred, average="macro"),
        "roc_auc": roc_auc_score(y_test, y_proba, multi_class="ovr"),
        "cohen_kappa": cohen_kappa_score(y_test, y_pred),
    }
    cm = confusion_matrix(y_test, y_pred, labels=risk_order_encoded).tolist()
    per_class_f1 = f1_score(y_test, y_pred, labels=risk_order_encoded, average=None)
    class_f1 = {cls: float(f1) for cls, f1 in zip(RISK_ORDER, per_class_f1)}

    print(classification_report(y_test, y_pred, labels=risk_order_encoded, target_names=RISK_ORDER))
    print("Confusion matrix (rows/cols = LOW, MEDIUM, HIGH):\n", cm)
    print("Metrics:", json.dumps(metrics, indent=2))
    if metrics["accuracy"] > 0.97:
        print("\n*** Accuracy > 0.97 — check for leakage the same way wellbeing_indicator's")
        print("*** R²=1.0 was checked, before presenting this as a strong result.\n")

    rf = ensemble.named_estimators_["rf"]
    importances = dict(sorted(
        zip(ALL_FEATURES, rf.feature_importances_), key=lambda kv: kv[1], reverse=True
    ))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": ensemble,
        "scaler": scaler,
        "label_encoder": y_enc,
        "feature_order": ALL_FEATURES,
        "feature_importances": importances,
        "eval_metrics": metrics,
        "confusion_matrix": cm,
        "class_f1": class_f1,
    }, ARTIFACT_DIR / "model.joblib")

    report = {
        "trained_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "dataset": "Member 1/student_wellbeing_dataset.csv (real)",
        "dataset_size": len(df),
        "train_size": len(X_train),
        "test_size": len(X_test),
        "class_distribution": df["risk_label"].value_counts().to_dict(),
        "model": "VotingClassifier(RandomForest + GradientBoosting, soft voting) + SMOTE",
        "eval_metrics": metrics,
        "class_f1": class_f1,
        "confusion_matrix": {"labels": RISK_ORDER, "matrix": cm},
        "feature_importances": importances,
    }
    with open(ARTIFACT_DIR / "training_report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Saved model to {ARTIFACT_DIR / 'model.joblib'}")
    return metrics


if __name__ == "__main__":
    train()
