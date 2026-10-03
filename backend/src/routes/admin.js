import { Router } from 'express';
import pool, { all, one, run } from '../db.js';
import { auth } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { serializeStudent, syncStudentStatus } from '../services/students.js';
import { setSetting, settingsMap } from '../services/settings.js';
import { addMonths, now } from '../services/time.js';
import { configuredPlans } from './public.js';

const router = Router();
router.use(auth('admin'));

router.get('/stats', async (_req, res, next) => {
  try {
    const payments = await one("SELECT COUNT(*) count, COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) revenue FROM payments");
    const students = await one('SELECT COUNT(*) count FROM students');
    const quizzes = await one("SELECT COUNT(*) count FROM quizzes WHERE status NOT IN ('Archived', 'Draft')");
    const pendingResults = await one('SELECT COUNT(*) count FROM results WHERE published = 0');
    res.json({ students: students.count, quizzes: quizzes.count, payments: payments.count, totalPayments: payments.count, revenue: payments.revenue, pendingResults: pendingResults.count });
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
    const schoolName = b.schoolName ?? row.school_name;
    const schoolApprovalStatus = b.schoolApprovalStatus ??
      (b.schoolName !== undefined && !/^others?\s*:/i.test(String(schoolName).trim()) ? 'Approved' : row.school_approval_status);
    await run(
      'UPDATE students SET full_name = ?, mobile = ?, email = ?, school_name = ?, school_approval_status = ?, city = ?, tehsil = ?, blocked = ? WHERE id = ?',
      [b.fullName ?? row.full_name, b.mobile ?? row.mobile, b.email ?? row.email, schoolName, schoolApprovalStatus,
       b.city ?? row.city, b.tehsil ?? row.tehsil, b.blocked === undefined ? row.blocked : Number(Boolean(b.blocked)), row.id]
    );
    res.json(await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [row.id])));
  } catch (error) {
    next(error);
  }
});

router.put('/students/:id/school-approval', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const student = await one('SELECT id FROM students WHERE id = ?', [id]);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    await run("UPDATE students SET school_approval_status = 'Approved' WHERE id = ?", [id]);
    res.json(await one('SELECT id, school_name, school_approval_status FROM students WHERE id = ?', [id]));
  } catch (error) {
    next(error);
  }
});

router.get('/academic-options', async (_req, res, next) => {
  try {
    res.json(await all('SELECT * FROM academic_options ORDER BY category, parent_value, display_order, value'));
  } catch (error) {
    next(error);
  }
});

router.post('/academic-options', async (req, res, next) => {
  try {
    const { category, value, parentValue = null } = req.body || {};
    if (!['class', 'stream', 'program', 'subject'].includes(category) || !String(value || '').trim()) {
      return res.status(400).json({ error: 'Select a valid option type and provide an option name.' });
    }
    if (['stream', 'program'].includes(category) && !String(parentValue || '').trim()) {
      return res.status(400).json({ error: 'Choose the class or level for this option.' });
    }
    const normalizedParent = parentValue || '';
    const order = await one('SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM academic_options WHERE category = ? AND parent_value = ?', [category, normalizedParent]);
    const inserted = await run(
      'INSERT INTO academic_options (category, value, parent_value, display_order) VALUES (?,?,?,?)',
      [category, String(value).trim(), normalizedParent, order.next_order]
    );
    res.status(201).json(await one('SELECT * FROM academic_options WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That option already exists for this category.' });
    next(error);
  }
});

router.put('/academic-options/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const option = await one('SELECT * FROM academic_options WHERE id = ?', [id]);
    if (!option) return res.status(404).json({ error: 'Academic option not found.' });
    const value = req.body.value === undefined ? option.value : String(req.body.value).trim();
    const parentValue = req.body.parentValue === undefined ? option.parent_value : (req.body.parentValue || '');
    if (!value) return res.status(400).json({ error: 'Option name is required.' });
    if (['stream', 'program'].includes(option.category) && !parentValue) return res.status(400).json({ error: 'Choose the class or level for this option.' });
    if (['stream', 'program'].includes(option.category) && !await one("SELECT id FROM academic_options WHERE category = 'class' AND value = ?", [parentValue])) {
      return res.status(400).json({ error: 'The selected class or level does not exist.' });
    }
    const duplicate = await one(
      'SELECT id FROM academic_options WHERE category = ? AND value = ? AND parent_value = ? AND id != ?',
      [option.category, value, parentValue, id]
    );
    if (duplicate) return res.status(409).json({ error: 'That option already exists for this category.' });
    if (option.category === 'class' && value !== option.value) {
      await run('UPDATE academic_options SET parent_value = ? WHERE category IN (\'stream\', \'program\') AND parent_value = ?', [value, option.value]);
    }
    await run('UPDATE academic_options SET value = ?, parent_value = ? WHERE id = ?', [value, parentValue, id]);
    res.json(await one('SELECT * FROM academic_options WHERE id = ?', [id]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That option already exists for this category.' });
    next(error);
  }
});

router.delete('/academic-options/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const option = await one('SELECT * FROM academic_options WHERE id = ?', [id]);
    if (option?.category === 'class') await run('DELETE FROM academic_options WHERE category IN (\'stream\', \'program\') AND parent_value = ?', [option.value]);
    await run('DELETE FROM academic_options WHERE id = ?', [id]);
    res.status(204).end();
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

router.get('/question-templates', async (_req, res, next) => {
  try {
    const templates = await all('SELECT * FROM question_templates ORDER BY level, stream');
    for (const template of templates) {
      template.subjects = await all('SELECT subject, question_count FROM question_template_subjects WHERE template_id = ? ORDER BY subject', [template.id]);
    }
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.post('/question-templates', async (req, res, next) => {
  try {
    const { name, level, stream = '', subjects } = req.body || {};
    if (!String(name || '').trim() || !String(level || '').trim() || !Array.isArray(subjects) || !subjects.length) {
      return res.status(400).json({ error: 'Template name, class/level, and at least one subject count are required.' });
    }
    if (subjects.some(item => !String(item.subject || '').trim() || !Number.isInteger(Number(item.questionCount)) || Number(item.questionCount) < 1)) {
      return res.status(400).json({ error: 'Every template subject must have a name and a positive whole question count.' });
    }
    const duplicateSubjects = subjects.map(item => String(item.subject).trim().toLowerCase());
    if (new Set(duplicateSubjects).size !== duplicateSubjects.length) return res.status(400).json({ error: 'Template subjects must be unique.' });
    const existing = await one('SELECT id FROM question_templates WHERE level = ? AND stream = ?', [level, stream]);
    let templateId;
    if (existing) {
      templateId = existing.id;
      await run('UPDATE question_templates SET name = ? WHERE id = ?', [String(name).trim(), templateId]);
      await run('DELETE FROM question_template_subjects WHERE template_id = ?', [templateId]);
    } else {
      const result = await run('INSERT INTO question_templates (name, level, stream, created_at) VALUES (?,?,?,?)', [String(name).trim(), level, stream, now()]);
      templateId = result.insertId;
    }
    for (const item of subjects) await run(
      'INSERT INTO question_template_subjects (template_id, subject, question_count) VALUES (?,?,?)',
      [templateId, String(item.subject).trim(), Number(item.questionCount)]
    );
    res.status(201).json(await one('SELECT * FROM question_templates WHERE id = ?', [templateId]));
  } catch (error) {
    next(error);
  }
});

router.delete('/question-templates/:id', async (req, res, next) => {
  try {
    const used = await one('SELECT id FROM quizzes WHERE question_template_id = ? LIMIT 1', [Number(req.params.id)]);
    if (used) return res.status(409).json({ error: 'This template is assigned to a quiz. Choose another template before deleting it.' });
    await run('DELETE FROM question_templates WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes', async (req, res, next) => {
  try {
    const { title, description, level, stream, scheduledAt, durationMinutes = 45, fee = 200, prizePool = 0, prizeFirst = 0, prizeSecond = 0, prizeThird = 0, questionTemplateId = null, randomizeQuestions = true, status = 'Scheduled' } = req.body || {};
    if (!title || !level || !scheduledAt) return res.status(400).json({ error: 'Title, level and schedule are required.' });
    if (![durationMinutes, fee, prizePool, prizeFirst, prizeSecond, prizeThird].every(value => Number.isFinite(Number(value)) && Number(value) >= 0)) return res.status(400).json({ error: 'Duration, fees, and prize amounts must be non-negative numbers.' });
    const inserted = await run(
      'INSERT INTO quizzes (title, description, level, stream, scheduled_at, duration_minutes, fee, prize_pool, prize_first, prize_second, prize_third, question_template_id, randomize_questions, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [title, description || null, level, stream || null, scheduledAt, Number(durationMinutes), Number(fee), Number(prizePool), Number(prizeFirst), Number(prizeSecond), Number(prizeThird), questionTemplateId || null, Number(Boolean(randomizeQuestions)), status, now()]
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
    if (['prizeFirst', 'prizeSecond', 'prizeThird', 'questionTemplateId', 'randomizeQuestions'].some(key => b[key] !== undefined)) {
      await run(
        'UPDATE quizzes SET prize_first = ?, prize_second = ?, prize_third = ?, question_template_id = ?, randomize_questions = ? WHERE id = ?',
        [b.prizeFirst ?? quiz.prize_first, b.prizeSecond ?? quiz.prize_second, b.prizeThird ?? quiz.prize_third, b.questionTemplateId === '' ? null : (b.questionTemplateId ?? quiz.question_template_id), b.randomizeQuestions === undefined ? quiz.randomize_questions : Number(Boolean(b.randomizeQuestions)), quiz.id]
      );
    }
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
    if (!b.questionEn || !b.optionAEn || !b.optionBEn || !b.optionCEn || !b.optionDEn || !['A', 'B', 'C', 'D'].includes(String(b.correctOption).toUpperCase())) {
      return res.status(400).json({ error: 'Question, four English options, and correct option are required.' });
    }
    const inserted = await run(
      `INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
        option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
        correct_option, explanation_en, explanation_ur, randomize, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.quizId || null, b.subject || null, b.chapter || null, b.difficulty || 'Medium', b.languageType || 'English',
       b.questionEn, b.questionUr || null, b.optionAEn, b.optionAUr || null, b.optionBEn, b.optionBUr || null,
       b.optionCEn, b.optionCUr || null, b.optionDEn, b.optionDUr || null, String(b.correctOption).toUpperCase(),
       b.explanationEn || null, b.explanationUr || null, Number(b.randomize !== false), now()]
    );
    res.status(201).json(await one('SELECT * FROM questions WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.post('/questions/bulk', async (req, res, next) => {
  try {
    const { questions } = req.body || {};
    if (!Array.isArray(questions) || !questions.length || questions.length > 500) {
      return res.status(400).json({ error: 'Upload between 1 and 500 questions per batch.' });
    }
    const letters = ['A', 'B', 'C', 'D'];
    const invalidRow = questions.findIndex(item =>
      !item.questionEn || letters.some(letter => !item[`option${letter}En`]) ||
      !letters.includes(String(item.correctOption || '').toUpperCase())
    );
    if (invalidRow !== -1) return res.status(400).json({ error: `Question row ${invalidRow + 2} needs an English question, four English options, and a valid correct option.` });
    const quizIds = [...new Set(questions.map(item => Number(item.quizId)).filter(id => Number.isInteger(id) && id > 0))];
    if (quizIds.length) {
      const existingQuizzes = await all(`SELECT id FROM quizzes WHERE id IN (${quizIds.map(() => '?').join(',')})`, quizIds);
      if (existingQuizzes.length !== quizIds.length) return res.status(400).json({ error: 'One or more uploaded rows reference an unknown quiz.' });
    }
    if (questions.some(item => item.quizId && (!Number.isInteger(Number(item.quizId)) || Number(item.quizId) < 1))) {
      return res.status(400).json({ error: 'Quiz IDs in the upload must be positive whole numbers or empty.' });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const b of questions) await connection.query(
        `INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
          option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
          correct_option, explanation_en, explanation_ur, randomize, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.quizId || null, b.subject || null, b.chapter || null, b.difficulty || 'Medium', b.languageType || 'English',
          b.questionEn, b.questionUr || null, b.optionAEn, b.optionAUr || null,
          b.optionBEn, b.optionBUr || null, b.optionCEn, b.optionCUr || null,
          b.optionDEn, b.optionDUr || null, String(b.correctOption).toUpperCase(),
          b.explanationEn || null, b.explanationUr || null, Number(b.randomize !== false), now()]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.status(201).json({ imported: questions.length });
  } catch (error) {
    next(error);
  }
});

const questionColumns = {
  quizId: 'quiz_id', subject: 'subject', chapter: 'chapter', difficulty: 'difficulty', languageType: 'language_type',
  questionEn: 'question_en', questionUr: 'question_ur', optionAEn: 'option_a_en', optionAUr: 'option_a_ur',
  optionBEn: 'option_b_en', optionBUr: 'option_b_ur', optionCEn: 'option_c_en', optionCUr: 'option_c_ur',
  optionDEn: 'option_d_en', optionDUr: 'option_d_ur', correctOption: 'correct_option',
  explanationEn: 'explanation_en', explanationUr: 'explanation_ur', randomize: 'randomize'
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
    const used = await one('SELECT attempt_id FROM attempt_questions WHERE question_id = ? LIMIT 1', [Number(req.params.id)]);
    if (used) return res.status(409).json({ error: 'This question is part of a student paper and cannot be deleted. Its review record must remain available.' });
    await run('DELETE FROM questions WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/payments', async (_req, res, next) => {
  try {
    res.json(await all('SELECT p.*, s.full_name, s.registration_number, s.mobile FROM payments p JOIN students s ON s.id = p.student_id ORDER BY FIELD(p.status, \'Pending\', \'Paid\', \'Rejected\'), p.paid_at DESC'));
  } catch (error) {
    next(error);
  }
});

router.put('/payments/:id/verify', async (req, res, next) => {
  try {
    const payment = await one('SELECT * FROM payments WHERE id = ?', [Number(req.params.id)]);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status !== 'Pending') return res.status(409).json({ error: 'Only pending payments can be verified or rejected.' });
    const status = req.body.status;
    if (!['Paid', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Set payment status to Paid or Rejected.' });
    const paidAt = now();
    const activePayment = status === 'Paid'
      ? await one("SELECT cycle_end FROM payments WHERE student_id = ? AND status = 'Paid' AND cycle_end > ? ORDER BY cycle_end DESC LIMIT 1", [payment.student_id, paidAt])
      : null;
    const cycleStart = activePayment?.cycle_end || paidAt;
    const cycleEnd = status === 'Paid' ? addMonths(cycleStart, payment.months) : payment.cycle_end;
    const update = await run(
      'UPDATE payments SET status = ?, paid_at = ?, cycle_start = ?, cycle_end = ? WHERE id = ? AND status = \'Pending\'',
      [status, status === 'Paid' ? paidAt : payment.paid_at, status === 'Paid' ? cycleStart : payment.cycle_start, cycleEnd, payment.id]
    );
    if (!update.affectedRows) return res.status(409).json({ error: 'This payment has already been reviewed.' });
    await syncStudentStatus(payment.student_id);
    if (status === 'Paid') await notify(payment.student_id, 'Payment Verified', 'Membership payment verified', `Your ${payment.months}-month membership has been activated.`);
    else await notify(payment.student_id, 'Payment Rejected', 'Payment needs attention', 'Your payment could not be verified. Review the transaction details and contact support or submit a corrected payment.');
    const updated = await one('SELECT * FROM payments WHERE id = ?', [payment.id]);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get('/payments/:id/receipt', async (req, res, next) => {
  try {
    const receipt = await one(
      `SELECT p.id, p.amount, p.months, p.paid_at, p.cycle_start, p.cycle_end, p.status, p.method, p.transaction_id,
        s.full_name, s.registration_number, s.email, s.mobile
       FROM payments p JOIN students s ON s.id = p.student_id WHERE p.id = ?`,
      [Number(req.params.id)]
    );
    if (!receipt) return res.status(404).json({ error: 'Payment receipt not found.' });
    res.json(receipt);
  } catch (error) {
    next(error);
  }
});

router.put('/payment-plans', async (req, res, next) => {
  try {
    const { plans } = req.body || {};
    const months = [1, 3, 6, 12];
    if (!Array.isArray(plans) || plans.length !== months.length ||
        plans.some((plan, index) => Number(plan.months) !== months[index] ||
          plan.amount === null || plan.amount === '' || !Number.isSafeInteger(Number(plan.amount)) || Number(plan.amount) < 0)) {
      return res.status(400).json({ error: 'Set a non-negative whole-rupee price for each 1, 3, 6, and 12 month plan.' });
    }
    await setSetting('plan_pricing', JSON.stringify(plans.map(plan => ({ months: Number(plan.months), amount: Number(plan.amount) }))));
    res.json(await configuredPlans());
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

router.get('/results/:id/paper', async (req, res, next) => {
  try {
    const result = await one(
      'SELECT r.*, s.full_name, s.school_name, s.registration_number, q.title FROM results r JOIN students s ON s.id = r.student_id JOIN quizzes q ON q.id = r.quiz_id WHERE r.id = ?',
      [Number(req.params.id)]
    );
    if (!result) return res.status(404).json({ error: 'Result not found.' });
    const snapshots = await all(
      `SELECT qs.display_order, qs.question_id, qs.question_data, aa.answer
       FROM attempt_question_snapshots qs
       LEFT JOIN attempt_answers aa ON aa.attempt_id = qs.attempt_id AND aa.question_id = qs.question_id
       WHERE qs.attempt_id = ? ORDER BY qs.display_order`,
      [result.attempt_id]
    );
    const paper = snapshots.map(snapshot => {
      const question = JSON.parse(snapshot.question_data);
      return {
        ...question,
        display_order: snapshot.display_order,
        question_id: snapshot.question_id,
        answer: snapshot.answer,
        is_correct: snapshot.answer === question.correct_option ? 1 : 0
      };
    });
    const subjects = await all('SELECT subject, score, total FROM result_subjects WHERE result_id = ? ORDER BY subject', [result.id]);
    res.json({ result, paper, subjects });
  } catch (error) {
    next(error);
  }
});

router.get('/rankings', async (req, res, next) => {
  try {
    const quizId = req.query.quizId ? Number(req.query.quizId) : null;
    const scope = String(req.query.scope || 'overall');
    if (!['overall', 'class', 'school'].includes(scope)) return res.status(400).json({ error: 'Ranking scope is invalid.' });
    const partition = scope === 'class' ? ', s.level' : scope === 'school' ? ', s.school_name' : '';
    const scopeCondition = scope === 'class' ? 'AND s.level = ?' : scope === 'school' ? 'AND s.school_name = ?' : '';
    const scopeValue = scope === 'class' ? String(req.query.level || '') : String(req.query.school || '');
    const rows = await all(
      `SELECT r.id result_id, r.quiz_id, r.score, r.percentage, s.id student_id, s.full_name, s.school_name,
        s.registration_number, s.level,
        RANK() OVER (PARTITION BY r.quiz_id${partition} ORDER BY r.percentage DESC, r.score DESC, r.submitted_at ASC) rank_position
       FROM results r JOIN students s ON s.id = r.student_id
       WHERE r.published = 1 AND (? IS NULL OR r.quiz_id = ?) ${scopeCondition}
       ORDER BY r.quiz_id, rank_position`,
      scopeCondition ? [quizId, quizId, scopeValue] : [quizId, quizId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/retries', async (_req, res, next) => {
  try {
    await run(
      `INSERT IGNORE INTO retry_requests (attempt_id, reason, status, requested_at)
       SELECT a.id, 'Connection interrupted during quiz.', 'Pending', COALESCE(a.disconnected_at, a.last_seen_at, a.started_at)
       FROM attempts a
       WHERE a.status = 'In progress'
         AND (a.disconnected_at IS NOT NULL OR TIMESTAMPDIFF(SECOND,
           STR_TO_DATE(REPLACE(REPLACE(COALESCE(a.last_seen_at, a.started_at), 'T', ' '), 'Z', ''), '%Y-%m-%d %H:%i:%s.%f'),
           UTC_TIMESTAMP()) > 45)`
    );
    const pending = await all(
      `SELECT rr.*, a.student_id, a.quiz_id, s.full_name, s.registration_number, q.title,
        q.scheduled_at, q.duration_minutes
       FROM retry_requests rr JOIN attempts a ON a.id = rr.attempt_id
       JOIN students s ON s.id = a.student_id JOIN quizzes q ON q.id = a.quiz_id
       WHERE rr.status = 'Pending' ORDER BY rr.requested_at`
    );
    res.json(pending.filter(item =>
      Date.now() > new Date(item.scheduled_at).getTime() + Number(item.duration_minutes) * 60000
    ));
  } catch (error) {
    next(error);
  }
});

router.put('/retries/decision', async (req, res, next) => {
  try {
    const { ids, decision } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || !ids.every(id => Number.isInteger(Number(id))) ||
        !['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Choose pending retry requests and approve or reject them.' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const updated = await run(
      `UPDATE retry_requests SET status = ?, resolved_at = ? WHERE id IN (${placeholders}) AND status = 'Pending'`,
      [decision, now(), ...ids.map(Number)]
    );
    res.json({ updated: updated.affectedRows });
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
    if (!['A', 'B', 'C', 'D'].includes(correct)) return res.status(400).json({ error: 'Correct option must be A, B, C, or D.' });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('UPDATE questions SET correct_option = ? WHERE id = ?', [correct, question.id]);
      await connection.query(
        `UPDATE attempt_question_snapshots SET question_data = JSON_SET(question_data, '$.correct_option', ?)
         WHERE question_id = ?`,
        [correct, question.id]
      );
      await connection.query(
        'UPDATE attempt_answers SET is_correct = CASE WHEN answer = ? THEN 1 ELSE 0 END WHERE question_id = ?',
        [correct, question.id]
      );
      const [attempts] = await connection.query('SELECT DISTINCT attempt_id FROM attempt_questions WHERE question_id = ?', [question.id]);
      let updatedResults = 0;
      for (const { attempt_id: attemptId } of attempts) {
        const [totalsRows] = await connection.query(
          `SELECT COALESCE(SUM(q.marks), 0) total,
            COALESCE(SUM(CASE WHEN aa.answer = JSON_UNQUOTE(JSON_EXTRACT(qs.question_data, '$.correct_option')) THEN q.marks ELSE 0 END), 0) score
           FROM attempt_question_snapshots qs JOIN questions q ON q.id = qs.question_id
           LEFT JOIN attempt_answers aa ON aa.attempt_id = qs.attempt_id AND aa.question_id = qs.question_id
           WHERE qs.attempt_id = ?`,
          [attemptId]
        );
        const totals = totalsRows[0];
        const percentage = totals.total ? Math.round(totals.score * 10000 / totals.total) / 100 : 0;
        await connection.query('UPDATE attempts SET score = ?, percentage = ? WHERE id = ?', [totals.score, percentage, attemptId]);
        const [resultRows] = await connection.query('SELECT id FROM results WHERE attempt_id = ?', [attemptId]);
        if (!resultRows.length) continue;
        const resultId = resultRows[0].id;
        await connection.query('UPDATE results SET score = ?, percentage = ? WHERE id = ?', [totals.score, percentage, resultId]);
        await connection.query('DELETE FROM result_subjects WHERE result_id = ?', [resultId]);
        await connection.query(
          `INSERT INTO result_subjects (result_id, subject, score, total)
           SELECT ?, COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(qs.question_data, '$.subject')), 'null'), 'General'),
             COALESCE(SUM(CASE WHEN aa.answer = JSON_UNQUOTE(JSON_EXTRACT(qs.question_data, '$.correct_option')) THEN q.marks ELSE 0 END), 0),
             COALESCE(SUM(q.marks), 0)
           FROM attempt_question_snapshots qs JOIN questions q ON q.id = qs.question_id
           LEFT JOIN attempt_answers aa ON aa.attempt_id = qs.attempt_id AND aa.question_id = qs.question_id
           WHERE qs.attempt_id = ? GROUP BY COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(qs.question_data, '$.subject')), 'null'), 'General')`,
          [resultId, attemptId]
        );
        updatedResults++;
      }
      await connection.commit();
      res.json({ updatedResults });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
    res.json(await all('SELECT id, month_key, title, type, level, stream, subject, chapter, body, file_url, file_name, mime_type, related_content_id, requires_payment, created_at FROM content ORDER BY month_key DESC, id DESC'));
  } catch (error) {
    next(error);
  }
});

router.post('/content', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.monthKey || !b.title || !b.type) return res.status(400).json({ error: 'Month, title and type are required.' });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.monthKey)) return res.status(400).json({ error: 'Choose a valid content month.' });
    if (b.type === 'Course') {
      const count = await one('SELECT COUNT(*) count FROM content WHERE type = ? AND month_key = ? AND COALESCE(level, \'\') = ? AND COALESCE(stream, \'\') = ?', ['Course', b.monthKey, b.level || '', b.stream || '']);
      if (Number(count.count) >= 2) return res.status(409).json({ error: 'This class and stream already have two courses for that month.' });
    }
    let fileData = null;
    let fileName = null;
    let mimeType = null;
    if (b.fileData) {
      if (typeof b.fileData !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.fileData)) return res.status(400).json({ error: 'Uploaded file data is invalid.' });
      fileData = Buffer.from(b.fileData, 'base64');
      if (!fileData.length || fileData.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'Each uploaded file must be smaller than 25 MB.' });
      fileName = String(b.fileName || '').slice(0, 255);
      const extension = fileName.split('.').pop()?.toLowerCase();
      const allowedTypes = {
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };
      if (!fileName || !allowedTypes[extension]) return res.status(400).json({ error: 'Upload an MP4, WebM, MOV, PDF, PPT, or PPTX file.' });
      mimeType = allowedTypes[extension];
    }
    if (b.type === 'Course' && !fileData) return res.status(400).json({ error: 'Upload a video, PDF, or PowerPoint file for each online course.' });
    if (b.relatedContentId && !await one(
      `SELECT id FROM content WHERE id = ? AND type = 'Course' AND month_key = ?
       AND COALESCE(level, '') = ? AND COALESCE(stream, '') = ?`,
      [Number(b.relatedContentId), b.monthKey, b.level || '', b.stream || '']
    )) {
      return res.status(400).json({ error: 'Related course was not found.' });
    }
    const inserted = await run(
      'INSERT INTO content (month_key, title, type, level, stream, subject, chapter, body, file_url, requires_payment, file_name, mime_type, file_data, related_content_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [b.monthKey, b.title, b.type, b.level || null, b.stream || null, b.subject || null, b.chapter || null, b.body || null, b.fileUrl || null, Number(b.requiresPayment !== false), fileName, mimeType, fileData, b.relatedContentId || null, now()]
    );
    if (b.chapter && b.subject && b.level) {
      await run(
        `INSERT INTO syllabus_items (month_key, level, stream, subject, chapter, topics, weightage)
         VALUES (?,?,?,?,?,?,0) ON DUPLICATE KEY UPDATE topics = IF(VALUES(topics) IS NULL OR VALUES(topics) = '', topics, VALUES(topics))`,
        [b.monthKey, b.level, b.stream || '', b.subject, b.chapter, b.topics || null]
      );
    }
    res.status(201).json(await one('SELECT id, month_key, title, type, level, stream, subject, chapter, file_name, mime_type, related_content_id, requires_payment, created_at FROM content WHERE id = ?', [inserted.insertId]));
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

router.get('/syllabus', async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT sy.*, (SELECT COUNT(*) FROM content c WHERE c.month_key = sy.month_key
         AND COALESCE(c.level, '') = sy.level AND COALESCE(c.stream, '') = sy.stream
         AND c.subject = sy.subject AND c.chapter = sy.chapter) notes_count
       FROM syllabus_items sy ORDER BY sy.month_key DESC, sy.level, sy.stream, sy.subject, sy.display_order`
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/syllabus', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.monthKey || '') || !b.level || !b.subject || !b.chapter ||
        !Number.isFinite(Number(b.weightage)) || Number(b.weightage) < 0 || Number(b.weightage) > 100) {
      return res.status(400).json({ error: 'Syllabus needs a valid month, class, subject, chapter, and weightage between 0 and 100.' });
    }
    await run(
      `INSERT INTO syllabus_items (month_key, level, stream, subject, chapter, topics, weightage, display_order)
       VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE topics = VALUES(topics), weightage = VALUES(weightage), display_order = VALUES(display_order)`,
      [b.monthKey, b.level, b.stream || '', b.subject, b.chapter, b.topics || null, Number(b.weightage), Number(b.displayOrder || 0)]
    );
    res.status(201).json(await one(
      'SELECT * FROM syllabus_items WHERE month_key = ? AND level = ? AND stream = ? AND subject = ? AND chapter = ?',
      [b.monthKey, b.level, b.stream || '', b.subject, b.chapter]
    ));
  } catch (error) {
    next(error);
  }
});

router.delete('/syllabus/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM syllabus_items WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/content-unlocks', async (_req, res, next) => {
  try {
    res.json(await all(
      `SELECT u.*, s.full_name, s.registration_number FROM content_unlocks u
       LEFT JOIN students s ON s.id = u.student_id ORDER BY u.created_at DESC`
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/content-unlocks', async (req, res, next) => {
  try {
    const b = req.body || {};
    const expiresAt = new Date(b.expiresAt);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.monthKey || '') || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      return res.status(400).json({ error: 'Choose a valid month and future unlock expiry.' });
    }
    const studentId = b.studentId ? Number(b.studentId) : null;
    if (studentId && !await one('SELECT id FROM students WHERE id = ?', [studentId])) return res.status(404).json({ error: 'Student not found.' });
    const inserted = await run(
      'INSERT INTO content_unlocks (month_key, student_id, starts_at, expires_at, reason, created_at) VALUES (?,?,?,?,?,?)',
      [b.monthKey, studentId, now(), expiresAt.toISOString(), String(b.reason || '').slice(0, 255) || null, now()]
    );
    res.status(201).json(await one(
      `SELECT u.*, s.full_name, s.registration_number FROM content_unlocks u LEFT JOIN students s ON s.id = u.student_id WHERE u.id = ?`,
      [inserted.insertId]
    ));
  } catch (error) {
    next(error);
  }
});

router.delete('/content-unlocks/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM content_unlocks WHERE id = ?', [Number(req.params.id)]);
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
    const values = req.body || {};
    if (values.plan_pricing !== undefined) return res.status(400).json({ error: 'Update plan pricing through the validated payment-plan controls.' });
    if (values.certification_passing_percentage !== undefined &&
        (!Number.isInteger(Number(values.certification_passing_percentage)) || Number(values.certification_passing_percentage) < 0 || Number(values.certification_passing_percentage) > 100)) {
      return res.status(400).json({ error: 'Certification passing percentage must be a whole number from 0 to 100.' });
    }
    if (values.certification_min_courses !== undefined &&
        (!Number.isInteger(Number(values.certification_min_courses)) || Number(values.certification_min_courses) < 0)) {
      return res.status(400).json({ error: 'Minimum required courses must be a non-negative whole number.' });
    }
    for (const [key, value] of Object.entries(values)) await setSetting(key, value);
    res.json(await settingsMap());
  } catch (error) {
    next(error);
  }
});

router.get('/homepage-content', async (_req, res, next) => {
  try {
    const [news, partners, honorees, suggestions] = await Promise.all([
      all('SELECT * FROM homepage_news ORDER BY display_order, id'),
      all('SELECT * FROM partners ORDER BY display_order, id'),
      all(
        `SELECT r.id AS result_id, h.position, s.full_name AS student_name, s.school_name, r.percentage, r.score, q.title AS quiz_title
         FROM homepage_honorees h
         JOIN results r ON r.id = h.result_id AND r.published = 1
         JOIN students s ON s.id = r.student_id
         JOIN quizzes q ON q.id = r.quiz_id
         ORDER BY h.display_order, h.position`
      ),
      all(
        `SELECT r.id AS result_id, s.full_name AS student_name, s.school_name, r.percentage, r.score, q.title AS quiz_title
         FROM results r
         JOIN students s ON s.id = r.student_id
         JOIN quizzes q ON q.id = r.quiz_id
         WHERE r.published = 1
           AND r.quiz_id = (SELECT r2.quiz_id FROM results r2 JOIN quizzes q2 ON q2.id = r2.quiz_id WHERE r2.published = 1 ORDER BY q2.scheduled_at DESC LIMIT 1)
         ORDER BY r.percentage DESC, r.score DESC
         LIMIT 10`
      )
    ]);
    res.json({ news, partners, honorees, suggestions: suggestions.map((item, index) => ({ ...item, position: index + 1 })) });
  } catch (error) {
    next(error);
  }
});

router.post('/homepage-news', async (req, res, next) => {
  try {
    const { message, expiresAt = null } = req.body || {};
    if (!String(message || '').trim()) return res.status(400).json({ error: 'News message is required.' });
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return res.status(400).json({ error: 'Expiry date must use YYYY-MM-DD format.' });
    const order = await one('SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM homepage_news');
    const inserted = await run(
      'INSERT INTO homepage_news (message, expires_at, display_order, created_at) VALUES (?,?,?,?)',
      [String(message).trim(), expiresAt || null, order.next_order, now()]
    );
    res.status(201).json(await one('SELECT * FROM homepage_news WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.put('/homepage-news/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await one('SELECT * FROM homepage_news WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ error: 'News item not found.' });
    const message = req.body.message === undefined ? item.message : String(req.body.message).trim();
    const expiresAt = req.body.expiresAt === undefined ? item.expires_at : (req.body.expiresAt || null);
    if (!message) return res.status(400).json({ error: 'News message is required.' });
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return res.status(400).json({ error: 'Expiry date must use YYYY-MM-DD format.' });
    await run('UPDATE homepage_news SET message = ?, expires_at = ? WHERE id = ?', [message, expiresAt, id]);
    res.json(await one('SELECT * FROM homepage_news WHERE id = ?', [id]));
  } catch (error) {
    next(error);
  }
});

router.put('/homepage-news-order', async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(Number(id)))) return res.status(400).json({ error: 'News order must be an array of item IDs.' });
    for (const [index, id] of ids.entries()) await run('UPDATE homepage_news SET display_order = ? WHERE id = ?', [index, Number(id)]);
    res.json(await all('SELECT * FROM homepage_news ORDER BY display_order, id'));
  } catch (error) {
    next(error);
  }
});

router.delete('/homepage-news/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM homepage_news WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/partners', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!String(b.name || '').trim() || !String(b.category || '').trim()) return res.status(400).json({ error: 'Partner name and category are required.' });
    const discount = Number(b.discountPercent);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return res.status(400).json({ error: 'Discount must be between 0 and 100 percent.' });
    const order = await one('SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM partners');
    const inserted = await run(
      'INSERT INTO partners (name, category, discount_percent, logo_url, display_order, created_at) VALUES (?,?,?,?,?,?)',
      [String(b.name).trim(), String(b.category).trim(), discount, b.logoUrl || null, order.next_order, now()]
    );
    res.status(201).json(await one('SELECT * FROM partners WHERE id = ?', [inserted.insertId]));
  } catch (error) {
    next(error);
  }
});

router.put('/partners-order', async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(Number(id)))) return res.status(400).json({ error: 'Partner order must be an array of item IDs.' });
    for (const [index, id] of ids.entries()) await run('UPDATE partners SET display_order = ? WHERE id = ?', [index, Number(id)]);
    res.json(await all('SELECT * FROM partners ORDER BY display_order, id'));
  } catch (error) {
    next(error);
  }
});

router.put('/partners/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const partner = await one('SELECT * FROM partners WHERE id = ?', [id]);
    if (!partner) return res.status(404).json({ error: 'Partner not found.' });
    const b = req.body || {};
    const name = b.name === undefined ? partner.name : String(b.name).trim();
    const category = b.category === undefined ? partner.category : String(b.category).trim();
    const discount = b.discountPercent === undefined ? Number(partner.discount_percent) : Number(b.discountPercent);
    if (!name || !category) return res.status(400).json({ error: 'Partner name and category are required.' });
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return res.status(400).json({ error: 'Discount must be between 0 and 100 percent.' });
    await run('UPDATE partners SET name = ?, category = ?, discount_percent = ?, logo_url = ? WHERE id = ?', [name, category, discount, b.logoUrl === undefined ? partner.logo_url : (b.logoUrl || null), id]);
    res.json(await one('SELECT * FROM partners WHERE id = ?', [id]));
  } catch (error) {
    next(error);
  }
});

router.delete('/partners/:id', async (req, res, next) => {
  try {
    await run('DELETE FROM partners WHERE id = ?', [Number(req.params.id)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/homepage-honorees/:resultId', async (req, res, next) => {
  try {
    const resultId = Number(req.params.resultId);
    const result = await one('SELECT id FROM results WHERE id = ? AND published = 1', [resultId]);
    if (!result) return res.status(404).json({ error: 'Only published results can be featured.' });
    const position = Number(req.body.position || 1);
    if (!Number.isInteger(position) || position < 1 || position > 10) return res.status(400).json({ error: 'Position must be between 1 and 10.' });
    const order = await one('SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM homepage_honorees');
    await run(
      'INSERT INTO homepage_honorees (result_id, position, display_order, created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE position = VALUES(position)',
      [resultId, position, order.next_order, now()]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/homepage-honorees/:resultId', async (req, res, next) => {
  try {
    await run('DELETE FROM homepage_honorees WHERE result_id = ?', [Number(req.params.resultId)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
