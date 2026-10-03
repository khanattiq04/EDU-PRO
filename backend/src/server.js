import express from 'express';
import cors from 'cors';
import { assertConnection, closePool, ensureAcademicOptions, ensureContentFeatures, ensureHomepageContent, ensureQuizFeatures, ensureStudentSessions } from './db.js';
import { ensureDefaultSettings } from './services/settings.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import quizRoutes from './routes/quizzes.js';
import studentRoutes from './routes/student.js';
import adminRoutes from './routes/admin.js';

const app = express();

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
  optionsSuccessStatus: 204
}));
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.use(express.json({ limit: '35mb' }));

app.use('/api', publicRoutes);
app.use('/api', authRoutes);
app.use('/api', quizRoutes);
app.use('/api/me', studentRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The server could not complete this request.' });
});

const port = Number(process.env.PORT || 4000);

async function start() {
  try {
    await assertConnection();
    await ensureStudentSessions();
    await ensureHomepageContent();
    await ensureAcademicOptions();
    await ensureQuizFeatures();
    await ensureContentFeatures();
    await ensureDefaultSettings();
  } catch (error) {
    console.error('Database connection failed. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME, and make sure database/import-all.sql has been imported.');
    console.error(error.message);
    process.exit(1);
  }

  const server = app.listen(port, () => console.log(`Danistan API listening on http://localhost:${port}`));
  const shutdown = () => { server.close(() => closePool().then(() => process.exit(0))); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();

export default app;
