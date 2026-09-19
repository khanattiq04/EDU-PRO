import { run } from '../db.js';
import { now } from './time.js';

export async function notify(studentId, type, title, message, channel = 'Website') {
  await run(
    'INSERT INTO notifications (student_id, type, title, message, channel, created_at) VALUES (?,?,?,?,?,?)',
    [studentId || null, type, title, message, channel, now()]
  );
}
