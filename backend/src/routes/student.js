import { Router } from 'express';
import { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { contentAccess, matchesClass, serializeStudent } from '../services/students.js';
import { withWindow } from '../services/quizTiming.js';
import { hashPasswordAsync, verifyPasswordAsync } from '../services/auth.js';
import { sendContentFile } from '../services/fileCache.js';
import { now } from '../services/time.js';
import { configuredPlans } from './public.js';

const router = Router();

// One query for all result subject breakdowns instead of one per result.
async function attachSubjects(results) {
  if (!results.length) return;
  const rows = await all(
    `SELECT result_id, subject, score, total FROM result_subjects WHERE result_id IN (${results.map(() => '?').join(',')}) ORDER BY subject`,
    results.map(r => r.id)
  );
  for (const result of results) result.subjects = rows.filter(r => r.result_id === result.id).map(({ result_id: _id, ...rest }) => rest);
}

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
    if (!(await verifyPasswordAsync(req.body.currentPassword, row.password_hash))) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (String(req.body.newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    await run('UPDATE students SET password_hash = ? WHERE id = ?', [await hashPasswordAsync(req.body.newPassword), row.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    // Only quizzes for this student's class (and stream, when the quiz has one), plus "General" quizzes.
    const myAttempts = await all('SELECT quiz_id, status FROM attempts WHERE student_id = ?', [student.id]);
    const quizzes = (await all(
      `SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) question_count
       FROM quizzes q WHERE q.status NOT IN ('Archived', 'Draft') ORDER BY q.scheduled_at`
    ))
      .filter(quiz => matchesClass(quiz, student.levelProfile))
      .map(quiz => ({ ...withWindow(quiz), my_attempt_status: myAttempts.find(a => a.quiz_id === quiz.id)?.status || null }));
    const notifications = await all('SELECT * FROM notifications WHERE student_id IS NULL OR student_id = ? ORDER BY created_at DESC LIMIT 5', [student.id]);
    const results = await all(
      'SELECT r.*, q.title FROM results r JOIN quizzes q ON q.id = r.quiz_id WHERE r.student_id = ? AND r.published = 1 ORDER BY r.submitted_at DESC',
      [student.id]
    );
    await attachSubjects(results);
    const access = await contentAccess(student.id);
    res.json({ student, plans: await configuredPlans(), quizzes, notifications, results, paidMonths: access.paidMonths, unlockedMonths: access.unlockedMonths, serverTime: now() });
  } catch (error) {
    next(error);
  }
});

router.post('/payments', async (req, res, next) => {
  try {
    const plan = (await configuredPlans()).find(x => x.months === Number(req.body.months));
    if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

    const method = String(req.body.method || '').trim();
    const transactionId = String(req.body.transactionId || '').trim();
    if (!method || !transactionId) return res.status(400).json({ error: 'Payment method and transaction ID are required for verification.' });

    const inserted = await run(
      'INSERT INTO payments (student_id, amount, months, paid_at, cycle_end, status, reference, method, transaction_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.session.studentId, plan.amount, plan.months, now(), now(), 'Pending', transactionId, method, transactionId]
    );
    await notify(req.session.studentId, 'Payment Submitted', 'Payment awaiting verification', 'Your payment details were received. Access will be activated after admin verification.');
    res.status(201).json(await one('SELECT * FROM payments WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.get('/content', async (req, res, next) => {
  try {
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    const rows = await all(
      `SELECT c.id, c.month_key, c.title, c.type, c.level, c.stream, c.subject, c.chapter, c.body,
        c.file_name, c.mime_type, c.related_content_id, parent.title related_course_title,
        c.requires_payment, c.created_at
       FROM content c LEFT JOIN content parent ON parent.id = c.related_content_id
       WHERE (c.level IS NULL OR c.level = '' OR c.level = ?)
         AND (c.stream IS NULL OR c.stream = '' OR c.stream = ? OR c.stream = ?)
       ORDER BY c.month_key DESC, c.id DESC`,
      [student.levelProfile.level || '', student.levelProfile.stream || '', student.levelProfile.programName || '']
    );
    const access = await contentAccess(student.id);
    res.json(rows.map(row => ({ ...row, accessible: access.canOpen(row) ? 1 : 0 })));
  } catch (error) {
    next(error);
  }
});

router.get('/content/:id/file', async (req, res, next) => {
  try {
    const row = await one(
      `SELECT c.id, c.title, c.month_key, c.file_name, c.mime_type, c.requires_payment, c.created_at FROM content c
       JOIN students s ON s.id = ? AND (c.level IS NULL OR c.level = '' OR c.level = s.level)
         AND (c.stream IS NULL OR c.stream = '' OR c.stream = s.stream OR c.stream = s.program_name)
       WHERE c.id = ?`,
      [req.session.studentId, Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: 'Content file not found.' });
    const access = await contentAccess(req.session.studentId);
    if (!access.canOpen(row)) return res.status(403).json({ error: 'This month is not included in your plan. Renew or ask admin for an unlock.' });
    await sendContentFile(req, res, row);
  } catch (error) {
    next(error);
  }
});

router.get('/syllabus', async (req, res, next) => {
  try {
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    const rows = await all(
      `SELECT sy.*, (SELECT COUNT(*) FROM content c WHERE c.month_key = sy.month_key
        AND (c.level IS NULL OR c.level = '' OR c.level = sy.level)
        AND (c.stream IS NULL OR c.stream = '' OR c.stream = sy.stream)
        AND c.subject = sy.subject AND c.chapter = sy.chapter) notes_count
       FROM syllabus_items sy WHERE sy.level = ? AND (sy.stream = '' OR sy.stream = ?)
       ORDER BY sy.month_key DESC, sy.subject, sy.display_order, sy.chapter`,
      [student.levelProfile.level, student.levelProfile.stream || '']
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    res.json(await all(
      'SELECT id, amount, months, paid_at, cycle_start, cycle_end, status, method, transaction_id FROM payments WHERE student_id = ? ORDER BY paid_at DESC',
      [req.session.studentId]
    ));
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
    await attachSubjects(rows);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
