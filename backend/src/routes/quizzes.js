import { Router } from 'express';
import crypto from 'node:crypto';
import pool, { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { matchesClass, serializeStudent } from '../services/students.js';
import { now } from '../services/time.js';
import { attemptDeadline, quizState, withWindow } from '../services/quizTiming.js';

const router = Router();

router.get('/quizzes', auth(), async (req, res, next) => {
  try {
    const rows = await all("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) question_count FROM quizzes q WHERE q.status != 'Archived' ORDER BY q.scheduled_at DESC");
    if (req.session.role !== 'student') return res.json(rows);
    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    res.json(rows.filter(quiz => quiz.status !== 'Draft' && matchesClass(quiz, student.levelProfile)).map(withWindow));
  } catch (error) {
    next(error);
  }
});

router.get('/rehearsal/questions', auth('student'), async (_req, res, next) => {
  try {
    const questions = await all(
      `SELECT id, subject, language_type, question_en, question_ur,
        option_a_en, option_a_ur, option_b_en, option_b_ur,
        option_c_en, option_c_ur, option_d_en, option_d_ur
       FROM questions WHERE quiz_id IS NULL ORDER BY RAND() LIMIT 10`
    );
    if (!questions.length) return res.status(404).json({ error: 'The rehearsal question bank is empty.' });
    res.json(questions);
  } catch (error) {
    next(error);
  }
});

router.post('/rehearsal/check', auth('student'), async (req, res, next) => {
  try {
    const question = await one('SELECT correct_option FROM questions WHERE id = ? AND quiz_id IS NULL', [Number(req.body.questionId)]);
    if (!question) return res.status(404).json({ error: 'Rehearsal question not found.' });
    const answer = String(req.body.answer || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(answer)) return res.status(400).json({ error: 'Choose one of the available answers.' });
    res.json({ correct: answer === question.correct_option });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/start', auth('student'), async (req, res, next) => {
  try {
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [Number(req.body.quizId)]);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    if (quiz.status === 'Archived') return res.status(404).json({ error: 'Quiz not found.' });

    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [req.session.studentId]));
    if (!matchesClass(quiz, student.levelProfile)) return res.status(403).json({ error: 'This quiz is not available for your class.' });
    if (student.registrationStatus !== 'Active') return res.status(403).json({ error: 'A paid membership is required.' });
    let attempt = await one('SELECT * FROM attempts WHERE student_id = ? AND quiz_id = ?', [student.id, quiz.id]);
    if (attempt?.status === 'Submitted') return res.status(409).json({ error: 'This quiz has already been submitted.' });
    const approvedRetry = attempt && await one("SELECT id FROM retry_requests WHERE attempt_id = ? AND status = 'Approved'", [attempt.id]);
    const state = quizState(quiz);
    if (!approvedRetry && state === 'upcoming') return res.status(403).json({ error: `This quiz opens on ${new Date(quiz.scheduled_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}.` });
    if (!approvedRetry && !attempt && state === 'closed') return res.status(403).json({ error: 'This quiz is closed.' });
    if (!approvedRetry && attempt && Date.now() > attemptDeadline(quiz, attempt)) {
      // Time ran out while the student was away: submit what they had saved.
      await finalizeAttempt(attempt);
      return res.status(409).json({ error: 'Your time for this quiz is over. Your saved answers were submitted; the result appears once the admin publishes it.' });
    }

    const deviceId = req.body.deviceId || 'browser';
    if (attempt?.device_id && attempt.device_id !== deviceId) {
      return res.status(409).json({ error: 'This registration is already active on another device.' });
    }

    if (!attempt) {
      // INSERT IGNORE: a double-click or two tabs starting at once must not create a 500 error.
      await run(
        'INSERT IGNORE INTO attempts (student_id, quiz_id, token, started_at, status, device_id, last_seen_at) VALUES (?,?,?,?,?,?,?)',
        [student.id, quiz.id, crypto.randomUUID(), now(), 'In progress', deviceId, now()]
      );
      attempt = await one('SELECT * FROM attempts WHERE student_id = ? AND quiz_id = ?', [student.id, quiz.id]);
    } else {
      await run("UPDATE attempts SET status = 'In progress', device_id = ?, last_seen_at = ? WHERE id = ?", [deviceId, now(), attempt.id]);
    }

    // Assign this student's questions exactly once, even if two start requests
    // arrive together (row lock on the attempt serialises them).
    const connection = await pool.getConnection();
    let released = false;
    const release = () => { if (!released) { released = true; connection.release(); } };
    const lockedOne = async (sql, params) => (await connection.query(sql, params))[0][0];
    const lockedAll = async (sql, params) => (await connection.query(sql, params))[0];
    const lockedRun = async (sql, params) => (await connection.query(sql, params))[0];
    try {
      await connection.beginTransaction();
      await connection.query('SELECT id FROM attempts WHERE id = ? FOR UPDATE', [attempt.id]);
      const alreadyAssigned = await lockedOne('SELECT COUNT(*) AS count FROM attempt_questions WHERE attempt_id = ?', [attempt.id]);
      if (!Number(alreadyAssigned.count)) {
        let selected = [];
        if (quiz.question_template_id) {
          const distribution = await lockedAll('SELECT subject, question_count FROM question_template_subjects WHERE template_id = ?', [quiz.question_template_id]);
          for (const item of distribution) {
            const matches = await lockedAll(
              `SELECT id FROM questions WHERE subject = ? AND (quiz_id = ? OR quiz_id IS NULL)
               ORDER BY ${quiz.randomize_questions ? 'randomize ASC, CASE WHEN randomize = 0 THEN id END ASC, CASE WHEN randomize = 1 THEN RAND() END' : 'id'} LIMIT ?`,
              [item.subject, quiz.id, Number(item.question_count)]
            );
            if (matches.length < Number(item.question_count)) { await connection.rollback(); release(); return res.status(409).json({ error: `Not enough ${item.subject} questions in the question bank to meet the quiz template.` }); }
            selected.push(...matches);
          }
        } else {
          selected = await lockedAll(
            `SELECT id FROM questions WHERE quiz_id = ? ORDER BY ${quiz.randomize_questions ? 'randomize ASC, CASE WHEN randomize = 0 THEN id END ASC, CASE WHEN randomize = 1 THEN RAND() END' : 'id'}`,
            [quiz.id]
          );
        }
        if (!selected.length) { await connection.rollback(); release(); return res.status(409).json({ error: 'This quiz has no questions assigned and no usable distribution template.' }); }
        await lockedRun(
          `INSERT IGNORE INTO attempt_questions (attempt_id, question_id, display_order) VALUES ${selected.map(() => '(?,?,?)').join(',')}`,
          selected.flatMap((question, displayOrder) => [attempt.id, question.id, displayOrder])
        );
      }
      await connection.commit();
      release();
    } catch (error) {
      await connection.rollback().catch(() => {});
      release();
      throw error;
    }
    await run(
      `INSERT IGNORE INTO attempt_question_snapshots (attempt_id, question_id, display_order, question_data)
       SELECT aq.attempt_id, aq.question_id, aq.display_order,
         JSON_OBJECT('subject', q.subject, 'chapter', q.chapter, 'difficulty', q.difficulty, 'language_type', q.language_type,
           'question_en', q.question_en, 'question_ur', q.question_ur, 'option_a_en', q.option_a_en, 'option_a_ur', q.option_a_ur,
           'option_b_en', q.option_b_en, 'option_b_ur', q.option_b_ur, 'option_c_en', q.option_c_en, 'option_c_ur', q.option_c_ur,
           'option_d_en', q.option_d_en, 'option_d_ur', q.option_d_ur, 'correct_option', q.correct_option)
       FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id WHERE aq.attempt_id = ?`,
      [attempt.id]
    );
    const questions = await all(
      `SELECT q.id, q.subject, q.chapter, q.difficulty, q.language_type, q.question_en, q.question_ur,
        q.option_a_en, q.option_a_ur, q.option_b_en, q.option_b_ur, q.option_c_en, q.option_c_ur, q.option_d_en, q.option_d_ur
       FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id
       WHERE aq.attempt_id = ? ORDER BY aq.display_order`,
      [attempt.id]
    );
    const answers = await all('SELECT question_id, answer FROM attempt_answers WHERE attempt_id = ?', [attempt.id]);
    res.json({ attempt, quiz: withWindow(quiz), questions, answers, serverTime: now(), deadline: approvedRetry ? null : new Date(attemptDeadline(quiz, attempt)).toISOString() });
  } catch (error) {
    next(error);
  }
});

router.put('/attempts/:id/answer', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt || attempt.status === 'Submitted') return res.status(409).json({ error: 'Attempt is not active.' });
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [attempt.quiz_id]);
    const approvedRetry = await one("SELECT id FROM retry_requests WHERE attempt_id = ? AND status = 'Approved'", [attempt.id]);
    if (!approvedRetry && Date.now() > attemptDeadline(quiz, attempt) + 5000) {
      return res.status(403).json({ error: 'Time is up. Answers can no longer be changed.' });
    }

    const question = await one(
      'SELECT q.* FROM questions q JOIN attempt_questions aq ON aq.question_id = q.id WHERE q.id = ? AND aq.attempt_id = ?',
      [Number(req.body.questionId), attempt.id]
    );
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const answer = String(req.body.answer || '').toUpperCase();
    await run(
      `INSERT INTO attempt_answers (attempt_id, question_id, answer, is_correct, saved_at) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE answer = VALUES(answer), is_correct = VALUES(is_correct), saved_at = VALUES(saved_at)`,
      [attempt.id, question.id, answer, answer === question.correct_option ? 1 : 0, now()]
    );
    await run('UPDATE attempts SET disconnected_at = NULL, last_seen_at = ? WHERE id = ?', [now(), attempt.id]);
    res.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/:id/heartbeat', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one("SELECT * FROM attempts WHERE id = ? AND student_id = ? AND status = 'In progress'", [Number(req.params.id), req.session.studentId]);
    if (!attempt) return res.status(404).json({ error: 'Active attempt not found.' });
    const timestamp = now();
    await run('UPDATE attempts SET last_seen_at = ?, disconnected_at = NULL WHERE id = ?', [timestamp, attempt.id]);
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [attempt.quiz_id]);
    if (Date.now() <= attemptDeadline(quiz, attempt)) {
      await run("UPDATE retry_requests SET status = 'Resolved', resolved_at = ? WHERE attempt_id = ? AND status = 'Pending'", [timestamp, attempt.id]);
    }
    res.json({ active: true });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/:id/disconnect', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt || attempt.status === 'Submitted') return res.status(409).json({ error: 'Attempt is not active.' });
    await run('UPDATE attempts SET disconnected_at = ?, last_seen_at = ? WHERE id = ?', [now(), now(), attempt.id]);
    const retry = await one('SELECT id FROM retry_requests WHERE attempt_id = ?', [attempt.id]);
    if (!retry) await run('INSERT INTO retry_requests (attempt_id, reason, status, requested_at) VALUES (?,?,?,?)', [attempt.id, 'Connection interrupted during quiz.', 'Pending', now()]);
    res.json({ recorded: true });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts/:id/warning', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [attempt.quiz_id]);
    if (!quiz || Date.now() > attemptDeadline(quiz, attempt)) {
      return res.status(403).json({ error: 'The quiz window has closed.' });
    }
    await run('UPDATE attempts SET warnings = warnings + 1 WHERE id = ?', [attempt.id]);
    const warnings = attempt.warnings + 1;
    res.json({ warnings, autoSubmit: warnings >= 3 });
  } catch (error) {
    next(error);
  }
});

async function finalizeAttempt(attempt) {
  const totals = await one(
    `SELECT COALESCE(SUM(q.marks), 0) total, COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN q.marks ELSE 0 END), 0) score
     FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id
     LEFT JOIN attempt_answers a ON a.question_id = q.id AND a.attempt_id = ?
     WHERE aq.attempt_id = ?`,
    [attempt.id, attempt.id]
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
  const breakdown = await all(
    `SELECT COALESCE(q.subject, 'General') AS subject,
      COALESCE(SUM(CASE WHEN aa.is_correct = 1 THEN q.marks ELSE 0 END), 0) AS score,
      COALESCE(SUM(q.marks), 0) AS total
     FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id
     LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = ?
     WHERE aq.attempt_id = ? GROUP BY COALESCE(q.subject, 'General')`,
    [attempt.id, attempt.id]
  );
  for (const subject of breakdown) {
    await run(
      'INSERT INTO result_subjects (result_id, subject, score, total) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE score = VALUES(score), total = VALUES(total)',
      [result.id, subject.subject, subject.score, subject.total]
    );
  }
  await run("UPDATE retry_requests SET status = 'Resolved', resolved_at = ? WHERE attempt_id = ? AND status = 'Pending'", [now(), attempt.id]);
  return result;
}

router.post('/attempts/:id/submit', auth('student'), async (req, res, next) => {
  try {
    const attempt = await one('SELECT * FROM attempts WHERE id = ? AND student_id = ?', [Number(req.params.id), req.session.studentId]);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (attempt.status === 'Submitted') return res.json(await one('SELECT * FROM results WHERE attempt_id = ?', [attempt.id]));
    // Submitting after time is up is allowed: only answers saved before the deadline count.
    res.json(await finalizeAttempt(attempt));
  } catch (error) {
    next(error);
  }
});

export default router;
