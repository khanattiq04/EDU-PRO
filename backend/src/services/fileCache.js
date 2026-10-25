// Course files (videos, PDFs, slides) are stored in the database. Reading a
// 25 MB blob from MySQL into memory for every download does not scale, and
// videos could not be seeked. The first download writes the file to a local
// cache folder; after that it is streamed from disk with HTTP Range support.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { one } from '../db.js';

const dir = process.env.FILE_CACHE_DIR || path.join(os.tmpdir(), 'danistan-file-cache');
const pending = new Map();

const cacheName = row => `${row.id}-${crypto.createHash('sha1').update(String(row.created_at || '')).digest('hex').slice(0, 10)}`;

async function ensureCached(row) {
  const file = path.join(dir, cacheName(row));
  try {
    await fsp.access(file);
    return file;
  } catch { /* not cached yet */ }
  if (pending.has(file)) return pending.get(file);
  const job = (async () => {
    const data = await one('SELECT file_data FROM content WHERE id = ?', [row.id]);
    if (!data?.file_data) return null;
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, data.file_data);
    await fsp.rename(tmp, file);
    return file;
  })().finally(() => pending.delete(file));
  pending.set(file, job);
  return job;
}

export async function sendContentFile(req, res, row) {
  const file = await ensureCached(row);
  if (!file) return res.status(404).json({ error: 'No uploaded file is available for this content.' });
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name || row.title)}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return new Promise((resolve, reject) => {
    res.sendFile(file, { headers: { 'Content-Type': row.mime_type || 'application/octet-stream' }, acceptRanges: true, lastModified: false }, error => {
      if (error && !res.headersSent) reject(error); else resolve();
    });
  });
}

export async function forgetContentFile(id) {
  try {
    const files = await fsp.readdir(dir);
    await Promise.all(files.filter(name => name.startsWith(`${id}-`)).map(name => fsp.rm(path.join(dir, name), { force: true })));
  } catch { /* cache folder may not exist */ }
}

export const fileCacheDir = dir;
