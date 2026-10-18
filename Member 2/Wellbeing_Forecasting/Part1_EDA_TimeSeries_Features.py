# -*- coding: utf-8 -*-
"""
================================================================================
COLAB 4 - PART 1: SETUP, EDA & TIME-SERIES FEATURE ENGINEERING
================================================================================
AI-Based Student Wellbeing Monitoring System for Sri Lankan Schools
Task: Forecast next_week_wellbeing_score using historical weekly data

Unique to this notebook:
- Temporal train/test split (NO random split — time matters!)
- Lag features, rolling statistics, exponential moving averages
- Sequence windowing for LSTM/GRU
- StandardScaler (fitted on train only to prevent leakage)
================================================================================
"""

# %% [markdown]
# # 4. Wellbeing Forecasting (Time-Series)
# 
# ## Objective
# Predict a student's **next_week_wellbeing_score** based on their current
# and historical weekly data. This enables proactive intervention — if we
# predict a student's wellbeing will decline next week, we can act early.
# 
# ## Why Time-Series?
# Unlike Colab 1 (static regression) and Colab 3 (classification), this task
# uses **temporal patterns** — how features change over weeks — to predict the future.

# %%
# ============================================================
# SECTION 1: INSTALL AND IMPORT LIBRARIES
# ============================================================
# !pip install pandas numpy scikit-learn matplotlib seaborn xgboost lightgbm tensorflow

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

try:
    import xgboost as xgb
    HAS_XGB = True
    print("[OK] XGBoost loaded")
except: HAS_XGB = False; print("[WARN] XGBoost not found")

try:
    import lightgbm as lgb
    HAS_LGB = True
    print("[OK] LightGBM loaded")
except: HAS_LGB = False; print("[WARN] LightGBM not found")

try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, GRU, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping
    HAS_TF = True
    print("[OK] TensorFlow loaded")
except: HAS_TF = False; print("[WARN] TensorFlow not found")

plt.style.use('seaborn-v0_8-whitegrid')

print("\n" + "=" * 60)
print("COLAB 4: WELLBEING FORECASTING (TIME-SERIES)")
print("=" * 60)

# %%
# ============================================================
# SECTION 2: LOAD AND INSPECT DATA
# ============================================================
df = pd.read_csv('student_wellbeing_dataset.csv')
print(f"Dataset shape: {df.shape}")
print(f"Students: {df['student_id'].nunique()}")
print(f"Weeks per student: {df['week'].nunique()}")
print(f"\nTarget: next_week_wellbeing_score")
print(f"  Range: [{df['next_week_wellbeing_score'].min():.1f}, {df['next_week_wellbeing_score'].max():.1f}]")
print(f"  Mean: {df['next_week_wellbeing_score'].mean():.2f}")

# %%
# ============================================================
# EDA CHART 1: WELLBEING TRAJECTORIES (Multiple Students)
# ============================================================
fig, axes = plt.subplots(2, 2, figsize=(16, 10))
axes = axes.flatten()

# Plot 4 different student types
sample_ids = df['student_id'].unique()
np.random.seed(42)
selected = np.random.choice(sample_ids, 12, replace=False)

titles = ['Students 1-3', 'Students 4-6', 'Students 7-9', 'Students 10-12']
colors_ts = plt.cm.Set2(np.linspace(0, 1, 3))

for idx in range(4):
    for j in range(3):
        sid = selected[idx * 3 + j]
        student = df[df['student_id'] == sid].sort_values('week')
        axes[idx].plot(student['week'], student['composite_wellbeing_score'],
                       marker='o', linewidth=2, color=colors_ts[j],
                       label=f'{sid} (G{student["grade"].iloc[0]})')
    axes[idx].set_title(titles[idx], fontweight='bold')
    axes[idx].set_xlabel('Week')
    axes[idx].set_ylabel('Wellbeing Score')
    axes[idx].set_xticks(range(1, 9))
    axes[idx].legend(fontsize=8)
    axes[idx].grid(True, alpha=0.3)

fig.suptitle('Student Wellbeing Trajectories Over 8 Weeks', fontsize=16, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig('c4_chart1_trajectories.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EDA CHART 2: CURRENT vs NEXT WEEK WELLBEING
# ============================================================
fig, ax = plt.subplots(figsize=(10, 6))
ax.scatter(df['composite_wellbeing_score'], df['next_week_wellbeing_score'],
           alpha=0.3, s=10, color='#3498db')
ax.plot([20, 100], [20, 100], 'r--', linewidth=2, label='No Change Line')
r = df['composite_wellbeing_score'].corr(df['next_week_wellbeing_score'])
ax.set_title(f'Current vs Next Week Wellbeing (r = {r:.3f})', fontweight='bold')
ax.set_xlabel('Current Week Wellbeing Score')
ax.set_ylabel('Next Week Wellbeing Score')
ax.legend()
plt.tight_layout()
plt.savefig('c4_chart2_current_vs_next.png', dpi=150, bbox_inches='tight')
plt.show()

# %% [markdown]
# ---
# ## Section 3: Time-Series Feature Engineering
# 
# This is the **most unique part** of this notebook. We create temporal
# features that capture how a student's indicators change over time.

# %%
# ============================================================
# SECTION 3: TIME-SERIES FEATURE ENGINEERING
# ============================================================
print("\n" + "=" * 60)
print("SECTION 3: TIME-SERIES FEATURE ENGINEERING")
print("=" * 60)

# Sort by student and week for proper lag computation
df = df.sort_values(['student_id', 'week']).reset_index(drop=True)

# --- Lag Features (previous week values) ---
for col in ['composite_wellbeing_score', 'avg_exam_score', 'stress_level', 'attendance_rate']:
    df[f'{col}_lag1'] = df.groupby('student_id')[col].shift(1)
    df[f'{col}_lag2'] = df.groupby('student_id')[col].shift(2)
    print(f"[+] {col}_lag1, {col}_lag2")

# --- Rolling Statistics (3-week window) ---
for col in ['composite_wellbeing_score', 'stress_level']:
    df[f'{col}_rolling_mean3'] = df.groupby('student_id')[col].transform(
        lambda x: x.rolling(3, min_periods=1).mean()
    )
    df[f'{col}_rolling_std3'] = df.groupby('student_id')[col].transform(
        lambda x: x.rolling(3, min_periods=1).std()
    )
    print(f"[+] {col}_rolling_mean3, {col}_rolling_std3")

# --- Delta Features (week-over-week change) ---
df['score_delta'] = df.groupby('student_id')['avg_exam_score'].diff()
df['stress_delta'] = df.groupby('student_id')['stress_level'].diff()
df['wellbeing_delta'] = df.groupby('student_id')['composite_wellbeing_score'].diff()
print("[+] score_delta, stress_delta, wellbeing_delta")

# --- Momentum (direction of change) ---
df['momentum'] = df['composite_wellbeing_score_lag1'] - df['composite_wellbeing_score_lag2']
print("[+] momentum")

# --- Cumulative Stress (burden over time) ---
df['cumulative_stress_3w'] = df.groupby('student_id')['stress_level'].transform(
    lambda x: x.rolling(3, min_periods=1).sum()
)
print("[+] cumulative_stress_3w")

# --- Attendance Trend (slope over last 3 weeks) ---
def rolling_slope(series, window=3):
    result = []
    for i in range(len(series)):
        if i < window - 1:
            result.append(0)
        else:
            y = series.iloc[i-window+1:i+1].values
            x = np.arange(window)
            if len(y) == window:
                slope, _, _, _, _ = stats.linregress(x, y)
                result.append(slope)
            else:
                result.append(0)
    return pd.Series(result, index=series.index)

df['attendance_trend'] = df.groupby('student_id')['attendance_rate'].transform(
    lambda x: rolling_slope(x, 3)
)
print("[+] attendance_trend")

# --- Exponential Moving Average ---
df['wellbeing_ema'] = df.groupby('student_id')['composite_wellbeing_score'].transform(
    lambda x: x.ewm(alpha=0.3, min_periods=1).mean()
)
print("[+] wellbeing_ema")

# Fill NaN from lag/rolling operations
df = df.fillna(0)
print(f"\nTotal features after engineering: {len(df.columns)}")
print(f"NaN values remaining: {df.isnull().sum().sum()}")

# %%
# ============================================================
# SECTION 4: TEMPORAL TRAIN/TEST SPLIT
# ============================================================
# CRITICAL: We split by TIME, not randomly!
# Train: Weeks 1-6, Test: Weeks 7-8
# This prevents data leakage from future to past

print("\n" + "=" * 60)
print("SECTION 4: TEMPORAL SPLIT")
print("=" * 60)

train_mask = df['week'] <= 6
test_mask = df['week'] >= 7

drop_cols = ['student_id', 'risk_label', 'next_week_wellbeing_score']
feature_cols = [c for c in df.columns if c not in drop_cols]
target = 'next_week_wellbeing_score'

X_train = df.loc[train_mask, feature_cols]
y_train = df.loc[train_mask, target]
X_test = df.loc[test_mask, feature_cols]
y_test = df.loc[test_mask, target]

print(f"Train (weeks 1-6): {X_train.shape[0]} samples")
print(f"Test  (weeks 7-8): {X_test.shape[0]} samples")
print(f"Features: {X_train.shape[1]}")

# StandardScaler (fitted on train only - prevent data leakage)
std_scaler = StandardScaler()
X_train_scaled = pd.DataFrame(std_scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
X_test_scaled = pd.DataFrame(std_scaler.transform(X_test), columns=X_test.columns, index=X_test.index)
print("\n[OK] StandardScaler applied (fitted on train only)")

print("\n" + "=" * 60)
print("PART 1 COMPLETE: Time-series preprocessing done!")
print("Proceed to Part 2 for Model Training & Evaluation.")
print("=" * 60)
