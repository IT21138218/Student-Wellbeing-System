import { api } from './client';

/** GET /alerts — real cross-account feed: unescalated HIGH-risk decisions,
 * isolation-flagged social detections, low-confidence coping recommendations,
 * and HIGH-risk wellbeing check-ins. Teacher/counselor/admin only. */
export function getAlerts() {
  return api.get('/alerts');
}
