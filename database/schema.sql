-- Danistan Network - MySQL schema
-- Import with phpMyAdmin (select your database first) or:
--   mysql -u USER -p YOUR_DATABASE < database/schema.sql
--
-- The statements below create tables only. Create/select the database first, e.g.
--   CREATE DATABASE danistan_network CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--
-- Timestamps are stored as ISO-8601 strings (VARCHAR) so responses stay byte-identical
-- to the previous SQLite implementation and no timezone conversion is applied.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  father_name VARCHAR(150) NULL,
  mobile VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  gender VARCHAR(20) NOT NULL,
  city VARCHAR(100) NOT NULL,
  tehsil VARCHAR(100) NULL,
  school_name VARCHAR(190) NULL,
  cnic_encrypted TEXT NULL,
  password_hash VARCHAR(255) NULL,
  level VARCHAR(60) NULL,
  stream VARCHAR(60) NULL,
  field VARCHAR(120) NULL,
  program_name VARCHAR(150) NULL,
  year VARCHAR(40) NULL,
  semester_range VARCHAR(60) NULL,
  status VARCHAR(60) NULL,
  nursing_type VARCHAR(60) NULL,
  program_duration VARCHAR(60) NULL,
  program_type VARCHAR(60) NULL,
  level_profile_json TEXT NULL,
  assigned_paper VARCHAR(190) NOT NULL DEFAULT 'General',
  registration_number VARCHAR(60) NOT NULL,
  registration_status VARCHAR(20) NOT NULL DEFAULT 'Disable',
  blocked TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_students_email (email),
  UNIQUE KEY uniq_students_registration_number (registration_number),
  KEY idx_students_mobile (mobile),
  KEY idx_students_status (registration_status),
  KEY idx_students_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quizzes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(190) NOT NULL,
  description TEXT NULL,
  level VARCHAR(60) NOT NULL,
  stream VARCHAR(60) NULL,
  scheduled_at VARCHAR(40) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  fee INT NOT NULL DEFAULT 200,
  prize_pool INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_quizzes_status (status),
  KEY idx_quizzes_scheduled_at (scheduled_at),
  KEY idx_quizzes_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id INT UNSIGNED NULL,
  subject VARCHAR(120) NULL,
  chapter VARCHAR(190) NULL,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'Medium',
  language_type VARCHAR(30) NOT NULL DEFAULT 'English',
  question_en TEXT NOT NULL,
  question_ur TEXT NULL,
  option_a_en TEXT NOT NULL,
  option_a_ur TEXT NULL,
  option_b_en TEXT NOT NULL,
  option_b_ur TEXT NULL,
  option_c_en TEXT NOT NULL,
  option_c_ur TEXT NULL,
  option_d_en TEXT NOT NULL,
  option_d_ur TEXT NULL,
  correct_option VARCHAR(2) NOT NULL,
  explanation_en TEXT NULL,
  explanation_ur TEXT NULL,
  marks INT NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_questions_quiz_id (quiz_id),
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  amount INT NOT NULL,
  months INT NOT NULL,
  paid_at VARCHAR(40) NOT NULL,
  cycle_end VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Paid',
  reference VARCHAR(120) NULL,
  PRIMARY KEY (id),
  KEY idx_payments_student_id (student_id),
  KEY idx_payments_cycle_end (cycle_end),
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  quiz_id INT UNSIGNED NOT NULL,
  token VARCHAR(64) NULL,
  started_at VARCHAR(40) NULL,
  submitted_at VARCHAR(40) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Not started',
  score INT NULL DEFAULT 0,
  percentage DOUBLE NULL DEFAULT 0,
  warnings INT NOT NULL DEFAULT 0,
  device_id VARCHAR(120) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_attempts_token (token),
  UNIQUE KEY uniq_attempts_student_quiz (student_id, quiz_id),
  CONSTRAINT fk_attempts_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attempt_answers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer VARCHAR(4) NULL,
  is_correct TINYINT(1) NULL,
  saved_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_attempt_answers (attempt_id, question_id),
  CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS results (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id INT UNSIGNED NULL,
  student_id INT UNSIGNED NOT NULL,
  quiz_id INT UNSIGNED NOT NULL,
  score INT NULL,
  percentage DOUBLE NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at VARCHAR(40) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_results_attempt (attempt_id),
  KEY idx_results_student_id (student_id),
  KEY idx_results_published (published),
  CONSTRAINT fk_results_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE SET NULL,
  CONSTRAINT fk_results_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_results_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(120) NOT NULL DEFAULT 'Website',
  read_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_student_id (student_id),
  KEY idx_notifications_created_at (created_at),
  CONSTRAINT fk_notifications_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  month_key VARCHAR(10) NOT NULL,
  title VARCHAR(190) NOT NULL,
  type VARCHAR(30) NOT NULL,
  level VARCHAR(60) NULL,
  stream VARCHAR(60) NULL,
  subject VARCHAR(120) NULL,
  chapter VARCHAR(190) NULL,
  body TEXT NULL,
  file_url VARCHAR(255) NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_content_month_key (month_key),
  KEY idx_content_level_stream (level, stream)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prize_disbursements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NULL,
  amount INT NULL,
  `position` INT NULL,
  paid_at VARCHAR(40) NULL,
  reference VARCHAR(120) NULL,
  PRIMARY KEY (id),
  KEY idx_prize_disbursements_student (student_id),
  CONSTRAINT fk_prize_disbursements_student FOREIGN KEY (student_id) REFERENCES students (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
