# -*- coding: utf-8 -*-
"""
================================================================================
COLAB 3 - PART 2: MODEL TRAINING, EVALUATION & COMPARISON
================================================================================
Models: Random Forest, XGBoost, SVM, KNN, MLP Neural Network
Evaluation: Confusion Matrix, ROC-AUC, Precision-Recall, SHAP, Cohen's Kappa
================================================================================
"""

# %%
# ============================================================
# SETUP (Run after Part 1, or standalone)
# ============================================================
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import RobustScaler, LabelEncoder, label_binarize, MinMaxScaler
from sklearn.model_selection import train_test_split, RandomizedSearchCV, cross_val_score, StratifiedKFold
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (classification_report, confusion_matrix, accuracy_score,
                             f1_score, roc_auc_score, roc_curve, auc, precision_recall_curve,
                             cohen_kappa_score, matthews_corrcoef)
from sklearn.decomposition import PCA
import joblib
import warnings
warnings.filterwarnings('ignore')

try:
    import xgboost as xgb
    HAS_XGB = True
except: HAS_XGB = False

try:
    from imblearn.over_sampling import SMOTE
    HAS_SMOTE = True
except: HAS_SMOTE = False

try:
    import shap
    HAS_SHAP = True
except: HAS_SHAP = False

plt.style.use('seaborn-v0_8-whitegrid')

# --- Recreate data pipeline ---
df = pd.read_csv('student_wellbeing_dataset.csv')
df['risk_indicator_composite'] = df['stress_level'] * (1 - df['attendance_rate']/100) * df['fatigue_level']
df['wellbeing_gap'] = 100 - df['composite_wellbeing_score']
df['disengagement_score'] = (5-df['motivation_level']) + (5-df['class_participation']) + (5-df['teacher_engagement_score'])
df['attendance_absence_ratio'] = df['attendance_rate'] / (df['absence_count'] + 1)
df['stress_resilience_ratio'] = df['stress_level'] / (df['sleep_hours'] - 3)
vol = df.groupby('student_id')['composite_wellbeing_score'].std().reset_index()
vol.columns = ['student_id', 'weekly_volatility']
df = df.merge(vol, on='student_id', how='left')

label_mapping = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
df['risk_encoded'] = df['risk_label'].map(label_mapping)
drop_cols = ['student_id', 'risk_label', 'risk_encoded', 'next_week_wellbeing_score']
X = df[[c for c in df.columns if c not in drop_cols]]
y = df['risk_encoded']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
robust_scaler = RobustScaler()
X_train_scaled = pd.DataFrame(robust_scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
X_test_scaled = pd.DataFrame(robust_scaler.transform(X_test), columns=X_test.columns, index=X_test.index)

if HAS_SMOTE:
    smote = SMOTE(random_state=42)
    X_train_resampled, y_train_resampled = smote.fit_resample(X_train_scaled, y_train)
else:
    X_train_resampled, y_train_resampled = X_train_scaled, y_train

class_names = ['LOW', 'MEDIUM', 'HIGH']
all_results = {}
all_models = {}
all_predictions = {}
colors_bar = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6']

print("=" * 60)
print("SECTION 5: MODEL TRAINING")
print("=" * 60)

# %%
# ============================================================
# MODEL 1: RANDOM FOREST CLASSIFIER
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 1: RANDOM FOREST CLASSIFIER")
print("#" * 50)

rf_params = {
    'n_estimators': [100, 200, 300],
    'max_depth': [5, 10, 15, None],
    'min_samples_split': [2, 5, 10],
    'class_weight': ['balanced']
}
rf_search = RandomizedSearchCV(
    RandomForestClassifier(random_state=42), rf_params,
    n_iter=20, cv=StratifiedKFold(5), scoring='f1_macro', n_jobs=-1, random_state=42
)
rf_search.fit(X_train_resampled, y_train_resampled)
y_pred_rf = rf_search.predict(X_test_scaled)
print(f"Best params: {rf_search.best_params_}")
print(f"\n{classification_report(y_test, y_pred_rf, target_names=class_names)}")

all_results['Random Forest'] = {
    'Accuracy': accuracy_score(y_test, y_pred_rf),
    'F1_Macro': f1_score(y_test, y_pred_rf, average='macro'),
    'F1_Weighted': f1_score(y_test, y_pred_rf, average='weighted'),
    'Kappa': cohen_kappa_score(y_test, y_pred_rf),
    'MCC': matthews_corrcoef(y_test, y_pred_rf)
}
all_models['Random Forest'] = rf_search.best_estimator_
all_predictions['Random Forest'] = y_pred_rf

# %%
# ============================================================
# MODEL 2: XGBOOST CLASSIFIER
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 2: XGBOOST CLASSIFIER")
print("#" * 50)

if HAS_XGB:
    xgb_params = {
        'n_estimators': [100, 200, 300],
        'max_depth': [3, 5, 7],
        'learning_rate': [0.01, 0.05, 0.1],
        'subsample': [0.8, 1.0]
    }
    xgb_search = RandomizedSearchCV(
        xgb.XGBClassifier(random_state=42, eval_metric='mlogloss', use_label_encoder=False),
        xgb_params, n_iter=20, cv=StratifiedKFold(5), scoring='f1_macro', n_jobs=-1, random_state=42
    )
    xgb_search.fit(X_train_resampled, y_train_resampled)
    y_pred_xgb = xgb_search.predict(X_test_scaled)
    print(f"Best params: {xgb_search.best_params_}")
    print(f"\n{classification_report(y_test, y_pred_xgb, target_names=class_names)}")
    
    all_results['XGBoost'] = {
        'Accuracy': accuracy_score(y_test, y_pred_xgb),
        'F1_Macro': f1_score(y_test, y_pred_xgb, average='macro'),
        'F1_Weighted': f1_score(y_test, y_pred_xgb, average='weighted'),
        'Kappa': cohen_kappa_score(y_test, y_pred_xgb),
        'MCC': matthews_corrcoef(y_test, y_pred_xgb)
    }
    all_models['XGBoost'] = xgb_search.best_estimator_
    all_predictions['XGBoost'] = y_pred_xgb
else:
    print("[SKIP] XGBoost not installed")

# %%
# ============================================================
# MODEL 3: SVM (RBF Kernel)
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 3: SVM (RBF Kernel)")
print("#" * 50)

svm_params = {'C': [0.1, 1, 10], 'gamma': ['scale', 'auto'], 'kernel': ['rbf']}
svm_search = RandomizedSearchCV(
    SVC(probability=True, random_state=42, class_weight='balanced'),
    svm_params, n_iter=6, cv=StratifiedKFold(5), scoring='f1_macro', n_jobs=-1, random_state=42
)
svm_search.fit(X_train_resampled, y_train_resampled)
y_pred_svm = svm_search.predict(X_test_scaled)
print(f"Best params: {svm_search.best_params_}")
print(f"\n{classification_report(y_test, y_pred_svm, target_names=class_names)}")

all_results['SVM'] = {
    'Accuracy': accuracy_score(y_test, y_pred_svm),
    'F1_Macro': f1_score(y_test, y_pred_svm, average='macro'),
    'F1_Weighted': f1_score(y_test, y_pred_svm, average='weighted'),
    'Kappa': cohen_kappa_score(y_test, y_pred_svm),
    'MCC': matthews_corrcoef(y_test, y_pred_svm)
}
all_models['SVM'] = svm_search.best_estimator_
all_predictions['SVM'] = y_pred_svm

# %%
# ============================================================
# MODEL 4: K-NEAREST NEIGHBORS
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 4: K-NEAREST NEIGHBORS")
print("#" * 50)

knn_params = {'n_neighbors': [3, 5, 7, 9, 11], 'weights': ['uniform', 'distance'], 'metric': ['euclidean', 'manhattan']}
knn_search = RandomizedSearchCV(
    KNeighborsClassifier(), knn_params, n_iter=15, cv=StratifiedKFold(5), scoring='f1_macro', n_jobs=-1, random_state=42
)
knn_search.fit(X_train_resampled, y_train_resampled)
y_pred_knn = knn_search.predict(X_test_scaled)
print(f"Best params: {knn_search.best_params_}")
print(f"\n{classification_report(y_test, y_pred_knn, target_names=class_names)}")

all_results['KNN'] = {
    'Accuracy': accuracy_score(y_test, y_pred_knn),
    'F1_Macro': f1_score(y_test, y_pred_knn, average='macro'),
    'F1_Weighted': f1_score(y_test, y_pred_knn, average='weighted'),
    'Kappa': cohen_kappa_score(y_test, y_pred_knn),
    'MCC': matthews_corrcoef(y_test, y_pred_knn)
}
all_models['KNN'] = knn_search.best_estimator_
all_predictions['KNN'] = y_pred_knn

# %%
# ============================================================
# MODEL 5: MLP CLASSIFIER (Neural Network)
# ============================================================
print("\n" + "#" * 50)
print("# MODEL 5: MLP CLASSIFIER (Neural Network)")
print("#" * 50)

mlp_params = {
    'hidden_layer_sizes': [(64, 32), (128, 64), (100, 50, 25)],
    'activation': ['relu', 'tanh'],
    'alpha': [0.0001, 0.001, 0.01],
    'learning_rate': ['adaptive']
}
mlp_search = RandomizedSearchCV(
    MLPClassifier(max_iter=500, random_state=42), mlp_params,
    n_iter=12, cv=StratifiedKFold(5), scoring='f1_macro', n_jobs=-1, random_state=42
)
mlp_search.fit(X_train_resampled, y_train_resampled)
y_pred_mlp = mlp_search.predict(X_test_scaled)
print(f"Best params: {mlp_search.best_params_}")
print(f"\n{classification_report(y_test, y_pred_mlp, target_names=class_names)}")

all_results['MLP'] = {
    'Accuracy': accuracy_score(y_test, y_pred_mlp),
    'F1_Macro': f1_score(y_test, y_pred_mlp, average='macro'),
    'F1_Weighted': f1_score(y_test, y_pred_mlp, average='weighted'),
    'Kappa': cohen_kappa_score(y_test, y_pred_mlp),
    'MCC': matthews_corrcoef(y_test, y_pred_mlp)
}
all_models['MLP'] = mlp_search.best_estimator_
all_predictions['MLP'] = y_pred_mlp

# %% [markdown]
# ---
# ## Section 6: Comprehensive Evaluation & Visualization

# %%
# ============================================================
# EVAL CHART 1: CONFUSION MATRICES (All Models)
# ============================================================
n_models = len(all_predictions)
fig, axes = plt.subplots(1, n_models, figsize=(5 * n_models, 4))
if n_models == 1: axes = [axes]

for i, (name, y_pred) in enumerate(all_predictions.items()):
    cm = confusion_matrix(y_test, y_pred)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[i],
                xticklabels=class_names, yticklabels=class_names)
    axes[i].set_title(f'{name}\nAcc: {all_results[name]["Accuracy"]:.3f}', fontweight='bold')
    axes[i].set_xlabel('Predicted')
    axes[i].set_ylabel('Actual')

fig.suptitle('Confusion Matrices (All Models)', fontsize=16, fontweight='bold', y=1.05)
plt.tight_layout()
plt.savefig('c3_chart4_confusion_matrices.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 2: NORMALIZED CONFUSION MATRIX (Best Model)
# ============================================================
results_df = pd.DataFrame(all_results).T
best_name = results_df['F1_Macro'].idxmax()
best_pred = all_predictions[best_name]

cm_norm = confusion_matrix(y_test, best_pred, normalize='true')
fig, ax = plt.subplots(figsize=(8, 6))
sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Greens', ax=ax,
            xticklabels=class_names, yticklabels=class_names)
ax.set_title(f'Normalized Confusion Matrix - {best_name} (Best Model)', fontweight='bold')
ax.set_xlabel('Predicted')
ax.set_ylabel('Actual')
plt.tight_layout()
plt.savefig('c3_chart5_normalized_cm.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 3: ROC CURVES (One-vs-Rest)
# ============================================================
y_test_bin = label_binarize(y_test, classes=[0, 1, 2])
fig, axes = plt.subplots(1, 3, figsize=(18, 5))
line_colors = ['#2ecc71', '#f39c12', '#e74c3c']

for i, class_name in enumerate(class_names):
    for name, model in all_models.items():
        if hasattr(model, 'predict_proba'):
            y_prob = model.predict_proba(X_test_scaled)
            fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_prob[:, i])
            roc_auc_val = auc(fpr, tpr)
            axes[i].plot(fpr, tpr, linewidth=2, label=f'{name} (AUC={roc_auc_val:.3f})')
    axes[i].plot([0, 1], [0, 1], 'k--', linewidth=1)
    axes[i].set_title(f'ROC Curve - {class_name} Risk', fontweight='bold')
    axes[i].set_xlabel('False Positive Rate')
    axes[i].set_ylabel('True Positive Rate')
    axes[i].legend(fontsize=8)

fig.suptitle('ROC Curves (One-vs-Rest for Each Risk Class)', fontsize=16, fontweight='bold', y=1.05)
plt.tight_layout()
plt.savefig('c3_chart6_roc_curves.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 4: PRECISION-RECALL CURVES
# ============================================================
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

for i, class_name in enumerate(class_names):
    for name, model in all_models.items():
        if hasattr(model, 'predict_proba'):
            y_prob = model.predict_proba(X_test_scaled)
            prec, rec, _ = precision_recall_curve(y_test_bin[:, i], y_prob[:, i])
            axes[i].plot(rec, prec, linewidth=2, label=f'{name}')
    axes[i].set_title(f'Precision-Recall - {class_name}', fontweight='bold')
    axes[i].set_xlabel('Recall')
    axes[i].set_ylabel('Precision')
    axes[i].legend(fontsize=8)

fig.suptitle('Precision-Recall Curves (Critical for Imbalanced HIGH Class)', fontsize=14, fontweight='bold', y=1.05)
plt.tight_layout()
plt.savefig('c3_chart7_precision_recall.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 5: FEATURE IMPORTANCE (Best Tree Model)
# ============================================================
tree_models = {k: v for k, v in all_models.items() if hasattr(v, 'feature_importances_')}
if tree_models:
    best_tree_name = max(tree_models, key=lambda k: all_results[k]['F1_Macro'])
    importances = pd.Series(tree_models[best_tree_name].feature_importances_, index=X_train.columns)
    top_15 = importances.sort_values(ascending=True).tail(15)
    
    fig, ax = plt.subplots(figsize=(10, 8))
    top_15.plot(kind='barh', color='#9b59b6', edgecolor='white', ax=ax)
    ax.set_title(f'Top 15 Feature Importance ({best_tree_name})', fontweight='bold')
    ax.set_xlabel('Importance Score')
    plt.tight_layout()
    plt.savefig('c3_chart8_feature_importance.png', dpi=150, bbox_inches='tight')
    plt.show()

# %%
# ============================================================
# EVAL CHART 6: SHAP SUMMARY PLOT
# ============================================================
if HAS_SHAP and 'Random Forest' in all_models:
    print("Generating SHAP values (may take a moment)...")
    explainer = shap.TreeExplainer(all_models['Random Forest'])
    shap_values = explainer.shap_values(X_test_scaled.iloc[:200])  # Sample for speed
    
    fig, ax = plt.subplots(figsize=(12, 8))
    shap.summary_plot(shap_values, X_test_scaled.iloc[:200], class_names=class_names,
                      show=False, max_display=15)
    plt.title('SHAP Feature Impact on Risk Classification', fontweight='bold')
    plt.tight_layout()
    plt.savefig('c3_chart9_shap.png', dpi=150, bbox_inches='tight')
    plt.show()
else:
    print("[SKIP] SHAP plot (library not available or Random Forest not trained)")

# %%
# ============================================================
# EVAL CHART 7: MODEL COMPARISON (Grouped Bar)
# ============================================================
fig, ax = plt.subplots(figsize=(14, 6))
metrics_to_plot = ['Accuracy', 'F1_Macro', 'F1_Weighted', 'Kappa', 'MCC']
x = np.arange(len(all_results))
width = 0.15

for i, metric in enumerate(metrics_to_plot):
    values = [all_results[m][metric] for m in all_results]
    bars = ax.bar(x + i * width, values, width, label=metric, color=colors_bar[i], edgecolor='white')

ax.set_xticks(x + width * 2)
ax.set_xticklabels(list(all_results.keys()), rotation=45)
ax.set_title('Model Comparison Across All Metrics', fontweight='bold')
ax.set_ylabel('Score')
ax.legend()
ax.set_ylim(0, 1.1)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('c3_chart10_model_comparison.png', dpi=150, bbox_inches='tight')
plt.show()

# %%
# ============================================================
# EVAL CHART 8: DECISION BOUNDARY (2D PCA Projection)
# ============================================================
pca = PCA(n_components=2)
X_test_pca = pca.fit_transform(X_test_scaled)

fig, ax = plt.subplots(figsize=(10, 7))
scatter_colors = {0: '#2ecc71', 1: '#f39c12', 2: '#e74c3c'}
for cls, name in enumerate(class_names):
    mask = y_test == cls
    ax.scatter(X_test_pca[mask, 0], X_test_pca[mask, 1], c=scatter_colors[cls],
               label=name, alpha=0.5, s=20, edgecolors='none')
ax.set_title('Risk Classes in PCA Space (2D Projection)', fontweight='bold')
ax.set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]*100:.1f}% variance)')
ax.set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]*100:.1f}% variance)')
ax.legend()
plt.tight_layout()
plt.savefig('c3_chart11_pca_boundary.png', dpi=150, bbox_inches='tight')
plt.show()

# %% [markdown]
# ---
# ## Section 7: Final Summary & Export

# %%
# ============================================================
# FINAL SUMMARY
# ============================================================
print("\n" + "=" * 70)
print("FINAL CLASSIFICATION MODEL COMPARISON")
print("=" * 70)
print(results_df.round(4).to_string())

print(f"\n*** BEST MODEL: {best_name} ***")
for metric, val in all_results[best_name].items():
    print(f"    {metric}: {val:.4f}")

# Save best model
joblib.dump(all_models[best_name], 'best_risk_classifier.pkl')
joblib.dump(robust_scaler, 'risk_scaler.pkl')
print(f"\nModel saved: best_risk_classifier.pkl")
print(f"Scaler saved: risk_scaler.pkl")

results_df.to_csv('risk_classification_results.csv')
print("Results saved: risk_classification_results.csv")

print("\n" + "=" * 60)
print("COLAB 3 COMPLETE: Risk Classification Model built!")
print("=" * 60)
