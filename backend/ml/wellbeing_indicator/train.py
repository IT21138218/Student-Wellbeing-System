"""Train the Wellbeing Indicator regressor from the REAL dataset.

Run from backend/:
    python -m ml.wellbeing_indicator.train

This is an ALTERNATIVE to the pre-trained artifacts copied from Member 1's
notebook (real_model.pkl / real_scaler.pkl, which ml/wellbeing_indicator/
model.py loads by default). Running this script overwrites those with a
freshly trained RandomForest+GradientBoosting ensemble on the same real
`student_wellbeing_dataset.csv` — useful to sanity-check the notebook's
suspicious R²=1.0000 result (see model.py's leakage caveat) with a
different model family. If this also lands near R²=1.0, that confirms the
issue is in the dataset's generation, not the choice of Lasso.
"""

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor, VotingRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from ml.wellbeing_indicator.features import ALL_FEATURES, RAW_FEATURES, engineer_features

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
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
    y = df["composite_wellbeing_score"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    scaler = StandardScaler().fit(X_train)
    X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)

    ensemble = VotingRegressor([
        ("rf", RandomForestRegressor(n_estimators=300, max_depth=8, random_state=42)),
        ("gb", GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=42)),
    ])
    ensemble.fit(X_train_s, y_train)

    y_pred = ensemble.predict(X_test_s)
    metrics = {
        "mae": float(mean_absolute_error(y_test, y_pred)),
        "rmse": float(mean_squared_error(y_test, y_pred) ** 0.5),
        "r_squared": float(r2_score(y_test, y_pred)),
        "mape": float(mean_absolute_percentage_error(y_test, y_pred) * 100),
    }
    print("Metrics (ensemble, real data):", json.dumps(metrics, indent=2))
    if metrics["r_squared"] > 0.99:
        print("\n*** R² > 0.99 with a DIFFERENT model family too — this confirms the leakage")
        print("*** is in how composite_wellbeing_score was generated in the dataset itself,")
        print("*** not an artifact of picking Lasso. Worth addressing before presenting results.\n")

    rf = ensemble.named_estimators_["rf"]
    importances = dict(sorted(zip(ALL_FEATURES, rf.feature_importances_), key=lambda kv: kv[1], reverse=True))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": ensemble, "scaler": scaler, "feature_order": ALL_FEATURES,
        "feature_importances": importances, "eval_metrics": metrics,
    }, ARTIFACT_DIR / "ensemble_model.joblib")

    print(f"Saved to {ARTIFACT_DIR / 'ensemble_model.joblib'} (does not overwrite real_model.pkl)")
    return metrics


if __name__ == "__main__":
    train()
