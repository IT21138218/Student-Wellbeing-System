import { api } from './client';

/** POST /quiz/generate — mirrors backend/app/models/quiz.py */
export function generateQuiz(payload) {
  return api.post('/quiz/generate', payload);
}

/** POST /quiz/extract-pdf — multipart upload, returns { text, num_pages, truncated } */
export function extractPdfText(file) {
  const form = new FormData();
  form.append('file', file);
  return api.post('/quiz/extract-pdf', form);
}

/** POST /quiz/attempt — server-scores and saves a completed quiz */
export function saveQuizAttempt(payload) {
  return api.post('/quiz/attempt', payload);
}

/** GET /quiz/history — most recent attempts for the logged-in account */
export function getQuizHistory(studentId) {
  const qs = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
  return api.get(`/quiz/history${qs}`);
}

/** GET /quiz/bank — flattened, filterable list of every generated question */
export function getQuestionBank(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  });
  const qs = params.toString();
  return api.get(`/quiz/bank${qs ? `?${qs}` : ''}`);
}

/** PUT /quiz/bank/note — upsert a private note on one bank question */
export function saveQuestionNote(attemptId, questionIndex, note) {
  return api.put('/quiz/bank/note', { attempt_id: attemptId, question_index: questionIndex, note });
}

/** GET /quiz/marks — admin only: every student's aggregated quiz marks */
export function getStudentMarks() {
  return api.get('/quiz/marks');
}
