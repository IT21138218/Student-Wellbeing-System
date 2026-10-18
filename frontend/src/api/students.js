import { api } from './client';

/** GET /students — registered student ACCOUNTS from MongoDB (users with
 * role "student"). Parents receive only their linked children; staff and
 * admin receive everyone.
 *
 * Not to be confused with listForecastStudents() in ./forecast.js, which
 * lists the S001-S300 cohort from the research CSV. Forecasting and Social
 * need that CSV because their models read stored weekly history per student. */
export function listRegisteredStudents() {
  return api.get('/students');
}

/** GET /students/parents — admin only. Parent accounts + their child links. */
export function listParents() {
  return api.get('/students/parents');
}

/** POST/DELETE /students/{studentId}/guardians/{parentId} — admin only.
 * Returns the parent's full linked-children list after the change. */
export function linkGuardian(parentId, studentId) {
  return api.post(`/students/${studentId}/guardians/${parentId}`);
}

export function unlinkGuardian(parentId, studentId) {
  return api.del(`/students/${studentId}/guardians/${parentId}`);
}
