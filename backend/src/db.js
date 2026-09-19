import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(here, '../database');
fs.mkdirSync(databaseDir, { recursive: true });
const db = new Database(path.join(databaseDir, 'danistan.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, father_name TEXT, mobile TEXT, email TEXT UNIQUE,
 gender TEXT NOT NULL, city TEXT NOT NULL, tehsil TEXT, school_name TEXT, cnic_encrypted TEXT, password_hash TEXT,
 level TEXT, stream TEXT, field TEXT, program_name TEXT, year TEXT, semester_range TEXT, status TEXT, nursing_type TEXT,
 program_duration TEXT, program_type TEXT, level_profile_json TEXT NOT NULL DEFAULT '{}', assigned_paper TEXT NOT NULL DEFAULT 'General',
 registration_number TEXT NOT NULL UNIQUE, registration_status TEXT NOT NULL DEFAULT 'Disable', blocked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, level TEXT NOT NULL, stream TEXT,
 scheduled_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 45, fee INTEGER NOT NULL DEFAULT 200, prize_pool INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'Draft', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER, subject TEXT, chapter TEXT, difficulty TEXT NOT NULL DEFAULT 'Medium',
 language_type TEXT NOT NULL DEFAULT 'English', question_en TEXT NOT NULL, question_ur TEXT, option_a_en TEXT NOT NULL, option_a_ur TEXT,
 option_b_en TEXT NOT NULL, option_b_ur TEXT, option_c_en TEXT NOT NULL, option_c_ur TEXT, option_d_en TEXT NOT NULL, option_d_ur TEXT,
 correct_option TEXT NOT NULL, explanation_en TEXT, explanation_ur TEXT, marks INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, months INTEGER NOT NULL,
 paid_at TEXT NOT NULL, cycle_end TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Paid', reference TEXT, FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, quiz_id INTEGER NOT NULL, token TEXT UNIQUE,
 started_at TEXT, submitted_at TEXT, status TEXT NOT NULL DEFAULT 'Not started', score INTEGER DEFAULT 0, percentage REAL DEFAULT 0,
 warnings INTEGER NOT NULL DEFAULT 0, device_id TEXT, UNIQUE(student_id, quiz_id), FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS attempt_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, question_id INTEGER NOT NULL, answer TEXT,
 is_correct INTEGER, saved_at TEXT NOT NULL, UNIQUE(attempt_id, question_id), FOREIGN KEY(attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
 FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER UNIQUE, student_id INTEGER NOT NULL, quiz_id INTEGER NOT NULL,
 score INTEGER, percentage REAL, published INTEGER NOT NULL DEFAULT 0, submitted_at TEXT, FOREIGN KEY(attempt_id) REFERENCES attempts(id) ON DELETE SET NULL,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
 channel TEXT NOT NULL DEFAULT 'Website', read_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY AUTOINCREMENT, month_key TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, level TEXT, stream TEXT,
 subject TEXT, chapter TEXT, body TEXT, file_url TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prize_disbursements (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, amount INTEGER, position INTEGER, paid_at TEXT, reference TEXT,
 FOREIGN KEY(student_id) REFERENCES students(id));
`);
const columns = db.prepare('PRAGMA table_info(students)').all().map(x => x.name);
const migrations = { password_hash: 'TEXT', blocked: 'INTEGER NOT NULL DEFAULT 0', level: 'TEXT', stream: 'TEXT', field: 'TEXT', program_name: 'TEXT', year: 'TEXT', semester_range: 'TEXT', status: 'TEXT', nursing_type: 'TEXT', program_duration: 'TEXT', program_type: 'TEXT' };
for (const [name, type] of Object.entries(migrations)) if (!columns.includes(name)) db.exec(`ALTER TABLE students ADD COLUMN ${name} ${type}`);
function ensureColumn(table, name, type) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
  if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
ensureColumn('payments', 'reference', 'TEXT');
ensureColumn('results', 'attempt_id', 'INTEGER');
const defaults = { site_name: 'Danistan Network', news_ticker: 'September quiz registration is open until 18 September | New partner discounts now available | Prize pool this month: Rs. 50,000', maintenance_mode: 'false', books_distributed: '4200', schools_visited: '38', about_text: 'Learning that travels further. Supporting students across Pakistan.' };
const setDefault = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
for (const [key, value] of Object.entries(defaults)) setDefault.run(key, value);
export function getSetting(key, fallback = '') { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback; }
export function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); }
export default db;
