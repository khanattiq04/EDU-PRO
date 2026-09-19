-- Danistan Network - optional demo data
-- Import AFTER schema.sql. Safe to re-run: every statement is guarded on the row it
-- inserts, so nothing is duplicated and existing rows are never overwritten.
--
-- Application settings are seeded by the API on first boot (see backend/src/services/settings.js),
-- so the public site renders correctly even if you skip this file.
-- The demo student account is created by `npm run seed:demo` in backend/.

SET NAMES utf8mb4;

INSERT INTO quizzes (title, description, level, stream, scheduled_at, duration_minutes, fee, prize_pool, status, created_at)
SELECT 'Biology Foundation Challenge', 'A working demo quiz for 9th Biology students.', '9th', 'Biology',
       DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 10 MINUTE, '%Y-%m-%dT%H:%i:%s.000Z'), 45, 200, 50000, 'Scheduled',
       DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM quizzes WHERE title = 'Biology Foundation Challenge') AS existing);

SET @quiz_id = (SELECT id FROM quizzes WHERE title = 'Biology Foundation Challenge' ORDER BY id LIMIT 1);

INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
  option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
  correct_option, explanation_en, explanation_ur, created_at)
SELECT @quiz_id, 'Biology', 'Cell structure', 'Medium', 'Bilingual',
  'Which organelle is known as the powerhouse of the cell?', 'سیل کا پاور ہاؤس کس عضو کو کہا جاتا ہے؟',
  'Nucleus', 'مرکزہ', 'Mitochondria', 'مائٹوکانڈریا', 'Ribosome', 'رائبوسوم', 'Chloroplast', 'کلوروپلاسٹ',
  'B', 'Mitochondria release usable energy from food.', NULL,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE @quiz_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM questions WHERE quiz_id = @quiz_id AND question_en = 'Which organelle is known as the powerhouse of the cell?') AS existing
);

INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
  option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
  correct_option, explanation_en, explanation_ur, created_at)
SELECT @quiz_id, 'Biology', 'Cell structure', 'Medium', 'Bilingual',
  'What is the basic structural unit of life?', 'زندگی کی بنیادی ساختی اکائی کیا ہے؟',
  'Tissue', 'بافت', 'Cell', 'خلیہ', 'Organ', 'عضو', 'Atom', 'ایٹم',
  'B', 'All living organisms are made of cells.', NULL,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE @quiz_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM questions WHERE quiz_id = @quiz_id AND question_en = 'What is the basic structural unit of life?') AS existing
);

INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
  option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
  correct_option, explanation_en, explanation_ur, created_at)
SELECT @quiz_id, 'Biology', 'Cell structure', 'Medium', 'Bilingual',
  'Which process moves water through a selectively permeable membrane?', 'نیم نفوذ پذیر جھلی سے پانی کی حرکت کا عمل کون سا ہے؟',
  'Diffusion', 'انتشار', 'Osmosis', 'اسموسس', 'Respiration', 'تنفس', 'Transpiration', 'نتح',
  'B', 'Osmosis is the movement of water across a selectively permeable membrane.', NULL,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE @quiz_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM questions WHERE quiz_id = @quiz_id AND question_en = 'Which process moves water through a selectively permeable membrane?') AS existing
);

INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
  option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
  correct_option, explanation_en, explanation_ur, created_at)
SELECT @quiz_id, 'Biology', 'Cell structure', 'Medium', 'Bilingual',
  'Which pigment absorbs light for photosynthesis?', 'ضیائی تالیف کے لیے روشنی کون سا رنگ دار مادہ جذب کرتا ہے؟',
  'Hemoglobin', 'ہیموگلوبن', 'Melanin', 'میلانن', 'Chlorophyll', 'کلوروفل', 'Keratin', 'کیراٹن',
  'C', 'Chlorophyll captures light energy in plant cells.', NULL,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE @quiz_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM questions WHERE quiz_id = @quiz_id AND question_en = 'Which pigment absorbs light for photosynthesis?') AS existing
);

INSERT INTO questions (quiz_id, subject, chapter, difficulty, language_type, question_en, question_ur,
  option_a_en, option_a_ur, option_b_en, option_b_ur, option_c_en, option_c_ur, option_d_en, option_d_ur,
  correct_option, explanation_en, explanation_ur, created_at)
SELECT @quiz_id, 'Biology', 'Cell structure', 'Medium', 'Bilingual',
  'Where is genetic material mainly stored in a eukaryotic cell?', 'یوکریاوٹک خلیے میں جینیاتی مادہ بنیادی طور پر کہاں محفوظ ہوتا ہے؟',
  'Cell wall', 'خلیاتی دیوار', 'Nucleus', 'مرکزہ', 'Vacuole', 'ویکیول', 'Cytoplasm', 'سائٹوپلازم',
  'B', 'The nucleus contains most of a eukaryotic cell DNA.', NULL,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE @quiz_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM questions WHERE quiz_id = @quiz_id AND question_en = 'Where is genetic material mainly stored in a eukaryotic cell?') AS existing
);

SET @month_key = DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m');

INSERT INTO content (month_key, title, type, level, stream, subject, chapter, body, created_at)
SELECT @month_key, 'Cell Structure Notes', 'Notes', '9th', 'Biology', 'Biology', 'Cell structure',
       'Cell membrane, organelles, transport and metabolism revision notes.',
       DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM content WHERE title = 'Cell Structure Notes') AS existing);

INSERT INTO content (month_key, title, type, level, stream, subject, chapter, body, created_at)
SELECT @month_key, 'Biology MCQ Practice', 'MCQ', '9th', 'Biology', 'Biology', 'Cell structure',
       'Practice set linked to the current syllabus.',
       DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM content WHERE title = 'Biology MCQ Practice') AS existing);
