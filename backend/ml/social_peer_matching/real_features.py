"""Real-student feature building for Social Isolation Detection.

The CSV path (features.py / model.py) is untouched — it stays the default
"replay" demo over the training cohort. This is the parallel path that
turns a real student's stored CopingRecord history into the same 14-column
aggregate profile the fitted KMeans/scaler expect.

IMPORTANT — this is NOT WellbeingAssessment data. The 8 base survey fields
(belonging_score, loneliness_score, help_seeking_comfort, group_inclusion,
has_support_person, talks_to_someone, class_support, peer_helping) don't
exist on the Wellbeing Indicator's 22-field schema at all — they're Coping
Strategies' fields (see app/models/coping.py's CopingFeaturesIn). Verified
against the actual fitted scaler's feature_names_in_ and the training
notebook (`Social_Peer_Matching_&_Isolation_Detection_(Clustering)_.ipynb`,
Section 3) before writing this, not assumed by analogy with Forecasting.

Formulas ported verbatim from that notebook's Section 3 cell:
    social_perception_score = (belonging_mean + group_inclusion_mean
                                + help_seeking_comfort_mean - loneliness_mean) / 4
    isolation_index          = (5 - belonging_mean) + loneliness_mean + (5 - group_inclusion_mean)
    support_availability     = has_support_person_mean + talks_to_someone_mean
    class_environment        = class_support_mean + peer_helping_mean - class_competition_mean
    social_stability          = belonging_std + loneliness_std
    loneliness_trend          = slope of loneliness_score over sequential check-ins
                                 (np.polyfit degree 1; 0 with fewer than 2 points)

One real, documented gap: the CSV path's isolation_risk_flag combines the
KMeans cluster AND an IsolationForest anomaly detector fit on the whole
200-student cohort at training time. Only the KMeans model + scaler were
exported (real_model.pkl / real_scaler.pkl) — no IsolationForest artifact
exists. The real-student path can only use cluster membership; see
model.py's detect_from_real_profile for how that's surfaced, not hidden.
"""

import numpy as np

from ml.social_peer_matching.features import CLUSTER_FEATURES

# Below this many check-ins, social_stability (a std) and loneliness_trend
# (a slope) are degenerate — std of one value is undefined (0 after
# fillna, same as the notebook), and a slope needs at least 2 points to
# mean anything. Two check-ins is the minimum where every one of the 14
# features reflects real signal rather than a fallback.
MIN_HISTORY_WEEKS = 2

_MEAN_FIELDS = [
    "belonging_score", "loneliness_score", "help_seeking_comfort", "group_inclusion",
    "has_support_person", "talks_to_someone", "class_support", "peer_helping",
]


def build_real_social_profile(records: list) -> dict:
    """records: a student's CopingRecord documents (any order) — each
    record's .features dict must carry the 9 raw fields above plus
    class_competition (needed only for class_environment, not itself a
    CLUSTER_FEATURE). Returns a dict with all 14 CLUSTER_FEATURES plus
    survey_count, column-for-column identical in meaning to the CSV
    profile export's columns.

    Raises ValueError below MIN_HISTORY_WEEKS — callers should check
    eligibility first and return a 200 progress response instead.
    """
    if len(records) < MIN_HISTORY_WEEKS:
        raise ValueError(f"Need at least {MIN_HISTORY_WEEKS} check-ins to profile; got {len(records)}.")

    feats = [r.features for r in records]
    means = {f"{f}_mean": float(np.mean([row[f] for row in feats])) for f in _MEAN_FIELDS}
    class_competition_mean = float(np.mean([row["class_competition"] for row in feats]))

    # ddof=1 (sample std) matches pandas' default .std() the notebook used
    # via DataFrame.agg — with exactly 2 points this is well-defined (not
    # the degenerate n=1 NaN case), consistent with MIN_HISTORY_WEEKS=2.
    belonging_std = float(np.std([row["belonging_score"] for row in feats], ddof=1))
    loneliness_std = float(np.std([row["loneliness_score"] for row in feats], ddof=1))

    social_perception_score = (
        means["belonging_score_mean"] + means["group_inclusion_mean"]
        + means["help_seeking_comfort_mean"] - means["loneliness_score_mean"]
    ) / 4
    isolation_index = (
        (5 - means["belonging_score_mean"]) + means["loneliness_score_mean"]
        + (5 - means["group_inclusion_mean"])
    )
    support_availability = means["has_support_person_mean"] + means["talks_to_someone_mean"]
    class_environment = means["class_support_mean"] + means["peer_helping_mean"] - class_competition_mean
    social_stability = belonging_std + loneliness_std
    loneliness_trend = compute_loneliness_trend(feats)

    profile = {
        **means,
        "social_perception_score": social_perception_score,
        "isolation_index": isolation_index,
        "support_availability": support_availability,
        "class_environment": class_environment,
        "social_stability": social_stability,
        "loneliness_trend": loneliness_trend,
        "survey_count": len(records),
    }
    # Order must match CLUSTER_FEATURES exactly for the scaler.
    ordered = {k: profile[k] for k in CLUSTER_FEATURES}
    ordered["survey_count"] = profile["survey_count"]
    return ordered


def compute_loneliness_trend(feats_in_order: list) -> float:
    """feats_in_order: each record's .features dict, in check-in sequence
    order (oldest first). Verbatim port of the notebook's compute_slope()."""
    if len(feats_in_order) < 2:
        return 0.0
    y = np.array([row["loneliness_score"] for row in feats_in_order], dtype=float)
    x = np.arange(len(y))
    return float(np.polyfit(x, y, 1)[0])
