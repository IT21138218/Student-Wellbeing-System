import { api } from './client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

function authHeader() {
  try {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** POST /auth/register — mirrors backend/app/models/user.py RegisterIn */
export function registerUser({ email, fullName, password, role }) {
  return api.post('/auth/register', { email, full_name: fullName, password, role });
}

/** POST /auth/login — mirrors backend/app/models/user.py LoginIn */
export function loginUser({ email, password }) {
  return api.post('/auth/login', { email, password });
}

/** GET /auth/me — refresh the logged-in user's profile */
export function getMe() {
  return api.get('/auth/me');
}

/** PATCH /auth/me — update name + role-relevant details */
export function updateProfile({ fullName, phone, bio, grade, subject, department }) {
  return api.patch('/auth/me', {
    full_name: fullName, phone: phone || null, bio: bio || null,
    grade: grade || null, subject: subject || null, department: department || null,
  });
}

/** POST /auth/me/change-password */
export function changePassword({ currentPassword, newPassword }) {
  return api.post('/auth/me/change-password', { current_password: currentPassword, new_password: newPassword });
}

/** POST /auth/me/avatar — multipart upload, not JSON, so this bypasses
 * api.post (which always sends Content-Type: application/json). */
export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/auth/me/avatar`, {
    method: 'POST',
    headers: authHeader(), // no Content-Type — the browser sets the multipart boundary itself
    body: form,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

/** DELETE /auth/me/avatar */
export function deleteAvatar() {
  return fetch(`${BASE_URL}/auth/me/avatar`, { method: 'DELETE', headers: authHeader() })
    .then(async res => {
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      return res.json();
    });
}

/** Clears the local session. Does not call the backend — JWTs are
 * stateless, so "logging out" just means forgetting the token client-side. */
export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}
