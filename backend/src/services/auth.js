import crypto from 'node:crypto';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored = '') {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function createToken(payload, hours = 24) {
  const data = { ...payload, exp: Date.now() + hours * 3600000 };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const secret = process.env.DANISTAN_SESSION_KEY || 'danistan-local-session-key';
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readToken(token = '') {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const secret = process.env.DANISTAN_SESSION_KEY || 'danistan-local-session-key';
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const data = JSON.parse(Buffer.from(encoded, 'base64url').toString()); return data.exp > Date.now() ? data : null; } catch { return null; }
}
