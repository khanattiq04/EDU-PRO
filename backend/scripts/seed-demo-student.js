import { assertConnection, closePool, one, run } from '../src/db.js';
import { buildLevelProfile, generateRegistrationNumber } from '../src/services/registration.js';
import { assignQuizPaper } from '../src/services/paperAssignment.js';
import { encryptSensitive } from '../src/services/crypto.js';
import { hashPassword } from '../src/services/auth.js';
import { notify } from '../src/services/notifications.js';
import { addMonths, now } from '../src/services/time.js';

const DEMO_EMAIL = 'areeba@example.com';
const DEMO_PASSWORD = 'Student123!';

async function seedDemoStudent() {
  await assertConnection();

  let student = await one('SELECT * FROM students WHERE email = ?', [DEMO_EMAIL]);
  if (student) {
    console.log(`Demo student ${DEMO_EMAIL} already exists (id ${student.id}).`);
  } else {
    const profile = buildLevelProfile({ level: '9th', stream: 'Biology' });
    const inserted = await run(
      `INSERT INTO students (full_name, father_name, mobile, email, gender, city, tehsil, school_name, cnic_encrypted, password_hash,
        level, stream, level_profile_json, assigned_paper, registration_number, registration_status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['Areeba Khan', 'Muhammad Khan', '03001234567', DEMO_EMAIL, 'Female', 'Sargodha', 'Sargodha', 'Danistan Model School',
       encryptSensitive('35202-1234567-8'), hashPassword(DEMO_PASSWORD), profile.level, profile.stream, JSON.stringify(profile),
       assignQuizPaper(profile), generateRegistrationNumber({ gender: 'Female', city: 'Sargodha', serial: 1 }), 'Active', now()]
    );
    student = await one('SELECT * FROM students WHERE id = ?', [inserted.insertId]);
    console.log(`Created demo student: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  const payment = await one("SELECT 1 FROM payments WHERE student_id = ? AND status = 'Paid' LIMIT 1", [student.id]);
  if (!payment) {
    await run('INSERT INTO payments (student_id, amount, months, paid_at, cycle_end, status, reference) VALUES (?,?,?,?,?,?,?)',
      [student.id, 200, 1, now(), addMonths(now(), 1), 'Paid', 'DEMO-PAYMENT']);
    console.log('Added an active 1-month membership.');
  }

  await notify(student.id, 'Welcome', 'Welcome to Danistan Network', `Your registration number is ${student.registration_number}.`);
  console.log(`Registration number: ${student.registration_number}`);
  await closePool();
}

seedDemoStudent().catch(async error => {
  console.error(error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
