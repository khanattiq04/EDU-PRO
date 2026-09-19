import { one, run } from '../db.js';

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
    levelProfile: parseProfile(row),
    assignedPaper: row.assigned_paper,
    registrationNumber: row.registration_number,
    registrationStatus: access.status,
    blocked: Boolean(row.blocked),
    paidThrough: access.payment?.cycle_end || null,
    createdAt: row.created_at
  };
}
