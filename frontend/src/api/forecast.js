import { api } from './client';

/** GET /forecast/students — mirrors backend/app/models/forecast.py StudentSummary */
export function listForecastStudents() {
  return api.get('/forecast/students');
}

/** GET /forecast/students?source=real — registered student accounts plus how
 * many stored check-ins each has. Mirrors RealStudentOption. */
export function listRealForecastStudents() {
  return api.get('/forecast/students?source=real');
}

/** GET /forecast/predict/{student_id} — mirrors backend/app/models/forecast.py ForecastOut */
export function predictForecast(studentId) {
  return api.get(`/forecast/predict/${encodeURIComponent(studentId)}`);
}
