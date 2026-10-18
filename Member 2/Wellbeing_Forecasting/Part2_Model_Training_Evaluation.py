# -*- coding: utf-8 -*-
"""
================================================================================
COLAB 4 - PART 2: MODEL TRAINING, EVALUATION & COMPARISON
================================================================================
Models: Linear Regression, XGBoost, LightGBM, LSTM, GRU
Evaluation: MAE, RMSE, R2, MASE, Directional Accuracy
Charts: Trajectories, Error Distribution, Loss Curves, Model Comparison
================================================================================
"""

# %%
# ============================================================
# SETUP (Run after Part 1 or standalone)
# ============================================================
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from scipy import stats
import joblib
import warnings
warnings.filterwarnings('ignore')

try:
    import xgboost as xgb; HAS_XGB = True
except: HAS_XGB = False
try:
    import lightgbm as lgb; HAS_LGB = True
except: HAS_LGB = False
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, GRU, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping
    HAS_TF = True
except: HAS_TF = False

plt.style.use('seaborn-v0_8-whitegrid')

# --- Recreate full pipeline ---
df = pd.read_csv('student_wellbeing_dataset.csv')
df = df.sort_values(['student_id', 'week']).reset_index(drop=True)

for col in ['composite_wellbeing_score', 'avg_exam_score', 'stress_level', 'attendance_rate']:
    df[f'{col}_lag1'] = df.groupby('student_id')[col].shift(1)
    df[f'{col}_lag2'] = df.groupby('student_id')[col].shift(2)

for col in ['composite_wellbeing_score', 'stress_level']:
    df[f'{col}_rolling_mean3'] = df.groupby('student_id')[col].transform(lambda x: x.rolling(3, min_periods=1).mean())
    df[f'{col}_rolling_std3'] = df.groupby('student_id')[col].transform(lambda x: x.rolling(3, min_periods=1).std())

df['score_delta'] = df.groupby('student_id')['avg_exam_score'].diff()
df['stress_delta'] = df.groupby('student_id')['stress_level'].diff()
df['wellbeing_delta'] = df.groupby('student_id')['composite_wellbeing_score'].diff()
df['momentum'] = df['composite_wellbeing_score_lag1'] - df['composite_wellbeing_score_lag2']
df['cumulative_stress_3w'] = df.groupby('student_id')['stress_level'].transform(lambda x: x.rolling(3, min_periods=1).sum())

def rolling_slope(series, window=3):
    result = []
    for i in range(len(series)):
        if i < window - 1: result.append(0)
        else:
            y = series.iloc[i-window+1:i+1].values; x = np.arange(window)
            slope, _, _, _, _ = stats.linregress(x, y)
            result.append(slope)
    return pd.Series(result, index=series.index)

df['attendance_trend'] = df.groupby('student_id')['attendance_rate'].transform(lambda x: rolling_slope(x, 3))
df['wellbeing_ema'] = df.groupby('student_id')['composite_wellbeing_score'].transform(lambda x: x.ewm(alpha=0.3, min_periods=1).mean())
df = df.fillna(0)

drop_cols = ['student_id', 'risk_label', 'next_week_wellbeing_score']
feature_cols = [c for c in df.columns if c not in drop_cols]
target = 'next_week_wellbeing_score'

X_train = df.loc[df['week'] <= 6, feature_cols]
y_train = df.loc[df['week'] <= 6, target]
X_test = df.loc[df['week'] >= 7, feature_cols]
y_test = df.loc[df['week'] >= 7, target]

std_scaler = StandardScaler()
X_train_scaled = pd.DataFrame(std_scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
X_test_scaled = pd.DataFrame(std_scaler.transform(X_test), columns=X_test.columns, index=X_test.index)

all_results = {}
all_models = {}
all_predictions = {}
colors_bar = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6']

def evaluate_forecast(y_true, y_pred, model_name):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    # MASE: Mean Absolute Scaled Error (vs naive forecast)
    naive = np.abs(np.diff(y_true)).mean()
    mase = mae / naive if naive > 0 else float('inf')
    # Directional Accuracy
    actual_dir = np.sign(np.diff(np.concatenate([[y_true.iloc[0]], y_true.values])))
    pred_dir = np.sign(np.diff(np.concatenate([[y_pred[0]], y_pred])))
    dir_acc = (actual_dir == pred_dir).mean() * 100
    
    print(f"\n{'='*50}")
    print(f"  {model_name} - Forecast Results")
    print(f"{'='*50}")
    print(f"  MAE:          {mae:.4f}")
    print(f"  RMSE:         {rmse:.4f}")
    print(f"  R2:           {r2:.4f}")
    print(f"  MASE:         {mase:.4f}")
    print(f"  Dir. Accuracy: {dir_acc:.1f}%")
    return {'MAE': mae, 'RMSE': rmse, 'R2': r2, 'MASE': mase, 'Dir_Accuracy': dir_acc}

print("=" * 60)
print("SECTION 5: MODEL TRAINING")
print("=" * 60)

# %%
# ============================================================
# MODEL 1: LINEAR REGRESSION (Baseline)
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 1: LINEAR REGRESSION (Baseline)")
print("#" * 50)

lr = LinearRegression()
lr.fit(X_train_scaled, y_train)
y_pred_lr = lr.predict(X_test_scaled)
all_results['Linear Regression'] = evaluate_forecast(y_test, y_pred_lr, "Linear Regression")
all_models['Linear Regression'] = lr
all_predictions['Linear Regression'] = y_pred_lr

# %%
# ============================================================
# MODEL 2: XGBOOST REGRESSOR
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 2: XGBOOST REGRESSOR")
print("#" * 50)

if HAS_XGB:
    xgb_model = xgb.XGBRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, random_state=42
    )
    xgb_model.fit(X_train_scaled, y_train)
    y_pred_xgb = xgb_model.predict(X_test_scaled)
    all_results['XGBoost'] = evaluate_forecast(y_test, y_pred_xgb, "XGBoost")
    all_models['XGBoost'] = xgb_model
    all_predictions['XGBoost'] = y_pred_xgb
else:
    print("[SKIP] XGBoost not installed")

# %%
# ============================================================
# MODEL 3: LIGHTGBM REGRESSOR
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 3: LIGHTGBM REGRESSOR")
print("#" * 50)

if HAS_LGB:
    lgb_model = lgb.LGBMRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, random_state=42, verbose=-1
    )
    lgb_model.fit(X_train_scaled, y_train)
    y_pred_lgb = lgb_model.predict(X_test_scaled)
    all_results['LightGBM'] = evaluate_forecast(y_test, y_pred_lgb, "LightGBM")
    all_models['LightGBM'] = lgb_model
    all_predictions['LightGBM'] = y_pred_lgb
else:
    print("[SKIP] LightGBM not installed")

# %%
# ============================================================
# MODEL 4 & 5: LSTM & GRU (Deep Learning)
# ============================================================
lstm_history = None
gru_history = None

if HAS_TF:
    # Reshape data for LSTM/GRU: (samples, timesteps=1, features)
    X_train_dl = X_train_scaled.values.reshape(-1, 1, X_train_scaled.shape[1])
    X_test_dl = X_test_scaled.values.reshape(-1, 1, X_test_scaled.shape[1])
    
    early_stop = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True)
    
    # --- LSTM ---
    print("\n" + "#" * 50)
    print("# MODEL 4: LSTM")
    print("#" * 50)
    
    lstm_model = Sequential([
        LSTM(64, input_shape=(1, X_train_scaled.shape[1]), return_sequences=True),
        Dropout(0.2),
        LSTM(32),
        Dropout(0.2),
        Dense(16, activation='relu'),
        Dense(1)
    ])
    lstm_model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    lstm_history = lstm_model.fit(
        X_train_dl, y_train, epochs=100, batch_size=32,
        validation_split=0.2, callbacks=[early_stop], verbose=0
    )
    y_pred_lstm = lstm_model.predict(X_test_dl, verbose=0).flatten()
    all_results['LSTM'] = evaluate_forecast(y_test, y_pred_lstm, "LSTM")
    all_models['LSTM'] = lstm_model
    all_predictions['LSTM'] = y_pred_lstm
    
    # --- GRU ---
    print("\n" + "#" * 50)
    print("# MODEL 5: GRU")
    print("#" * 50)
    
    gru_model = Sequential([
        GRU(64, input_shape=(1, X_train_scaled.shape[1]), return_sequences=True),
        Dropout(0.2),
        GRU(32),
        Dropout(0.2),
        Dense(16, activation='relu'),
        Dense(1)
    ])
    gru_model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    gru_history = gru_model.fit(
        X_train_dl, y_train, epochs=100, batch_size=32,
        validation_split=0.2, callbacks=[early_stop], verbose=0
    )
    y_pred_gru = gru_model.predict(X_test_dl, verbose=0).flatten()
    all_results['GRU'] = evaluate_forecast(y_test, y_pred_gru, "GRU")
    all_models['GRU'] = gru_model
    all_predictions['GRU'] = y_pred_gru
else:
    print("[SKIP] TensorFlow not installed - LSTM & GRU skipped")

# %% [markdown]
# ---
# ## Section 6: Evaluation & Visualization

# %%
# ============================================================
# EVAL CHART 1: PREDICTED vs ACTUAL TRAJECTORIES (5 Students)
# ============================================================
results_df = pd.DataFrame(all_results).T
best_name = results_df['R2'].idxmax()
best_pred = all_predictions[best_name]

test_df = df[df['week'] >= 7].copy()
test_df['predicted'] = best_pred

fig, axes = plt.subplots(2, 3, figsize=(18, 10))
axes = axes.flatten()
sample_students = test_df['student_id'].unique()[:5]

for i, sid in enumerate(sample_students):
    full_student = df[df['student_id'] == sid].sort_values('week')
    pred_student = test_df[test_df['student_id'] == sid].sort_values('week')
    
    axes[i].plot(full_student['week'], full_student['composite_wellbeing_score'],
                 'b-o', linewidth=2, label='Actual', markersize=6)
    axes[i].plot(pred_student['week'], pred_student['next_week_wellbeing_score'],
                 'g--s', linewidth=2, label='Actual Next Week', markersize=6)
    axes[i].plot(pred_student['week'], pred_student['predicted'],
                 'r--^', linewidth=2, label='Predicted Next Week', markersize=6)
    axes[i].set_title(f'{sid} (Grade {full_student["grade"].iloc[0]})', fontweight='bold')
    axes[i].set_xlabel('Week')
    axes[i].set_ylabel('Wellbeing Score')
    axes[i].legend(fontsize=7)
    axes[i].set_xticks(range(1, 9))
    axes[i].grid(True, alpha=0.3)

# Summary in last subplot
axes[5].axis('off')
summary_text = f"Best Model: {best_name}\n\n"
for metric, val in all_results[best_name].items():
    summary_text += f"{metric}: {val:.4f}\n"
axes[5].text(0.1, 0.5, summary_text, fontsize=14, family='monospace',
             verticalalignment='center', bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.8))

fig.suptitle(f'Predicted vs Actual Trajectories ({best_name})', fontsize=16, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig('c4_chart3_trajectories_predicted.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 2: FORECAST ERROR DISTRIBUTION
# ============================================================
fig, ax = plt.subplots(figsize=(10, 6))
for name, pred in all_predictions.items():
    errors = y_test.values - pred
    ax.hist(errors, bins=30, alpha=0.5, label=f'{name} (MAE={all_results[name]["MAE"]:.2f})', density=True)
ax.axvline(0, color='red', linestyle='--', linewidth=2)
ax.set_title('Forecast Error Distribution (All Models)', fontweight='bold')
ax.set_xlabel('Error (Actual - Predicted)')
ax.set_ylabel('Density')
ax.legend()
plt.tight_layout()
plt.savefig('c4_chart4_error_distribution.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 3: TRAINING LOSS CURVES (LSTM/GRU)
# ============================================================
if HAS_TF and lstm_history and gru_history:
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    axes[0].plot(lstm_history.history['loss'], label='Train Loss', linewidth=2)
    axes[0].plot(lstm_history.history['val_loss'], label='Val Loss', linewidth=2)
    axes[0].set_title('LSTM Training Loss', fontweight='bold')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('MSE Loss')
    axes[0].legend()
    
    axes[1].plot(gru_history.history['loss'], label='Train Loss', linewidth=2)
    axes[1].plot(gru_history.history['val_loss'], label='Val Loss', linewidth=2)
    axes[1].set_title('GRU Training Loss', fontweight='bold')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('MSE Loss')
    axes[1].legend()
    
    plt.tight_layout()
    plt.savefig('c4_chart5_loss_curves.png', dpi=150, bbox_inches='tight')
    plt.show()
else:
    print("[SKIP] Loss curves not available (TensorFlow not installed)")

# %%
# ============================================================
# EVAL CHART 4: MODEL COMPARISON BAR CHART
# ============================================================
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
metrics_to_plot = ['MAE', 'RMSE', 'R2']

for i, metric in enumerate(metrics_to_plot):
    model_names = list(all_results.keys())
    values = [all_results[m][metric] for m in model_names]
    bars = axes[i].bar(model_names, values, color=colors_bar[:len(model_names)], edgecolor='white')
    axes[i].set_title(f'{metric} Comparison', fontweight='bold')
    axes[i].set_ylabel(metric)
    axes[i].tick_params(axis='x', rotation=45)
    for bar, val in zip(bars, values):
        axes[i].text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                     f'{val:.3f}', ha='center', va='bottom', fontsize=9, fontweight='bold')

fig.suptitle('Forecast Model Comparison', fontsize=16, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig('c4_chart6_model_comparison.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 5: ACTUAL vs PREDICTED SCATTER (Best Model)
# ============================================================
fig, ax = plt.subplots(figsize=(8, 8))
ax.scatter(y_test, best_pred, alpha=0.4, s=15, color='#3498db')
min_v, max_v = min(y_test.min(), best_pred.min()), max(y_test.max(), best_pred.max())
ax.plot([min_v, max_v], [min_v, max_v], 'r--', linewidth=2, label='Perfect Prediction')
ax.set_title(f'Actual vs Predicted - {best_name} (R2={all_results[best_name]["R2"]:.4f})', fontweight='bold')
ax.set_xlabel('Actual Next Week Score')
ax.set_ylabel('Predicted Next Week Score')
ax.legend()
ax.set_aspect('equal')
plt.tight_layout()
plt.savefig('c4_chart7_actual_vs_predicted.png', dpi=150, bbox_inches='tight')
plt.show()

# %% [markdown]
# ---
# ## Section 7: Final Summary & Export

# %%
print("\n" + "=" * 70)
print("FINAL FORECAST MODEL COMPARISON")
print("=" * 70)
print(results_df.round(4).to_string())

print(f"\n*** BEST MODEL: {best_name} ***")
for metric, val in all_results[best_name].items():
    print(f"    {metric}: {val:.4f}")

# Save best model
if best_name not in ['LSTM', 'GRU']:
    joblib.dump(all_models[best_name], 'best_forecast_model.pkl')
    print(f"\nModel saved: best_forecast_model.pkl")
elif HAS_TF:
    all_models[best_name].save('best_forecast_model.keras')
    print(f"\nModel saved: best_forecast_model.keras")

joblib.dump(std_scaler, 'forecast_scaler.pkl')
results_df.to_csv('forecast_results.csv')
print("Scaler saved: forecast_scaler.pkl")
print("Results saved: forecast_results.csv")

print("\n" + "=" * 60)
print("COLAB 4 COMPLETE: Wellbeing Forecasting Model built!")
print("=" * 60)
