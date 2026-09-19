import { Router } from 'express';
import { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { serializeStudent } from '../services/students.js';
import { setSetting, settingsMap } from '../services/settings.js';
import { now } from '../services/time.js';

const router = Router();
router.use(auth('admin'));

router.get('/stats', async (_req, res, next) => {
  try {
    const payments = await one("SELECT COUNT(*) count, COALESCE(SUM(amount), 0) revenue FROM payments WHERE status = 'Paid'");
    const students = await one('SELECT COUNT(*) count FROM students');
    const quizzes = await one("SELECT COUNT(*) count FROM quizzes WHERE status != 'Archived'");
    const pendingResults = await one('SELECT COUNT(*) count FROM results WHERE published = 0');
    res.json({ students: students.count, quizzes: quizzes.count, payments: payments.count, revenue: payments.revenue, pendingResults: pendingResults.count });
  } catch (error) {
    next(error);
  }
});

router.get('/students', async (_req, res, next) => {
  try {
    const rows = await all('SELECT * FROM students ORDER BY created_at DESC');
    res.json(await Promise.all(rows.map(serializeStudent)));
  } catch (error) {
    next(error);
  }
});

router.put('/students/:id', async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM students WHERE id = ?', [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Student not found.' });
    const b = req.body || {};
    await run(
      'UPDATE students SET full_name = ?, mobile = ?, email = ?, school_name = ?, city = ?, tehsil = ?, blocked = ? WHERE id = ?',
      [b.fullName ?? row.full_name, b.mobile ?? row.mobile, b.email ?? row.email, b.schoolName ?? row.school_name,
       b.city ?? row.city, b.tehsil ?? row.tehsil, b.blocked === undefined ? row.blocked : Number(Boolean(b.blocked)), row.id]
    );
    res.json(await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [row.id])));
  } catch (error) {
    next(error);
  }
});

router.get('/quizzes', async (_req, res, next) => {
  try {
    res.json(await all('SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) question_count FROM quizzes q ORDER BY created_at DESC'));
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes', async (req, res, next) => {
  try {
    const { title, description, level, stream, scheduledAt, durationMinutes = 45, fee = 200, prizePool = 0, status = 'Scheduled' } = req.body || {};
    if (!title || !level || !scheduledAt) return res.status(400).json({ error: 'Title, level and schedule are required.' });
    const inserted = await run(
      'INSERT INTO quizzes (title, description, level, stream, scheduled_at, duration_minutes, fee, prize_pool, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [title, description || null, level, stream || null, scheduledAt, durationMinutes, fee, prizePool, status, now()]
    );
    await notify(null, 'New Quiz Announcement', 'New quiz announced', `${title} has been scheduled.`);
    res.status(201).json(await one('SELECT * FROM quizzes WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.put('/quizzes/:id', async (req, res, next) => {
  try {
    const quiz = await one('SELECT * FROM quizzes WHERE id = ?', [Number(req.params.id)]);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    const b = req.body || {};
    await run(
      'UPDATE quizzes SET title = ?, description = ?, level = ?, stream = ?, scheduled_at = ?, duration_minutes = ?, fee = ?, prize_pool = ?, status = ? WHERE id = ?',
      [b.title ?? quiz.title, b.description ?? quiz.description, b.level ?? quiz.level, b.stream ?? quiz.stream,
       b.scheduledAt ?? quiz.scheduled_at, b.durationMinutes ?? quiz.duration_minutes, b.fee ?? quiz.fee,
       b.prizePool ?? quiz.prize_pool, b.status ?? quiz.status, quiz.id]
    );
    res.json(await one('SELECT * FROM quizzes WHERE id = ?', [quiz.id]));
  } catch (error) {
    next(error);
  }
});

router.delete('/quizzes/:id', async (req, res, next) => {
  try {
    await run("UPDATE quizzes SET status = 'Archived' WHERE id = ?", [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/questions', async (req, res, next) => {
  try {
    const quizId = req.query.quizId ? Number(req.query.quizId) : null;
    res.json(await all('SELECT * FROM questions WHERE (? IS NULL OR quiz_id = ?) ORDER BY id DESC', [quizId, quizId]));
  } catch (error) {
    next(error);
  }
});

router.post('/questions', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.questionEn || !b.optionAEn || !b.optionBEn || !b.optionCEn || !b.optionDEn || !b.correctOption) {
      return res.status(400).json({ error: 'Question, four options and correct option are required.' });
    }
    const inserted = await run(
      `INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
        option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
        correct_option, explanation_en, explanation_ur, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.quizId || null, b.subject || null, b.chapter || null, b.difficulty || 'Medium', b.languageType || 'English',
       b.questionEn, b.questionUr || null, b.optionAEn, b.optionAUr || null, b.optionBEn, b.optionBUr || null,
       b.optionCEn, b.optionCUr || null, b.optionDEn, b.optionDUr || null, String(b.correctOption).toUpperCase(),
       b.explanationEn || null, b.explanationUr || null, now()]
    );
    res.status(201).json(await one('SELECT * FROM questions WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

const questionColumns = {
  quizId: 'quiz_id', subject: 'subject', chapter: 'chapter', difficulty: 'difficulty', languageType: 'language_type',
  questionEn: 'question_en', questionUr: 'question_ur', optionAEn: 'option_a_en', optionAUr: 'option_a_ur',
  optionBEn: 'option_b_en', optionBUr: 'option_b_ur', optionCEn: 'option_c_en', optionCUr: 'option_c_ur',
  optionDEn: 'option_d_en', optionDUr: 'option_d_ur', correctOption: 'correct_option',
  explanationEn: 'explanation_en', explanationUr: 'explanation_ur'
};

router.put('/questions/:id', async (req, res, next) => {
  try {
    const question = await one('SELECT * FROM questions WHERE id = ?', [Number(req.params.id)]);
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    const b = req.body || {};
    for (const [field, column] of Object.entries(questionColumns)) {
      if (b[field] !== undefined) await run(`UPDATE questions SET ${column} = ? WHERE id = ?`, [b[field], question.id]);
    }
    res.json(await one('SELECT * FROM questions WHERE id = ?', [question.id]));
  } catch (error) {
    next(error);
  }
});

router.delete('/questions/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM questions WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/payments', async (_req, res, next) => {
  try {
    res.json(await all('SELECT p.*, s.full_name, s.registration_number FROM payments p JOIN students s ON s.id = p.student_id ORDER BY p.paid_at DESC'));
  } catch (error) {
    next(error);
  }
});

router.get('/results', async (_req, res, next) => {
  try {
    res.json(await all('SELECT r.*, s.full_name, s.school_name, s.registration_number, q.title FROM results r JOIN students s ON s.id = r.student_id JOIN quizzes q ON q.id = r.quiz_id ORDER BY r.submitted_at DESC'));
  } catch (error) {
    next(error);
  }
});

router.put('/results/:id/publish', async (req, res, next) => {
  try {
    const published = req.body.published === false ? 0 : 1;
    await run('UPDATE results SET published = ? WHERE id = ?', [published, Number(req.params.id)]);
    const result = await one('SELECT * FROM results WHERE id = ?', [Number(req.params.id)]);
    if (result && published) await notify(result.student_id, 'Result Published', 'Result published', 'Your quiz result is ready to view.', 'Website,Email,SMS');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/results/recheck/:questionId', async (req, res, next) => {
  try {
    const question = await one('SELECT * FROM questions WHERE id = ?', [Number(req.params.questionId)]);
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const correct = String(req.body.correctOption || question.correct_option).toUpperCase();
    await run('UPDATE questions SET correct_option = ? WHERE id = ?', [correct, question.id]);
    await run('UPDATE attempt_answers SET is_correct = CASE WHEN answer = ? THEN 1 ELSE 0 END WHERE question_id = ?', [correct, question.id]);

    const attempts = await all('SELECT DISTINCT attempt_id FROM attempt_answers WHERE question_id = ?', [question.id]);
    for (const { attempt_id: attemptId } of attempts) {
      const attempt = await one('SELECT * FROM attempts WHERE id = ?', [attemptId]);
      const totals = await one(
        `SELECT COALESCE(SUM(q.marks), 0) total, COALESCE(SUM(CASE WHEN aa.is_correct = 1 THEN q.marks ELSE 0 END), 0) score
         FROM questions q LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = ?
         WHERE q.quiz_id = ?`,
        [attempt.id, attempt.quiz_id]
      );
      const percentage = totals.total ? Math.round(totals.score * 10000 / totals.total) / 100 : 0;
      await run('UPDATE attempts SET score = ?, percentage = ? WHERE id = ?', [totals.score, percentage, attempt.id]);
      await run('UPDATE results SET score = ?, percentage = ? WHERE attempt_id = ?', [totals.score, percentage, attempt.id]);
    }
    res.json({ rechecked: attempts.length });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', async (_req, res, next) => {
  try {
    res.json(await all('SELECT n.*, s.full_name FROM notifications n LEFT JOIN students s ON s.id = n.student_id ORDER BY n.created_at DESC'));
  } catch (error) {
    next(error);
  }
});

router.post('/notifications', async (req, res, next) => {
  try {
    const { studentId, type = 'Announcement', title, message, channel = 'Website' } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required.' });
    await notify(studentId || null, type, title, message, channel);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/content', async (_req, res, next) => {
  try {
    res.json(await all('SELECT * FROM content ORDER BY month_key DESC, id DESC'));
  } catch (error) {
    next(error);
  }
});

router.post('/content', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.monthKey || !b.title || !b.type) return res.status(400).json({ error: 'Month, title and type are required.' });
    const inserted = await run(
      'INSERT INTO content (month_key, title, type, level, stream, subject, chapter, body, file_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [b.monthKey, b.title, b.type, b.level || null, b.stream || null, b.subject || null, b.chapter || null, b.body || null, b.fileUrl || null, now()]
    );
    res.status(201).json(await one('SELECT * FROM content WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.delete('/content/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM content WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    res.json(await settingsMap());
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(req.body || {})) await setSetting(key, value);
    res.json(await settingsMap());
  } catch (error) {
    next(error);
  }
});

export default router;
