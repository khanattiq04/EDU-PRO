import { all, one, run } from '../db.js';
import { monthKey, now, shiftMonthKey } from './time.js';

export const parseProfile = row => ({
  level: row.level,
  stream: row.stream,
  field: row.field,
  programName: row.program_name,
  year: row.year,
  semesterRange: row.semester_range,
  status: row.status,
  nursingType: row.nursing_type,
  programDuration: row.program_duration,
  programType: row.program_type
});

export function paymentFor(studentId) {
  return one("SELECT * FROM payments WHERE student_id = ? AND status = 'Paid' ORDER BY cycle_end DESC LIMIT 1", [studentId]);
}

export async function syncStudentStatus(studentId) {
  const payment = await paymentFor(studentId);
  const status = payment && new Date(payment.cycle_end) >= new Date() ? 'Active' : 'Disable';
  await run('UPDATE students SET registration_status = ? WHERE id = ?', [status, studentId]);
  return { status, payment };
}

export async function serializeStudent(row) {
  if (!row) return null;
  const access = await syncStudentStatus(row.id);
  return {
    id: row.id,
    fullName: row.full_name,
    fatherName: row.father_name,
    mobile: row.mobile,
    email: row.email,
    gender: row.gender,
    city: row.city,
    tehsil: row.tehsil,
    schoolName: row.school_name,
    schoolApprovalStatus: row.school_approval_status || 'Approved',
    levelProfile: parseProfile(row),
    assignedPaper: row.assigned_paper,
    registrationNumber: row.registration_number,
    registrationStatus: access.status,
    blocked: Boolean(row.blocked),
    paidThrough: access.payment?.cycle_end || null,
    createdAt: row.created_at
  };
}

// Every verified payment covers `months` consecutive months, starting with the
// month its cycle began (the month it was paid, or the month after the
// previous plan ends when a student renews early).
export async function paidMonthKeys(studentId) {
  const payments = await all(
    "SELECT cycle_start, months FROM payments WHERE student_id = ? AND status = 'Paid' AND cycle_start IS NOT NULL",
    [studentId]
  );
  const keys = new Set();
  for (const payment of payments) {
    const start = monthKey(payment.cycle_start);
    for (let i = 0; i < Number(payment.months || 0); i += 1) keys.add(shiftMonthKey(start, i));
  }
  return [...keys].sort();
}

export async function unlockedMonthKeys(studentId) {
  const current = now();
  const rows = await all(
    'SELECT DISTINCT month_key FROM content_unlocks WHERE (student_id = ? OR student_id IS NULL) AND starts_at <= ? AND (expires_at IS NULL OR expires_at > ?)',
    [studentId, current, current]
  );
  return rows.map(row => row.month_key);
}

export async function contentAccess(studentId) {
  const paid = await paidMonthKeys(studentId);
  const unlocked = await unlockedMonthKeys(studentId);
  const allowed = new Set([...paid, ...unlocked]);
  return { paidMonths: paid, unlockedMonths: unlocked, canOpen: row => !row.requires_payment || allowed.has(row.month_key) };
}

// Same rule the student panel uses: content/quiz with an empty level or
// stream is for everyone, otherwise it must match the student's class.
export function matchesClass(item, profile) {
  const level = item.level || '';
  const stream = item.stream || '';
  return (level === '' || level === 'General' || level === profile.level) && (stream === '' || stream === (profile.stream || '') || stream === (profile.programName || ''));
}
