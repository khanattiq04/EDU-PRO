// Tiny in-memory cache for data that is read on every page view but changes
// rarely (site settings, plan prices, homepage data). Concurrent requests for
// the same key share one database round trip.
const store = new Map();

export async function cached(key, ttlMs, load) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = Promise.resolve().then(load);
  store.set(key, { ...hit, pending });
  try {
    const value = await pending;
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  } catch (error) {
    store.delete(key);
    throw error;
  }
}

export function invalidate(prefix = '') {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
