// Creates a test student with a verified 1-month plan, plus sample content
// so you can see month-based and class-based access working.
//   npm run seed:onemonth
import { assertConnection, closePool, ensureContentFeatures, one, run } from '../src/db.js';
import { buildLevelProfile, generateRegistrationNumber } from '../src/services/registration.js';
import { assignQuizPaper } from '../src/services/paperAssignment.js';
import { encryptSensitive } from '../src/services/crypto.js';
import { hashPassword } from '../src/services/auth.js';
import { addMonths, monthKey, now, shiftMonthKey } from '../src/services/time.js';

const EMAIL = 'onemonth@example.com';
const PASSWORD = 'Student123!';
const LEVEL = '10th';
const STREAM = 'Biology';

async function seed() {
  await assertConnection();
  await ensureContentFeatures();

  let student = await one('SELECT * FROM students WHERE email = ?', [EMAIL]);
  if (!student) {
    const profile = buildLevelProfile({ level: LEVEL, stream: STREAM });
    const next = await one('SELECT COALESCE(MAX(id), 0) + 1 AS serial FROM students');
    const inserted = await run(
      `INSERT INTO students (full_name, father_name, mobile, email, gender, city, tehsil, school_name, cnic_encrypted, password_hash,
        level, stream, level_profile_json, assigned_paper, registration_number, registration_status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['One Month Tester', 'Test Father', '03009876543', EMAIL, 'Male', 'Sargodha', 'Sargodha', 'Danistan Model School',
       encryptSensitive('35202-0000000-1'), hashPassword(PASSWORD), profile.level, profile.stream, JSON.stringify(profile),
       assignQuizPaper(profile), generateRegistrationNumber({ gender: 'Male', city: 'Sargodha', serial: next.serial }), 'Active', now()]
    );
    student = await one('SELECT * FROM students WHERE id = ?', [inserted.insertId]);
    console.log(`Created student: ${EMAIL} / ${PASSWORD}`);
  } else {
    console.log(`Student ${EMAIL} already exists (id ${student.id}) — refreshing its plan.`);
    await run('DELETE FROM payments WHERE student_id = ?', [student.id]);
  }

  // Verified 1-month plan paid today -> access to the current month only.
  const paidAt = now();
  await run(
    `INSERT INTO payments (student_id, amount, months, paid_at, cycle_start, cycle_end, status, reference, method, transaction_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [student.id, 200, 1, paidAt, paidAt, addMonths(paidAt, 1), 'Paid', 'TEST-1M', 'JazzCash', 'TEST-1M-TXN']
  );
  await run("UPDATE students SET registration_status = 'Active' WHERE id = ?", [student.id]);

  // Sample content: current month opens, previous/next month locked, other class hidden.
  const current = monthKey();
  const samples = [
    [current, `[TEST] ${LEVEL} Biology notes — ${current} (should OPEN)`, LEVEL, STREAM],
    [shiftMonthKey(current, -1), `[TEST] ${LEVEL} Biology notes — ${shiftMonthKey(current, -1)} (should be LOCKED)`, LEVEL, STREAM],
    [shiftMonthKey(current, 1), `[TEST] ${LEVEL} Biology notes — ${shiftMonthKey(current, 1)} (should be LOCKED)`, LEVEL, STREAM],
    [current, `[TEST] 9th class notes — ${current} (should be HIDDEN for 10th)`, '9th', ''],
    [current, `[TEST] All-classes notice — ${current} (should OPEN)`, '', '']
  ];
  for (const [key, title, level, stream] of samples) {
    const exists = await one('SELECT id FROM content WHERE title = ?', [title]);
    if (exists) continue;
    await run(
      `INSERT INTO content (month_key, title, type, level, stream, subject, chapter, body, requires_payment, created_at)
       VALUES (?,?,?,?,?,?,?,?,1,?)`,
      [key, title, 'Notes', level || null, stream || null, 'Biology', 'Test Chapter', `Sample notes for ${key}.`, now()]
    );
  }

  console.log(`Registration number: ${student.registration_number}`);
  console.log(`Plan: 1 month, access month = ${current}`);
  console.log('Sample [TEST] content added to My Library.');
  await closePool();
}

seed().catch(async error => {
  console.error(error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
