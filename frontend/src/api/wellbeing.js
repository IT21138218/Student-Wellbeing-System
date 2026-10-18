import { api } from './client';

/** POST /wellbeing/predict — mirrors backend/app/models/wellbeing.py */
export function predictWellbeing(features) {
  return api.post('/wellbeing/predict', features);
}

/** GET /wellbeing/history — real check-in history for the logged-in account,
 * real page-based pagination, optionally narrowed to one student via
 * ?student_id=. Returns {items, total, page, page_size}. Was previously
 * hardcapped at the backend's default of 5 with no `limit`/`page` param
 * exposed at all. */
export function getWellbeingHistory(studentId, page = 1, pageSize = 10) {
  const qs = studentId ? `&student_id=${encodeURIComponent(studentId)}` : '';
  return api.get(`/wellbeing/history?page=${page}&page_size=${pageSize}${qs}`);
}

/** DELETE /wellbeing/history/{id} — remove one check-in from history. Owner
 * or admin only; 404 otherwise. */
export function deleteWellbeingHistoryItem(id) {
  return api.del(`/wellbeing/history/${id}`);
}
