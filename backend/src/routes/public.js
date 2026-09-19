import { Router } from 'express';
import { one } from '../db.js';
import { getSetting, settingsMap } from '../services/settings.js';
import { now } from '../services/time.js';

export const plans = [
  { months: 1, amount: 200 },
  { months: 3, amount: 500 },
  { months: 6, amount: 1000 },
  { months: 12, amount: 2000 }
];

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, service: 'danistan-network', serverTime: now() }));

router.get('/public', async (_req, res, next) => {
  try {
    const quiz = await one("SELECT * FROM quizzes WHERE status != 'Archived' ORDER BY scheduled_at DESC LIMIT 1");
    const students = await one('SELECT COUNT(*) count FROM students');
    const quizzes = await one("SELECT COUNT(*) count FROM quizzes WHERE status != 'Archived'");
    const stats = {
      students: students.count,
      quizzes: quizzes.count,
      books: Number(await getSetting('books_distributed', '4200')),
      schools: Number(await getSetting('schools_visited', '38'))
    };
    res.json({ settings: await settingsMap(), plans, quiz, stats });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', (_req, res) => res.json(plans));

export default router;
