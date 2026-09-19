import { Router } from 'express';
import { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { paymentFor, serializeStudent, syncStudentStatus } from '../services/students.js';
import { hashPassword, verifyPassword } from '../services/auth.js';
import { addMonths, now } from '../services/time.js';
import { plans } from './public.js';

const router = Router();

router.use(auth('student'));

router.get('/', async (req, res, next) => {
  try {
    res.json(await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId])));
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { fullName, fatherName, mobile, email, city, tehsil, schoolName } = req.body || {};
    await run(
      'UPDATE students SET full_name = ?, father_name = ?, mobile = ?, email = ?, city = ?, tehsil = ?, school_name = ? WHERE id = ?',
      [fullName, fatherName || null, mobile, email, city, tehsil || null, schoolName, req.session.studentId]
    );
    res.json(await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId])));
  } catch (error) {
    next(error);
  }
});

router.put('/password', async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]);
    if (!verifyPassword(req.body.currentPassword, row.password_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (String(req.body.newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    await run('UPDATE students SET password_hash = ? WHERE id = ?', [hashPassword(req.body.newPassword), row.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    const quizzes = await all(
      "SELECT * FROM quizzes WHERE status != 'Archived' AND (level = ? OR level = 'General') AND (stream IS NULL OR stream = '' OR stream = ?) ORDER BY scheduled_at",
      [student.levelProfile.level, student.levelProfile.stream]
    );
    const notifications = await all('SELECT * FROM notifications WHERE student_id IS NULL OR student_id = ? ORDER BY created_at DESC LIMIT 5', [student.id]);
    const results = await all(
      'SELECT r.*, q.title FROM results r JOIN quizzes q ON q.id = r.quiz_id WHERE r.student_id = ? AND r.published = 1 ORDER BY r.submitted_at DESC',
      [student.id]
    );
    res.json({ student, plans, quizzes, notifications, results, serverTime: now() });
  } catch (error) {
    next(error);
  }
});

router.post('/payments', async (req, res, next) => {
  try {
    const plan = plans.find(x => x.months === Number(req.body.months));
    if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

    const existing = await paymentFor(req.session.studentId);
    const start = existing && new Date(existing.cycle_end) > new Date() ? existing.cycle_end : now();
    const cycleEnd = addMonths(start, plan.months);
    const reference = req.body.reference || `SIM-${Date.now()}`;

    const inserted = await run(
      'INSERT INTO payments (student_id, amount, months, paid_at, cycle_end, status, reference) VALUES (?,?,?,?,?,?,?)',
      [req.session.studentId, plan.amount, plan.months, now(), cycleEnd, 'Paid', reference]
    );
    await syncStudentStatus(req.session.studentId);
    await notify(req.session.studentId, 'Payment Confirmation', 'Payment confirmed', `Your ${plan.months}-month access is active until ${new Date(cycleEnd).toLocaleDateString('en-PK')}.`);
    res.status(201).json(await one('SELECT * FROM payments WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.get('/content', async (req, res, next) => {
  try {
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    const rows = await all(
      "SELECT * FROM content WHERE (level IS NULL OR level = '' OR level = ?) AND (stream IS NULL OR stream = '' OR stream = ?) ORDER BY month_key DESC, id DESC",
      [student.levelProfile.level, student.levelProfile.stream]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM notifications WHERE student_id IS NULL OR student_id = ? ORDER BY created_at DESC', [req.session.studentId]));
  } catch (error) {
    next(error);
  }
});

router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    await run('UPDATE notifications SET read_at = ? WHERE id = ? AND (student_id IS NULL OR student_id = ?)', [now(), Number(req.params.id), req.session.studentId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/results', async (req, res, next) => {
  try {
    const rows = await all(
      'SELECT r.*, q.title, q.description FROM results r JOIN quizzes q ON q.id = r.quiz_id WHERE r.student_id = ? AND r.published = 1 ORDER BY r.submitted_at DESC',
      [req.session.studentId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
