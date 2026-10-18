import { api } from './client';

/** GET /social/students — known students with real aggregated survey profiles */
export function listSocialStudents() {
  return api.get('/social/students');
}

/** GET /social/detect/{student_id} — mirrors backend/app/models/social.py */
export function detectIsolation(studentId) {
  return api.get(`/social/detect/${encodeURIComponent(studentId)}`);
}

/** GET /social/students?source=real — registered student accounts plus how
 * many stored CopingRecord check-ins each has. Mirrors RealSocialStudentOption. */
export function listRealSocialStudents() {
  return api.get('/social/students?source=real');
}

/** GET /social/history — past detections for the logged-in account, real
 * page-based pagination. Returns {items, total, page, page_size}. */
export function getSocialHistory(page = 1, pageSize = 10) {
  return api.get(`/social/history?page=${page}&page_size=${pageSize}`);
}

/** DELETE /social/history/{id} — remove one detection from history. Owner
 * or admin only; 404 otherwise. */
export function deleteSocialHistoryItem(id) {
  return api.del(`/social/history/${id}`);
}
