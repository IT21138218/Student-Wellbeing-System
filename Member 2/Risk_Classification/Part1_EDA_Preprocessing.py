# -*- coding: utf-8 -*-
"""
================================================================================
COLAB 3 - PART 1: SETUP, EDA & FEATURE ENGINEERING FOR CLASSIFICATION
================================================================================
AI-Based Student Wellbeing Monitoring System for Sri Lankan Schools
Task: Classify student risk level (LOW / MEDIUM / HIGH)

Unique to this notebook:
- RobustScaler (resistant to outliers)
- SMOTE for class imbalance handling
- Chi-Squared feature selection
- Custom classification-specific feature engineering
================================================================================
"""

# %% [markdown]
# # 3. Risk Level Classification
# 
# ## Objective
# Build a classification model to predict student **risk_label** (LOW / MEDIUM / HIGH)
# from behavioral, academic, and wellbeing features. Early detection of high-risk
# students enables timely intervention by teachers and counselors.
# 
# ## Why Classification?
# The risk label is a categorical variable with 3 ordered classes.
# We use multi-class classification models to predict which risk category
# a student falls into based on their current indicators.

# %%
# ============================================================
# SECTION 1: INSTALL AND IMPORT LIBRARIES
# ============================================================
# !pip install pandas numpy scikit-learn matplotlib seaborn xgboost imbalanced-learn shap

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import RobustScaler, LabelEncoder
from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV, cross_val_score
from sklearn.feature_selection import chi2, SelectKBest
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (classification_report, confusion_matrix, accuracy_score,
                             f1_score, roc_auc_score, roc_curve, auc, precision_recall_curve,
                             cohen_kappa_score, matthews_corrcoef)
from sklearn.decomposition import PCA
import warnings
warnings.filterwarnings('ignore')

# Check if optional libraries are available
try:
    from imblearn.over_sampling import SMOTE
    HAS_SMOTE = True
    print("[OK] imbalanced-learn loaded (SMOTE available)")
except ImportError:
    HAS_SMOTE = False
    print("[WARN] imbalanced-learn not found. Install with: pip install imbalanced-learn")

try:
    import xgboost as xgb
    HAS_XGB = True
    print("[OK] XGBoost loaded")
except ImportError:
    HAS_XGB = False
    print("[WARN] XGBoost not found. Install with: pip install xgboost")

try:
    import shap
    HAS_SHAP = True
    print("[OK] SHAP loaded")
except ImportError:
    HAS_SHAP = False
    print("[WARN] SHAP not found. Install with: pip install shap")

plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

print("\n" + "=" * 60)
print("COLAB 3: RISK LEVEL CLASSIFICATION")
print("=" * 60)

# %%
# ============================================================
# SECTION 2: LOAD AND INSPECT DATA
# ============================================================
df = pd.read_csv('student_wellbeing_dataset.csv')

print(f"Dataset shape: {df.shape}")
print(f"\nRisk Label Distribution:")
print(df['risk_label'].value_counts())
print(f"\nPercentages:")
print((df['risk_label'].value_counts(normalize=True) * 100).round(1))

# %%
# ============================================================
# EDA CHART 1: CLASS DISTRIBUTION (Critical for Classification)
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
colors = {'LOW': '#2ecc71', 'MEDIUM': '#f39c12', 'HIGH': '#e74c3c'}
counts = df['risk_label'].value_counts()

# Bar chart with percentages
bars = axes[0].bar(counts.index, counts.values, 
                   color=[colors[l] for l in counts.index], edgecolor='white')
for bar, count in zip(bars, counts.values):
    pct = count / len(df) * 100
    axes[0].text(bar.get_x() + bar.get_width()/2, bar.get_height() + 10,
                 f'{count}\n({pct:.1f}%)', ha='center', fontweight='bold')
axes[0].set_title('Risk Label Distribution (Imbalanced)', fontweight='bold')
axes[0].set_ylabel('Count')

# Show wellbeing score distribution per class
for label in ['LOW', 'MEDIUM', 'HIGH']:
    data = df[df['risk_label'] == label]['composite_wellbeing_score']
    axes[1].hist(data, bins=25, alpha=0.5, color=colors[label], label=label, density=True)
axes[1].set_title('Wellbeing Score by Risk Class', fontweight='bold')
axes[1].set_xlabel('Composite Wellbeing Score')
axes[1].legend()

plt.tight_layout()
plt.savefig('c3_chart1_class_distribution.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EDA CHART 2: KEY FEATURES BY RISK CLASS
# ============================================================
features_to_compare = ['stress_level', 'avg_exam_score', 'attendance_rate',
                       'sleep_hours', 'motivation_level', 'fatigue_level']

fig, axes = plt.subplots(2, 3, figsize=(18, 10))
axes = axes.flatten()
order = ['LOW', 'MEDIUM', 'HIGH']

for i, feat in enumerate(features_to_compare):
    for label in order:
        data = df[df['risk_label'] == label][feat]
        axes[i].hist(data, bins=20, alpha=0.5, color=colors[label], label=label, density=True)
    axes[i].set_title(f'{feat} by Risk Level', fontweight='bold')
    axes[i].legend()

fig.suptitle('Feature Distributions Across Risk Classes', fontsize=16, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig('c3_chart2_features_by_risk.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# SECTION 3: CLASSIFICATION-SPECIFIC FEATURE ENGINEERING
# ============================================================
print("\n" + "=" * 60)
print("SECTION 3: FEATURE ENGINEERING (Classification-Specific)")
print("=" * 60)

# Feature 1: Risk Indicator Composite
# Combines stress, poor attendance, and fatigue into a single risk signal
df['risk_indicator_composite'] = (
    df['stress_level'] * (1 - df['attendance_rate'] / 100) * df['fatigue_level']
)
print(f"[+] risk_indicator_composite (mean: {df['risk_indicator_composite'].mean():.2f})")

# Feature 2: Wellbeing Gap
# How far the student is from the maximum possible wellbeing score
df['wellbeing_gap'] = 100 - df['composite_wellbeing_score']
print(f"[+] wellbeing_gap (mean: {df['wellbeing_gap'].mean():.2f})")

# Feature 3: Disengagement Score
# Sum of deficits in engagement metrics
df['disengagement_score'] = (
    (5 - df['motivation_level']) + 
    (5 - df['class_participation']) + 
    (5 - df['teacher_engagement_score'])
)
print(f"[+] disengagement_score (mean: {df['disengagement_score'].mean():.2f})")

# Feature 4: Attendance-Absence Ratio
df['attendance_absence_ratio'] = df['attendance_rate'] / (df['absence_count'] + 1)
print(f"[+] attendance_absence_ratio (mean: {df['attendance_absence_ratio'].mean():.2f})")

# Feature 5: Stress-Resilience Ratio
# How much stress relative to recovery capacity (sleep)
df['stress_resilience_ratio'] = df['stress_level'] / (df['sleep_hours'] - 3)
print(f"[+] stress_resilience_ratio (mean: {df['stress_resilience_ratio'].mean():.2f})")

# Feature 6: Weekly Volatility (per student)
# How unstable is the student's wellbeing over weeks
volatility = df.groupby('student_id')['composite_wellbeing_score'].std().reset_index()
volatility.columns = ['student_id', 'weekly_volatility']
df = df.merge(volatility, on='student_id', how='left')
print(f"[+] weekly_volatility (mean: {df['weekly_volatility'].mean():.2f})")

# %%
# ============================================================
# SECTION 4: DATA PREPROCESSING
# ============================================================
print("\n" + "=" * 60)
print("SECTION 4: PREPROCESSING (RobustScaler + SMOTE)")
print("=" * 60)

# Encode target variable (ordinal: LOW=0, MEDIUM=1, HIGH=2)
le = LabelEncoder()
# Custom ordering to preserve risk severity
label_mapping = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
df['risk_encoded'] = df['risk_label'].map(label_mapping)

# Prepare features
drop_cols = ['student_id', 'risk_label', 'risk_encoded', 'next_week_wellbeing_score']
feature_cols = [c for c in df.columns if c not in drop_cols]
X = df[feature_cols].copy()
y = df['risk_encoded'].copy()

print(f"Features: {X.shape[1]}")
print(f"Samples: {X.shape[0]}")
print(f"\nClass distribution before SMOTE:")
print(y.value_counts().sort_index())

# %%
# --- Chi-Squared Feature Selection ---
# Select the top features most relevant to the categorical target
# Chi-squared test measures dependency between features and target

# Scale features to positive values for chi2 (using MinMax temporarily)
from sklearn.preprocessing import MinMaxScaler
X_pos = MinMaxScaler().fit_transform(X)

chi2_scores, p_values = chi2(X_pos, y)
chi2_df = pd.DataFrame({
    'Feature': X.columns,
    'Chi2_Score': chi2_scores,
    'P_Value': p_values
}).sort_values('Chi2_Score', ascending=False)

print("\n--- Chi-Squared Feature Selection ---")
print("Top 15 features:")
print(chi2_df.head(15).to_string(index=False))

# Select top features (p_value < 0.05)
significant_features = chi2_df[chi2_df['P_Value'] < 0.05]['Feature'].tolist()
print(f"\nSignificant features (p < 0.05): {len(significant_features)}")

# Visualize Chi-Squared scores
fig, ax = plt.subplots(figsize=(10, 8))
top_chi2 = chi2_df.head(20)
ax.barh(top_chi2['Feature'], top_chi2['Chi2_Score'], color='#9b59b6', edgecolor='white')
ax.set_title('Chi-Squared Feature Importance for Risk Classification', fontweight='bold')
ax.set_xlabel('Chi-Squared Score')
ax.invert_yaxis()
plt.tight_layout()
plt.savefig('c3_chart3_chi2_selection.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# --- Stratified Train/Test Split ---
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"\n--- Stratified Split ---")
print(f"Train: {X_train.shape[0]} | Test: {X_test.shape[0]}")
print(f"Train class distribution:\n{y_train.value_counts().sort_index()}")
print(f"Test class distribution:\n{y_test.value_counts().sort_index()}")

# --- RobustScaler ---
# Uses median and IQR (not mean/std), making it robust to outliers
# This is unique to Colab 3 (Colab 1 uses MinMaxScaler, Colab 4 uses StandardScaler)
robust_scaler = RobustScaler()
X_train_scaled = pd.DataFrame(
    robust_scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index
)
X_test_scaled = pd.DataFrame(
    robust_scaler.transform(X_test), columns=X_test.columns, index=X_test.index
)
print("\n[OK] RobustScaler applied")

# --- SMOTE (Synthetic Minority Oversampling) ---
# Creates synthetic samples for minority classes (MEDIUM, HIGH)
# This balances the dataset so the model doesn't become biased toward LOW
if HAS_SMOTE:
    smote = SMOTE(random_state=42)
    X_train_resampled, y_train_resampled = smote.fit_resample(X_train_scaled, y_train)
    print(f"\n[OK] SMOTE applied")
    print(f"Before SMOTE: {dict(y_train.value_counts().sort_index())}")
    print(f"After SMOTE:  {dict(pd.Series(y_train_resampled).value_counts().sort_index())}")
else:
    X_train_resampled, y_train_resampled = X_train_scaled, y_train
    print("[SKIP] SMOTE not available, using original distribution")

print("\n" + "=" * 60)
print("PART 1 COMPLETE: EDA & Preprocessing done!")
print("Proceed to Part 2 for Model Training & Evaluation.")
print("=" * 60)
