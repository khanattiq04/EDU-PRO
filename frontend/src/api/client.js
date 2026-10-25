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
  try {
    if (session) localStorage.setItem('danistan_session', JSON.stringify(session));
    else localStorage.removeItem('danistan_session');
  } catch { /* storage blocked (private mode) - session lasts for this tab only */ }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const RETRYABLE = new Set([502, 503, 504]);

/**
 * Calls the API with:
 *  - a timeout (30 s, longer for uploads) so a stuck request never hangs the page,
 *  - automatic retries with back-off when the server is busy (503) or the
 *    connection drops, so short hiccups are invisible to students.
 * Every endpoint is safe to repeat (answers overwrite, start/submit are idempotent).
 */
export async function api(path, options = {}) {
  const { retries = path.startsWith('/api/auth/') ? 8 : 4, timeout, ...fetchOptions } = options;
  const session = getSession();
  const large = typeof fetchOptions.body === 'string' && fetchOptions.body.length > 1_000_000;
  const limit = timeout ?? (large ? 300000 : 30000);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(fetchOptions.headers || {}) }
      });
    } catch (error) {
      clearTimeout(timer);
      lastError = new Error(error.name === 'AbortError'
        ? 'The server is taking too long to respond. Please try again.'
        : 'Cannot reach the server. Check your internet connection.');
      if (attempt < retries) { await sleep(Math.min(8000, 700 * 2 ** attempt) * (0.7 + Math.random() * 0.6)); continue; }
      throw lastError;
    }
    clearTimeout(timer);
    if (RETRYABLE.has(response.status) && attempt < retries) {
      const wait = Number(response.headers.get('Retry-After')) * 1000 || Math.min(8000, 700 * 2 ** attempt);
      await sleep(wait * (0.7 + Math.random() * 0.6));
      continue;
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (response.status === 401 && session?.role === 'student' && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('danistan:session-expired'));
    }
    if (!response.ok) throw new Error(data?.error || (RETRYABLE.has(response.status) ? 'The server is busy right now. Please try again in a minute.' : 'Request failed.'));
    return data;
  }
  throw lastError || new Error('Request failed.');
}
