import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'danistan_network',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true
});

async function select(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export { select as all };

export async function one(sql, params = []) {
  const rows = await select(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

export async function assertConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function ensureStudentSessions() {
  await run(`CREATE TABLE IF NOT EXISTS student_sessions (
    student_id INT UNSIGNED NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (student_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function ensureHomepageContent() {
  await run(`CREATE TABLE IF NOT EXISTS homepage_news (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    message VARCHAR(500) NOT NULL,
    expires_at VARCHAR(40) NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_homepage_news_order (display_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS partners (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(190) NOT NULL,
    category VARCHAR(120) NOT NULL,
    discount_percent DECIMAL(5,2) NOT NULL,
    logo_url VARCHAR(500) NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_partners_order (display_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS homepage_honorees (
    result_id INT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (result_id),
    KEY idx_homepage_honorees_order (display_order, position),
    CONSTRAINT fk_homepage_honorees_result FOREIGN KEY (result_id) REFERENCES results (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function ensureAcademicOptions() {
  await run(`CREATE TABLE IF NOT EXISTS academic_options (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    category VARCHAR(30) NOT NULL,
    value VARCHAR(120) NOT NULL,
    parent_value VARCHAR(120) NOT NULL DEFAULT '',
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_academic_option (category, value, parent_value),
    KEY idx_academic_options_parent (category, parent_value, display_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const parentColumn = await one(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'academic_options' AND COLUMN_NAME = 'parent_value'`
  );
  if (parentColumn?.IS_NULLABLE === 'YES') {
    await run("UPDATE academic_options SET parent_value = '' WHERE parent_value IS NULL");
    await run("ALTER TABLE academic_options MODIFY parent_value VARCHAR(120) NOT NULL DEFAULT ''");
  }
  const columns = await all(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'school_approval_status'`
  );
  if (!columns.length) await run("ALTER TABLE students ADD COLUMN school_approval_status VARCHAR(20) NOT NULL DEFAULT 'Approved'");
  const defaults = [
    ['class', '6th', null], ['class', '7th', null], ['class', '8th', null], ['class', '9th', null], ['class', '10th', null],
    ['class', '11th', null], ['class', '12th', null], ['class', 'Diploma (DAE)', null], ['class', 'Medical', null],
    ['class', 'Engineering', null], ['class', 'BA / BSc', null], ['class', 'BS', null], ['class', 'MA / MSc', null],
    ['class', 'MBA', null], ['class', 'LLB', null], ['class', 'B.Ed / M.Ed', null], ['class', 'M.Phil', null], ['class', 'PhD', null],
    ...['9th', '10th'].flatMap(level => ['Arts', 'Biology', 'Computer Science', 'General Science'].map(value => ['stream', value, level])),
    ...['11th', '12th'].flatMap(level => ['Pre-Medical', 'Pre-Engineering', 'ICS', 'I.Com', 'FA (Arts)', 'Others'].map(value => ['stream', value, level])),
    ...Object.entries({
      Medical: ['MBBS', 'BDS', 'Pharm-D', 'DPT', 'Nursing', 'Others'],
      Engineering: ['Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Software Engineering', 'Computer Engineering', 'Others'],
      'BA / BSc': ['Arts', 'Science', 'Others'],
      BS: ['Computer Science', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Others'],
      'MA / MSc': ['Arts', 'Science', 'Others'],
      MBA: ['Business Administration', 'Others'],
      LLB: ['Law', 'Others'],
      'B.Ed / M.Ed': ['Education', 'Others'],
      'M.Phil': ['Others'],
      PhD: ['Others'],
      'Diploma (DAE)': ['Civil', 'Electrical', 'Mechanical', 'Other']
    }).flatMap(([level, values]) => values.map(value => ['program', value, level])),
    ...['Biology', 'Chemistry', 'Physics', 'English', 'Mathematics'].map(value => ['subject', value, null])
  ];
  for (const [index, [category, value, parent]] of defaults.entries()) {
    await run('INSERT IGNORE INTO academic_options (category, value, parent_value, display_order) VALUES (?,?,?,?)', [category, value, parent || '', index]);
  }
}

export async function ensureQuizFeatures() {
  await run(`CREATE TABLE IF NOT EXISTS question_templates (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(190) NOT NULL,
    level VARCHAR(60) NOT NULL,
    stream VARCHAR(60) NOT NULL DEFAULT '',
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_question_template (level, stream)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS question_template_subjects (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    template_id INT UNSIGNED NOT NULL,
    subject VARCHAR(120) NOT NULL,
    question_count INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_template_subject (template_id, subject),
    CONSTRAINT fk_template_subject_template FOREIGN KEY (template_id) REFERENCES question_templates (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS attempt_questions (
    attempt_id INT UNSIGNED NOT NULL,
    question_id INT UNSIGNED NOT NULL,
    display_order INT UNSIGNED NOT NULL,
    PRIMARY KEY (attempt_id, question_id),
    UNIQUE KEY uniq_attempt_question_order (attempt_id, display_order),
    CONSTRAINT fk_attempt_questions_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE CASCADE,
    CONSTRAINT fk_attempt_questions_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS attempt_question_snapshots (
    attempt_id INT UNSIGNED NOT NULL,
    question_id INT UNSIGNED NOT NULL,
    display_order INT UNSIGNED NOT NULL,
    question_data LONGTEXT NOT NULL,
    PRIMARY KEY (attempt_id, question_id),
    UNIQUE KEY uniq_attempt_snapshot_order (attempt_id, display_order),
    CONSTRAINT fk_attempt_snapshot_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS result_subjects (
    result_id INT UNSIGNED NOT NULL,
    subject VARCHAR(120) NOT NULL,
    score INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    PRIMARY KEY (result_id, subject),
    CONSTRAINT fk_result_subject_result FOREIGN KEY (result_id) REFERENCES results (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS retry_requests (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    attempt_id INT UNSIGNED NOT NULL,
    reason VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    requested_at VARCHAR(40) NOT NULL,
    resolved_at VARCHAR(40) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_retry_attempt (attempt_id),
    KEY idx_retry_status (status),
    CONSTRAINT fk_retry_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const addColumn = async (table, column, definition) => {
    const existing = await one(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!existing) await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };
  await addColumn('quizzes', 'question_template_id', 'INT UNSIGNED NULL');
  await addColumn('quizzes', 'randomize_questions', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('quizzes', 'prize_first', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await addColumn('quizzes', 'prize_second', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await addColumn('quizzes', 'prize_third', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await addColumn('questions', 'randomize', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('attempts', 'disconnected_at', 'VARCHAR(40) NULL');
  await addColumn('attempts', 'last_seen_at', 'VARCHAR(40) NULL');
  await run(
    `INSERT IGNORE INTO attempt_question_snapshots (attempt_id, question_id, display_order, question_data)
     SELECT aq.attempt_id, aq.question_id, aq.display_order,
       JSON_OBJECT('subject', q.subject, 'chapter', q.chapter, 'difficulty', q.difficulty, 'language_type', q.language_type,
         'question_en', q.question_en, 'question_ur', q.question_ur, 'option_a_en', q.option_a_en, 'option_a_ur', q.option_a_ur,
         'option_b_en', q.option_b_en, 'option_b_ur', q.option_b_ur, 'option_c_en', q.option_c_en, 'option_c_ur', q.option_c_ur,
         'option_d_en', q.option_d_en, 'option_d_ur', q.option_d_ur, 'correct_option', q.correct_option)
     FROM attempt_questions aq JOIN questions q ON q.id = aq.question_id`
  );
}

export async function ensureContentFeatures() {
  const addColumn = async (table, column, definition) => {
    const existing = await one(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!existing) await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };
  await addColumn('content', 'requires_payment', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumn('content', 'file_name', 'VARCHAR(255) NULL');
  await addColumn('content', 'mime_type', 'VARCHAR(120) NULL');
  await addColumn('content', 'file_data', 'LONGBLOB NULL');
  await addColumn('content', 'related_content_id', 'INT UNSIGNED NULL');
  await addColumn('payments', 'method', "VARCHAR(60) NOT NULL DEFAULT 'Other'");
  await addColumn('payments', 'transaction_id', 'VARCHAR(190) NULL');
  await addColumn('payments', 'cycle_start', 'VARCHAR(40) NULL');
  await run("UPDATE payments SET cycle_start = paid_at WHERE cycle_start IS NULL AND status = 'Paid'");
  await run(`CREATE TABLE IF NOT EXISTS syllabus_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    month_key VARCHAR(10) NOT NULL,
    level VARCHAR(60) NOT NULL,
    stream VARCHAR(60) NOT NULL DEFAULT '',
    subject VARCHAR(120) NOT NULL,
    chapter VARCHAR(190) NOT NULL,
    topics TEXT NULL,
    weightage DECIMAL(5,2) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_monthly_syllabus (month_key, level, stream, subject, chapter),
    KEY idx_syllabus_path (level, stream, month_key, subject, display_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await run(`CREATE TABLE IF NOT EXISTS content_unlocks (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    month_key VARCHAR(10) NOT NULL,
    student_id INT UNSIGNED NULL,
    starts_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    reason VARCHAR(255) NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_content_unlock_access (month_key, student_id, starts_at, expires_at),
    CONSTRAINT fk_content_unlock_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function closePool() {
  await pool.end();
}

export default pool;
