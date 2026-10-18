// Mirrors the backend's role gating exactly — see backend/app/api/v1/routes/
// {wellbeing,risk,forecast,quiz,social}.py (_ALLOWED = require_roles(...)).
// 'admin' is always allowed and isn't listed per-module, same as the backend.
//
// Note this table is TOOL-level only. GET /students mirrors the `wellbeing`
// role set below, but additionally narrows parents to the children linked to
// their account, and the wellbeing predict/history routes reject a parent
// filing against anyone else. That restriction is per-RECORD, so it lives in
// backend/app/services/student_service.py, not here.
export const TOOL_ROLES = {
  wellbeing: ['teacher', 'counselor', 'parent'],
  classification: ['teacher', 'counselor', 'parent'], // Risk Classification
  risk: ['teacher', 'counselor', 'parent'],            // Forecasting & Trends
  quiz: ['teacher', 'student'],
  topic: ['teacher', 'student'], // Question Bank — reads/annotates quiz.py's /quiz/bank, same role gate
  social: ['teacher', 'counselor'],
  coping: ['teacher', 'counselor', 'student'],
  reports: ['counselor'], // Cohort Report — mirrors backend/app/api/v1/routes/report.py
  alerts: ['teacher', 'counselor'], // Alerts — mirrors backend/app/api/v1/routes/alerts.py
  // Manage Guardians is deliberately NOT listed here — it's gated in
  // Dashboard.jsx directly against the admin role, not through visible()/
  // canAccessTool(), and tests/test_role_matrix.py asserts this table's key
  // set matches the backend-gate mapping exactly, which has no entry for it
  // (students._ADMIN_ONLY has no non-admin allowed set to mirror).
};

export function canAccessTool(role, tool) {
  if (role === 'admin') return true;
  const allowed = TOOL_ROLES[tool];
  if (allowed === null || allowed === undefined) return true;
  return allowed.includes(role);
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
