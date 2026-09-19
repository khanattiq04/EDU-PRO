import { Router } from 'express';
import { one, run } from '../db.js';
import { buildLevelProfile, generateRegistrationNumber } from '../services/registration.js';
import { assignQuizPaper } from '../services/paperAssignment.js';
import { encryptSensitive } from '../services/crypto.js';
import { createToken, hashPassword, verifyPassword } from '../services/auth.js';
import { notify } from '../services/notifications.js';
import { serializeStudent } from '../services/students.js';
import { now } from '../services/time.js';

const router = Router();

router.post('/auth/signup', async (req, res, next) => {
  try {
    const { fullName, fatherName, cnic, mobile, email, gender, city, tehsil, schoolName, password, levelProfile = {} } = req.body || {};
    if (![fullName, cnic, mobile, email, gender, city, schoolName, password, levelProfile.level].every(Boolean)) {
      return res.status(400).json({ error: 'Please complete all required signup fields.' });
    }
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const duplicate = await one('SELECT 1 FROM students WHERE lower(email) = lower(?) OR mobile = ? LIMIT 1', [email, mobile]);
    if (duplicate) return res.status(409).json({ error: 'Email or mobile number is already registered.' });

    const structured = buildLevelProfile(levelProfile);
    const sequence = await one('SELECT COALESCE(MAX(id), 0) + 1 AS serial FROM students');
    const registrationNumber = generateRegistrationNumber({ gender, city, serial: Number(sequence.serial) });
    const assignedPaper = assignQuizPaper(structured);

    const result = await run(
      `INSERT INTO students (full_name, father_name, mobile, email, gender, city, tehsil, school_name, cnic_encrypted, password_hash,
        level, stream, field, program_name, year, semester_range, status, nursing_type, program_duration, program_type,
        level_profile_json, assigned_paper, registration_number, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [fullName, fatherName || null, mobile, email, gender, city, tehsil || null, schoolName, encryptSensitive(cnic), hashPassword(password),
       structured.level, structured.stream, structured.field, structured.programName, structured.year, structured.semesterRange,
       structured.status, structured.nursingType, structured.programDuration, structured.programType,
       JSON.stringify(structured), assignedPaper, registrationNumber, now()]
    );

    const student = await serializeStudent(await one('SELECT * FROM students WHERE id = ?', [result.insertId]));
    await notify(student.id, 'Welcome', 'Welcome to Danistan Network', `Your registration number is ${registrationNumber}.`);
    res.status(201).json({ token: createToken({ role: 'student', studentId: student.id }), role: 'student', student });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const { login, password } = req.body || {};
    const row = await one('SELECT * FROM students WHERE lower(email) = lower(?) OR mobile = ? OR registration_number = ? LIMIT 1', [login, login, login]);
    if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Invalid login or password.' });
    if (row.blocked) return res.status(403).json({ error: 'This account has been blocked.' });
    res.json({ token: createToken({ role: 'student', studentId: row.id }), role: 'student', student: await serializeStudent(row) });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/admin', (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@danistan.network';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  if (email !== adminEmail || password !== adminPassword) return res.status(401).json({ error: 'Invalid admin credentials.' });
  res.json({ token: createToken({ role: 'admin' }, 12), role: 'admin', admin: { email: adminEmail, name: 'Administrator' } });
});

export default router;
