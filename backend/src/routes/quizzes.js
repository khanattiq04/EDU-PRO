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
    if (student.registrationStatus !== 'Active') return res.status(403).json({ error: 'A paid membership is required.' });
    let attempt = await one('SELECT * FROM attempts WHERE student_id = ? AND quiz_id = ?', [student.id, quiz.id]);
    if (attempt?.status === 'Submitted') return res.status(409).json({ error: 'This quiz has already been submitted.' });
    const approvedRetry = attempt && await one("SELECT id FROM retry_requests WHERE attempt_id = ? AND status = 'Approved'", [attempt.id]);
    const closesAt = new Date(new Date(quiz.scheduled_at).getTime() + Number(quiz.duration_minutes) * 60000);
    if (!approvedRetry && new Date(quiz.scheduled_at) > new Date()) return res.status(403).json({ error: 'This quiz has not started yet.' });
    if (!approvedRetry && new Date() > closesAt) return res.status(403).json({ error: 'The quiz window has closed.' });

    const deviceId = req.body.deviceId || 'browser';
    if (attempt?.device_id && attempt.device_id !== deviceId) {
      return res.status(409).json({ error: 'This registration is already active on another device.' });
    }

    if (!attempt) {
      const result = await run(
        'INSERT INTO attempts (student_id, quiz_id, token, started_at, status, device_id, last_seen_at) VALUES (?,?,?,?,?,?,?)',
        [student.id, quiz.id, crypto.randomUUID(), now(), 'In progress', deviceId, now()]
      );
      attempt = await one('SELECT * FROM attempts WHERE id = ?', [result.insertId]);
    } else {
      await run("UPDATE attempts SET status = 'In progress', device_id = ?, last_seen_at = ? WHERE id = ?", [deviceId, now(), attempt.id]);
    }

    const alreadyAssigned = await one('SELECT COUNT(*) AS count FROM attempt_questions WHERE attempt_id = ?', [attempt.id]);
    if (!Number(alreadyAssigned.count)) {
      let selected = [];
      if (quiz.question_template_id) {
        const distribution = await all('SELECT subject, question_count FROM question_template_subjects WHERE template_id = ?', [quiz.question_template_id]);
        for (const item of distribution) {
          const matches = await all(
            `SELECT id FROM questions WHERE subject = ? AND (quiz_id = ? OR quiz_id IS NULL)
             ORDER BY ${quiz.randomize_questions ? 'randomize ASC, CASE WHEN randomize = 0 THEN id END ASC, CASE WHEN randomize = 1 THEN RAND() END' : 'id'} LIMIT ?`,
            [item.subject, quiz.id, Number(item.question_count)]
          );
          if (matches.length < Number(item.question_count)) return res.status(409).json({ error: `Not enough ${item.subject} questions in the question bank to meet the quiz template.` });
          selected.push(...matches);
        }
      } else {
        selected = await all(
          `SELECT id FROM questions WHERE quiz_id = ? ORDER BY ${quiz.randomize_questions ? 'randomize ASC, CASE WHEN randomize = 0 THEN id END ASC, CASE WHEN randomize = 1 THEN RAND() END' : 'id'}`,
          [quiz.id]
        );
      }
      if (!selected.length) return res.status(409).json({ error: 'This quiz has no questions assigned and no usable distribution template.' });
      for (const [displayOrder, question] of selected.entries()) {
        await run('INSERT INTO attempt_questions (attempt_id, question_id, display_order) VALUES (?,?,?)', [attempt.id, question.id, displayOrder]);
      }
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
    res.json({ attempt, quiz, questions, answers, serverTime: now() });
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
    if (!approvedRetry && new Date() > new Date(new Date(quiz.scheduled_at).getTime() + Number(quiz.duration_minutes) * 60000)) {
      return res.status(403).json({ error: 'The quiz window has closed.' });
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
    const quiz = await one('SELECT scheduled_at, duration_minutes FROM quizzes WHERE id = ?', [attempt.quiz_id]);
    const closesAt = new Date(new Date(quiz.scheduled_at).getTime() + Number(quiz.duration_minutes) * 60000);
    if (new Date() <= closesAt) {
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
    if (!quiz || new Date() > new Date(new Date(quiz.scheduled_at).getTime() + Number(quiz.duration_minutes) * 60000)) {
      return res.status(403).json({ error: 'The quiz window has closed.' });
    }
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
    const approvedRetry = await one("SELECT id FROM retry_requests WHERE attempt_id = ? AND status = 'Approved'", [attempt.id]);
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [attempt.quiz_id]);
    if (!approvedRetry && new Date() > new Date(new Date(quiz.scheduled_at).getTime() + Number(quiz.duration_minutes) * 60000)) {
      return res.status(403).json({ error: 'The quiz window has closed.' });
    }

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
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
