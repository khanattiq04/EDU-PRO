import { Router } from 'express';
import crypto from 'node:crypto';
import { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { serializeStudent } from '../services/students.js';
import { now } from '../services/time.js';

const router = Router();

router.get('/quizzes', auth(), async (_req, res, next) => {
  try {
    const rows = await all("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) question_count FROM quizzes q WHERE q.status != 'Archived' ORDER BY q.scheduled_at DESC");
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/start', auth('student'), async (req, res, next) => {
  try {
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [Number(req.body.quizId)]);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    if (student.registrationStatus !== 'Active') return res.status(403).json({ error: 'A paid membership is required.' });
    if (new Date(quiz.scheduled_at) > new Date()) return res.status(403).json({ error: 'This quiz has not started yet.' });

    let attempt = await one('SELECT * FROM attempts WHERE student_id = ? AND quiz_id = ?', [student.id, quiz.id]);
    if (attempt?.status === 'Submitted') return res.status(409).json({ error: 'This quiz has already been submitted.' });

    const deviceId = req.body.deviceId || 'browser';
    if (attempt?.device_id && attempt.device_id !== deviceId) {
      return res.status(409).json({ error: 'This registration is already active on another device.' });
    }

    if (!attempt) {
      const result = await run(
        'INSERT INTO attempts (student_id, quiz_id, token, started_at, status, device_id) VALUES (?,?,?,?,?,?)',
        [student.id, quiz.id, crypto.randomUUID(), now(), 'In progress', deviceId]
      );
      attempt = await one('SELECT * FROM attempts WHERE id = ?', [result.insertId]);
    } else {
      await run("UPDATE attempts SET status = 'In progress', device_id = ? WHERE id = ?", [deviceId, attempt.id]);
    }

    const questions = await all(
      'SELECT id, subject, chapter, difficulty, language_type, question_en, question_ur, option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur FROM questions WHERE quiz_id = ? ORDER BY ((id * ?) % 97)',
      [quiz.id, student.id + 11]
    );
    const answers = await all('SELECT question_id, answer FROM attempt_answers WHERE attempt_id = ?', [attempt.id]);
    res.json({ attempt, quiz, questions, answers, serverTime: now() });
  } catch (error) {
    next(error);
  }
});

router.put('/attempts/:id/answer', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt || attempt.status === 'Submitted') return res.status(409).json({ error: 'Attempt is not active.' });

    const question = await one('SELECT * FROM questions WHERE id = ? AND quiz_id = ?', [Number(req.body.questionId), attempt.quiz_id]);
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const answer = String(req.body.answer || '').toUpperCase();
    await run(
      `INSERT INTO attempt_answers (attempt_id, question_id, answer, is_correct, saved_at) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE answer = VALUES(answer), is_correct = VALUES(is_correct), saved_at = VALUES(saved_at)`,
      [attempt.id, question.id, answer, answer === question.correct_option ? 1 : 0, now()]
    );
    res.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/:id/warning', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    await run('UPDATE attempts SET warnings = warnings + 1 WHERE id = ?', [attempt.id]);
    const warnings = attempt.warnings + 1;
    res.json({ warnings, autoSubmit: warnings >= 3 });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/:id/submit', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (attempt.status === 'Submitted') return res.json(await one('SELECT * FROM results WHERE attempt_id = ?', [attempt.id]));

    const totals = await one(
      `SELECT COALESCE(SUM(q.marks), 0) total, COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN q.marks ELSE 0 END), 0) score
       FROM questions q LEFT JOIN attempt_answers a ON a.question_id = q.id AND a.attempt_id = ?
       WHERE q.quiz_id = ?`,
      [attempt.id, attempt.quiz_id]
    );
    const percentage = totals.total ? Math.round(totals.score * 10000 / totals.total) / 100 : 0;

    await run("UPDATE attempts SET status = 'Submitted', submitted_at = ?, score = ?, percentage = ? WHERE id = ?", [now(), totals.score, percentage, attempt.id]);

    let result = await one('SELECT * FROM results WHERE attempt_id = ?', [attempt.id]);
    if (!result) {
      const inserted = await run(
        'INSERT INTO results (attempt_id, student_id, quiz_id, score, percentage, published, submitted_at) VALUES (?,?,?,?,?,?,?)',
        [attempt.id, attempt.student_id, attempt.quiz_id, totals.score, percentage, 0, now()]
      );
      result = await one('SELECT * FROM results WHERE id = ?', [inserted.insertId]);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
