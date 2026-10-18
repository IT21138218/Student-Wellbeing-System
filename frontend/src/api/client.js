const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

function authHeader() {
  try {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {}; // localStorage unavailable (e.g. private browsing edge cases)
  }
}

/** Drops the dead session and lets the app react (App.jsx routes to Login).
 * Defined here rather than imported from auth.js — auth.js imports this
 * module, so importing back would be circular. */
function clearSession() {
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  } catch { /* localStorage unavailable */ }
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function request(path, options = {}) {
  // FormData (file uploads) must NOT get a manual Content-Type — the browser
  // sets one itself with the multipart boundary. JSON bodies keep the default.
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? { ...authHeader(), ...options.headers }
    : { 'Content-Type': 'application/json', ...authHeader(), ...options.headers };

  const res = await fetch(`${BASE_URL}${path}`, { headers, ...options });

  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    if (res.status === 401) {
      // The token is missing, expired, or belongs to a deleted user. Until
      // now the app kept the dead token (and the cached `user`) in
      // localStorage forever, so the UI still looked logged in while every
      // protected call silently 401'd. Clear the session and tell the app
      // to send the user back to Login.
      clearSession();
      detail = 'Your session expired. Please log in again.';
    }
    if (res.status === 403) detail = `Access denied: ${detail}`;
    throw new Error(`API ${res.status}: ${detail}`);
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
};
