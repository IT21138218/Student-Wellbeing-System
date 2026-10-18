import { api } from './client';

/** POST /coping/recommend — mirrors backend/app/models/coping.py */
export function recommendCoping(features) {
  return api.post('/coping/recommend', features);
}

/** GET /coping/history — past recommendations for the logged-in account,
 * real page-based pagination. Returns {items, total, page, page_size}. */
export function getCopingHistory(page = 1, pageSize = 10) {
  return api.get(`/coping/history?page=${page}&page_size=${pageSize}`);
}

/** DELETE /coping/history/{id} — remove one recommendation from history.
 * Owner or admin only; 404 otherwise. */
export function deleteCopingHistoryItem(id) {
  return api.del(`/coping/history/${id}`);
}

/** POST /coping/{recordId}/feedback — report back whether a past
 * recommendation actually helped. actualEffectiveness: 0|1|2. */
export function submitCopingFeedback(recordId, actualEffectiveness) {
  return api.post(`/coping/${recordId}/feedback`, { actual_effectiveness: actualEffectiveness });
}
