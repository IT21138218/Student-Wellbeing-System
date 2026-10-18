import { api } from './client';

/** GET /overview/stats — mirrors backend/app/models/overview.py OverviewStats */
export function getOverviewStats() {
  return api.get('/overview/stats');
}
