"""Unit test for the risk feature engineering (no DB/model needed).
Run: pytest backend/tests -q
"""

from ml.risk_classification.features import ALL_FEATURES, engineer_features


def test_engineer_features_matches_real_formulas():
    raw = {
        "grade": 10, "week": 4, "avg_exam_score": 68, "study_hours": 4.0,
        "homework_completion_rate": 0.8, "attendance_rate": 88, "absence_count": 1,
        "stress_level": 3.5, "anxiety_level": 2, "sleep_hours": 7, "fatigue_level": 2,
        "motivation_level": 4, "confidence_level": 4, "peer_interaction": 4,
        "teacher_support": 4, "class_participation": 4, "teacher_engagement_score": 4,
        "behavior_rating": 4, "academic_stress_index": 0.3, "attendance_stability_index": 0.96,
        "performance_trend_index": 0.1, "behavioral_score": 0.8,
    }
    composite_wellbeing_score = 75.0

    out = engineer_features(raw, composite_wellbeing_score, weekly_volatility=0.0)

    assert list(out.columns) == ALL_FEATURES
    assert out["composite_wellbeing_score"].iloc[0] == 75.0
    assert round(out["risk_indicator_composite"].iloc[0], 3) == round(3.5 * (1 - 88 / 100) * 2, 3)
    assert out["wellbeing_gap"].iloc[0] == 25.0
    assert out["disengagement_score"].iloc[0] == (5 - 4) + (5 - 4) + (5 - 4)
    assert round(out["attendance_absence_ratio"].iloc[0], 2) == round(88 / (1 + 1), 2)
    assert round(out["stress_resilience_ratio"].iloc[0], 2) == round(3.5 / (7 - 3), 2)
    assert out["weekly_volatility"].iloc[0] == 0.0
