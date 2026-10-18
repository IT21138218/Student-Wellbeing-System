import { api } from './client';

/** GET /reports/cohort — real counts/trends aggregated across all 5 real
 * modules (Risk, Wellbeing, Coping, Social, Quiz). Counselor/admin only.
 * `days` sizes the activity_over_time trend window. */
export function getCohortReport(days = 30) {
  return api.get(`/reports/cohort?days=${days}`);
}
