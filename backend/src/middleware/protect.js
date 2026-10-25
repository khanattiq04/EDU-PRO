// Lightweight, dependency-free traffic protection (per server process).

const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// 1. Load shedding: when the server is already juggling too many requests,
//    answer new ones immediately with 503 + Retry-After instead of letting
//    everything slow to a crawl. The website retries these automatically.
export function loadShedding(maxInFlight = Number(process.env.MAX_IN_FLIGHT || 1500)) {
  let inFlight = 0;
  return (req, res, next) => {
    if (inFlight >= maxInFlight && req.path !== '/api/health') {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ error: 'The server is busy. Please try again in a moment.', busy: true });
    }
    inFlight++;
    let done = false;
    const release = () => { if (!done) { done = true; inFlight--; } };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

// 2. Flood protection.
//    - Logged-in users are counted per account (a whole school lab can share one
//      IP address during an exam, so per-IP limits would block real students).
//    - Anonymous requests are counted per IP.
export function ipRateLimit({ windowMs = 60000, perUser = Number(process.env.RATE_LIMIT_PER_USER || 300), perIp = Number(process.env.RATE_LIMIT_PER_IP || 1200) } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const key = token ? `u:${token.slice(-24)}` : `ip:${clientIp(req)}`;
    const max = token ? perUser : perIp;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    if (++entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    next();
  };
}

// 3. Login brute-force guard: 10 wrong passwords for the same account from the
//    same IP locks that pair out for 15 minutes. Correct logins reset it.
export function loginGuard(scope, { max = 10, windowMs = 15 * 60000 } = {}) {
  const failures = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of failures) if (v.reset <= now) failures.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const id = String(req.body?.login || req.body?.email || '').trim().toLowerCase();
    const key = `${scope}:${clientIp(req)}:${id}`;
    const now = Date.now();
    const entry = failures.get(key);
    if (entry && entry.reset > now && entry.count >= max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes and try again.' });
    }
    req.loginFailed = () => {
      const current = failures.get(key);
      if (!current || current.reset <= Date.now()) failures.set(key, { count: 1, reset: Date.now() + windowMs });
      else current.count++;
    };
    req.loginSucceeded = () => failures.delete(key);
    next();
  };
}
