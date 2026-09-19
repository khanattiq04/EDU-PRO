const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem('danistan_session') || 'null');
    if (!session) return null;
    if (!session.role) session.role = session.admin ? 'admin' : 'student';
    return session;
  } catch { return null; }
}

export function saveSession(session) {
  if (session) localStorage.setItem('danistan_session', JSON.stringify(session));
  else localStorage.removeItem('danistan_session');
}

export async function api(path, options = {}) {
  const session = getSession();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(options.headers || {}) }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Request failed.');
  return data;
}
