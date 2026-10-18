"""Feature schema for social isolation clustering.

Mirrors frontend/src/components/SocialIsolation.jsx.
"""

NUMERIC_FEATURES = [
    "belonging_score", "loneliness_score", "help_seeking_comfort",
    "has_support_person", "talks_to_someone", "class_support",
    "group_inclusion", "peer_helping", "class_competition", "extracurricular",
]

CLUSTER_NAMES = {0: "Socially Integrated", 1: "At-Risk / Marginal", 2: "Isolated"}
CLUSTER_ICONS = {0: "🤝", 1: "⚠️", 2: "🔴"}
