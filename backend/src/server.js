import './bootstrap.js';
import cluster from 'node:cluster';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import { assertConnection, closePool, ensureAcademicOptions, ensureContentFeatures, ensureHomepageContent, ensureQuizFeatures, ensureStudentSessions } from './db.js';
import { ensureDefaultSettings } from './services/settings.js';
import { ipRateLimit, loadShedding } from './middleware/protect.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quizzes.js';
import studentRoutes from './routes/student.js';
import adminRoutes from './routes/admin.js';

// WEB_CONCURRENCY=N runs N worker processes (one per CPU core is typical).
// A supervisor restarts any worker that crashes, so one bad request can never
// take the whole site down. Default 1 = single process (Hostinger shared plans).
const workers = Math.max(1, Math.min(Number(process.env.WEB_CONCURRENCY || 1), os.availableParallelism?.() || os.cpus().length));
const port = Number(process.env.PORT || 4000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => new URL(value).origin);
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length) return callback(null, true);
    try {
      return callback(null, allowedOrigins.includes(new URL(origin).origin));
    } catch (error) {
      return callback(error);
    }
  },
  optionsSuccessStatus: 204,
  maxAge: 600
}));
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(loadShedding());
app.use('/api', ipRateLimit());
// Large bodies only where files are uploaded; everything else is capped at 1 MB.
app.use('/api/admin/content', express.json({ limit: '35mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', publicRoutes);
app.use('/api', authRoutes);
app.use('/api', quizRoutes);
app.use('/api/me', studentRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((error, req, res, _next) => {
  if (res.headersSent) return;
  // Bad JSON / too-large body are client errors, not server crashes.
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
  if (error.code === 'BUSY') {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: error.message, busy: true });
  }
  const busy = ['ER_CON_COUNT_ERROR', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED', 'ETIMEDOUT', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'].includes(error.code) ||
    /Queue limit reached|No connections available/i.test(error.message || '');
  console.error(`${new Date().toISOString()} ${req.method} ${req.originalUrl} failed:`, error.code || '', error.sqlMessage || error.message);
  if (busy) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'The server is busy. Please try again in a moment.', busy: true });
  }
  res.status(500).json({ error: 'The server could not complete this request.' });
});

// Never let an unexpected error kill the process silently.
process.on('unhandledRejection', reason => console.error(`${new Date().toISOString()} Unhandled promise rejection:`, reason));
process.on('uncaughtException', error => {
  console.error(`${new Date().toISOString()} Uncaught exception - restarting:`, error);
  // State may be corrupted: exit so the supervisor / hosting panel starts a clean process.
  setTimeout(() => process.exit(1), 200).unref();
});

async function prepareDatabase() {
  await assertConnection();
  await ensureStudentSessions();
  await ensureHomepageContent();
  await ensureAcademicOptions();
  await ensureQuizFeatures();
  await ensureContentFeatures();
  await ensureDefaultSettings();
}

function listen() {
  const server = app.listen(port, () => console.log(`Danistan API listening on http://localhost:${port}${cluster.isWorker ? ` (worker ${process.pid})` : ''}`));
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 120000;
  const shutdown = () => {
    server.close(() => closePool().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function start() {
  if (workers > 1 && cluster.isPrimary) {
    try {
      await prepareDatabase();
    } catch (error) {
      console.error('Database connection failed. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME, and make sure database/edu-pro.sql has been imported.');
      console.error(error.message);
      process.exit(1);
    }
    await closePool();
    console.log(`Starting ${workers} API workers...`);
    for (let i = 0; i < workers; i++) cluster.fork();
    let stopping = false;
    const stop = () => { stopping = true; for (const w of Object.values(cluster.workers)) w?.kill('SIGTERM'); setTimeout(() => process.exit(0), 10000).unref(); };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    cluster.on('exit', (worker, code) => {
      if (stopping) return;
      console.error(`Worker ${worker.process.pid} stopped (code ${code}); starting a replacement.`);
      setTimeout(() => cluster.fork(), 1000);
    });
    return;
  }
  if (cluster.isPrimary) {
    try {
      await prepareDatabase();
    } catch (error) {
      console.error('Database connection failed. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME, and make sure database/edu-pro.sql has been imported.');
      console.error(error.message);
      process.exit(1);
    }
  }
  listen();
}

start();

export default app;
