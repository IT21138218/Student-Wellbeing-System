import { api } from './client';

/** POST /risk/classify — mirrors backend/app/models/risk.py */
export function classifyRisk(features) {
  return api.post('/risk/classify', features);
}

/** GET /risk/history — past risk decisions for the logged-in account, real
 * page-based pagination. No student_id param: Risk Classification has no
 * Student Picker, unlike Wellbeing Indicator's getWellbeingHistory.
 * Returns {items, total, page, page_size}. */
export function getRiskHistory(page = 1, pageSize = 10) {
  return api.get(`/risk/history?page=${page}&page_size=${pageSize}`);
}

/** DELETE /risk/history/{id} — remove one decision from history. Owner or
 * admin only; 404 otherwise. */
export function deleteRiskHistoryItem(id) {
  return api.del(`/risk/history/${id}`);
}

/** GET /risk/admin/overview — admin only: every staff account's decisions. */
export function getAdminRiskOverview(page = 1, pageSize = 10) {
  return api.get(`/risk/admin/overview?page=${page}&page_size=${pageSize}`);
}

/** POST /risk/{id}/escalate — flag a decision for counselor follow-up. */
export function escalateRisk(assessmentId, note) {
  return api.post(`/risk/${assessmentId}/escalate`, { note: note || null });
}
