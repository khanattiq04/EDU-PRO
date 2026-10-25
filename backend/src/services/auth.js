import crypto from 'node:crypto';
import { promisify } from 'node:util';

import os from 'node:os';

const scryptRaw = promisify(crypto.scrypt);

// Password hashing is deliberately CPU-heavy (~50 ms). During a login rush we
// run at most one per CPU core at a time so the rest of the site stays fast;
// extra logins wait in a short queue, and when even the queue is full we answer
// "busy, retry" immediately instead of letting requests time out.
const cores = os.availableParallelism?.() || os.cpus().length || 1;
const maxConcurrent = Number(process.env.HASH_CONCURRENCY || cores);
const maxQueue = Number(process.env.HASH_QUEUE || 400);
let active = 0;
const waiting = [];

export class BusyError extends Error {
  constructor() { super('The server is busy. Please try again in a moment.'); this.code = 'BUSY'; this.status = 503; }
}

async function scrypt(...args) {
  if (active >= maxConcurrent) {
    if (waiting.length >= maxQueue) throw new BusyError();
    await new Promise(resolve => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await scryptRaw(...args);
  } finally {
    const next = waiting.shift();
    if (next) next(); else active--;
  }
}

// Async versions run on the libuv thread pool so a burst of logins does not
// freeze every other request (the sync versions below block the event loop).
export async function hashPasswordAsync(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(String(password), salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPasswordAsync(password, stored = '') {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = await scrypt(String(password ?? ''), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

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
