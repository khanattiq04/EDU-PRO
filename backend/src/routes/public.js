import { Router } from 'express';
import { all, one } from '../db.js';
import { getSetting, settingsMap } from '../services/settings.js';
import { now } from '../services/time.js';

export const plans = [
  { months: 1, amount: 200 },
  { months: 3, amount: 500 },
  { months: 6, amount: 1000 },
  { months: 12, amount: 2000 }
];

export async function configuredPlans() {
  const raw = await getSetting('plan_pricing', JSON.stringify(plans));
  let configured;
  try {
    configured = JSON.parse(raw);
  } catch (error) {
    throw new Error('Plan pricing configuration is invalid JSON.', { cause: error });
  }
  if (!Array.isArray(configured) || configured.length !== 4 ||
      configured.some((plan, index) => Number(plan.months) !== [1, 3, 6, 12][index] ||
        plan.amount === null || plan.amount === '' || !Number.isSafeInteger(Number(plan.amount)) || Number(plan.amount) < 0)) {
    throw new Error('Plan pricing configuration must contain valid 1, 3, 6, and 12 month prices.');
  }
  return configured.map(plan => ({ months: Number(plan.months), amount: Number(plan.amount) }));
}

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, service: 'danistan-network', serverTime: now() }));

router.get('/public', async (_req, res, next) => {
  try {
    const quiz = await one("SELECT * FROM quizzes WHERE status != 'Archived' ORDER BY scheduled_at DESC LIMIT 1");
    const students = await one('SELECT COUNT(*) count FROM students');
    const quizzes = await one("SELECT COUNT(*) count FROM quizzes WHERE status NOT IN ('Archived', 'Draft') AND scheduled_at <= ?", [now()]);
    const news = await all('SELECT id, message, expires_at, display_order FROM homepage_news WHERE expires_at IS NULL OR expires_at = \'\' OR DATE(expires_at) >= DATE(?) ORDER BY display_order, id', [now()]);
    const partners = await all('SELECT id, name, category, discount_percent, logo_url, display_order FROM partners ORDER BY display_order, id');
    const pinned = await all(
      `SELECT r.id AS result_id, h.position, s.full_name AS student_name, s.school_name, r.percentage, r.score, q.title AS quiz_title
       FROM homepage_honorees h
       JOIN results r ON r.id = h.result_id AND r.published = 1
       JOIN students s ON s.id = r.student_id
       JOIN quizzes q ON q.id = r.quiz_id
       ORDER BY h.display_order, h.position`
    );
    const suggestions = pinned.length ? [] : await all(
      `SELECT r.id AS result_id, s.full_name AS student_name, s.school_name, r.percentage, r.score, q.title AS quiz_title
       FROM results r
       JOIN students s ON s.id = r.student_id
       JOIN quizzes q ON q.id = r.quiz_id
       WHERE r.published = 1
         AND r.quiz_id = (SELECT r2.quiz_id FROM results r2 JOIN quizzes q2 ON q2.id = r2.quiz_id WHERE r2.published = 1 ORDER BY q2.scheduled_at DESC LIMIT 1)
       ORDER BY r.percentage DESC, r.score DESC
       LIMIT 3`
    );
    const honorees = pinned.length ? pinned : suggestions.map((item, index) => ({ ...item, position: index + 1 }));
    const settings = await settingsMap();
    const stats = {
      students: students.count,
      quizzes: quizzes.count,
      books: Number(settings.books_distributed || 0),
      schools: Number(settings.schools_visited || 0)
    };
    res.json({ settings, plans: await configuredPlans(), quiz, stats, news, partners, honorees });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (_req, res, next) => {
  try {
    res.json(await configuredPlans());
  } catch (error) {
    next(error);
  }
});

router.get('/academic-options', async (_req, res, next) => {
  try {
    res.json(await all('SELECT category, value, parent_value, display_order FROM academic_options ORDER BY category, parent_value, display_order, value'));
  } catch (error) {
    next(error);
  }
});

export default router;
