"""Feature schema for the REAL social clustering model (Member 3's KMeans,
`Member 3/Social_Peer_Matching/Model Files/best_social_clustering_model.pkl`).

This model clusters STUDENT-LEVEL AGGREGATE profiles (mean/std of survey
answers across a student's multiple weekly check-ins), not one-off
snapshots — see ml/social_peer_matching/model.py for why that means this
module runs in "replay mode" against known students, same reasoning as
ml/wellbeing_forecasting.

Formulas ported verbatim from
`Member 3/Social_Peer_Matching/Model Files/Social_Peer_Matching_&_Isolation_Detection_(Clustering)_ (1).ipynb`
Sections 3 and 7.
"""

# Exact order the scaler/model were fit on (scaler.feature_names_in_).
CLUSTER_FEATURES = [
    "belonging_score_mean", "loneliness_score_mean", "help_seeking_comfort_mean",
    "group_inclusion_mean", "has_support_person_mean", "talks_to_someone_mean",
    "class_support_mean", "peer_helping_mean", "social_perception_score",
    "isolation_index", "support_availability", "class_environment",
    "social_stability", "loneliness_trend",
]

# The trained KMeans has k=2 fixed centroids. Which raw cluster id means
# what is arbitrary (depends on random_state, not semantically ordered),
# so this mapping is derived from the notebook's own Section 7
# `cluster_summary` output (mean isolation_index per cluster: cluster 0
# ≈ higher isolation_index → 'At-Risk / Isolated', cluster 1 → lower →
# 'Moderately Connected') — a property of this specific trained model, not
# a guess. Re-derive this mapping if the model is ever retrained.
CLUSTER_LABELS = {0: "At-Risk / Isolated", 1: "Moderately Connected"}
CLUSTER_ICONS = {0: "🔴", 1: "🟡"}

RECOMMENDATIONS = {
    "At-Risk / Isolated": [
        "Recommend participation in structured group activities (study groups, clubs)",
        "Suggest joining a peer mentoring program",
        "Consider teacher-led small group interactions",
        "Encourage participation in team-based assignments",
    ],
    "Moderately Connected": [
        "Encourage deeper engagement in existing group activities",
        "Suggest trying a new extracurricular activity",
        "Support maintaining current social connections",
    ],
}
