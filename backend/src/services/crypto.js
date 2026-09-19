import crypto from 'node:crypto';

const algorithm = 'aes-256-gcm';
const key = crypto.createHash('sha256').update(process.env.DANISTAN_ENCRYPTION_KEY || 'local-development-key').digest();

export function encryptSensitive(value = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}
