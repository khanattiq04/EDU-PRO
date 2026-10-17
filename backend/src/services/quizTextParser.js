// Parses a quiz written in a plain Notepad (.txt) file.
//
//   Quiz Title: October Biology Test
//   Class: 10th
//   Stream: Biology
//   Subject: Biology
//   Date: 2026-10-25 10:00
//   Duration: 45
//
//   1. What is the powerhouse of the cell?
//   A) Nucleus
//   B) Mitochondria
//   C) Ribosome
//   D) Golgi body
//   Answer: B
//
// Optional header lines: Description, Chapter, Fee, Prize Pool, Difficulty,
// Randomize (yes/no). Optional per-question lines (after the options):
// Explanation, Subject, Chapter, Difficulty, Marks. Urdu can be added after a
// " | " on the question or option line, e.g. "A) Nucleus | مرکزہ".

const HEADER_KEYS = {
  'quiz title': 'title', title: 'title', 'quiz name': 'title', 'test title': 'title',
  description: 'description',
  class: 'level', level: 'level', 'class / level': 'level',
  stream: 'stream', program: 'stream', group: 'stream',
  subject: 'subject',
  chapter: 'chapter',
  date: 'date', 'scheduled at': 'date', schedule: 'date', 'date & time': 'date', 'date and time': 'date', 'start time': 'date',
  duration: 'duration', 'duration (minutes)': 'duration', time: 'duration',
  fee: 'fee',
  'prize pool': 'prizePool', prize: 'prizePool',
  difficulty: 'difficulty',
  randomize: 'randomize', shuffle: 'randomize',
  language: 'language'
};

const QUESTION_KEYS = {
  answer: 'answer', ans: 'answer', 'correct answer': 'answer', correct: 'answer', key: 'answer',
  explanation: 'explanation', reason: 'explanation',
  subject: 'subject', chapter: 'chapter', difficulty: 'difficulty', marks: 'marks'
};

const QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[.):\-]\s*(.*)$/i;
const OPTION_LINE = /^\(?([A-Da-d])\s*[).:\-]\s*(.*)$/;
const KEY_VALUE = /^([A-Za-z][A-Za-z /&()]{0,30}?)\s*[:=]\s*(.*)$/;

const splitUrdu = text => {
  const index = text.indexOf(' | ');
  if (index === -1) return [text.trim(), null];
  return [text.slice(0, index).trim(), text.slice(index + 3).trim() || null];
};

const hasUrdu = text => /[؀-ۿ]/.test(text || '');

function parseDate(value) {
  const text = String(value || '').trim();
  // 2026-10-25 10:00 | 2026-10-25T10:00 | 25-10-2026 10:00 | 25/10/2026 10:00 AM
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i);
  let year; let month; let day; let hour = 9; let minute = 0; let meridiem;
  if (m) [, year, month, day, hour = 9, minute = 0, meridiem] = m;
  else {
    m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i);
    if (!m) return null;
    [, day, month, year, hour = 9, minute = 0, meridiem] = m;
  }
  hour = Number(hour);
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;
  }
  const d = new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute));
  if (d.getFullYear() !== Number(year) || d.getMonth() !== Number(month) - 1 || d.getDate() !== Number(day) || hour > 23 || Number(minute) > 59) return null;
  const pad = n => String(n).padStart(2, '0');
  // Same shape the admin form's datetime-local input saves.
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

const yesNo = value => !/^(no|false|0|off|fixed)$/i.test(String(value).trim());

export function parseQuizText(rawText) {
  const text = String(rawText || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const header = {};
  const questions = [];
  const errors = [];
  const warnings = [];
  let current = null;
  let lastField = null; // which text a continuation line belongs to

  const finish = () => {
    if (!current) return;
    const q = current;
    const label = `Question ${q.number} (line ${q.line})`;
    if (!q.questionEn && !q.questionUr) errors.push(`${label}: question text is missing.`);
    for (const letter of ['A', 'B', 'C', 'D']) {
      if (!q.options[letter]) errors.push(`${label}: option ${letter} is missing.`);
    }
    if (!q.answer) errors.push(`${label}: add an "Answer: A/B/C/D" line.`);
    questions.push(q);
    current = null;
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (!line) { lastField = null; return; }
    if (/^(#|\/\/)/.test(line) || /^[-=_*]{3,}$/.test(line)) return;

    const start = line.match(QUESTION_START);
    if (start) {
      finish();
      const [en, ur] = splitUrdu(start[2]);
      current = {
        number: Number(start[1]), line: lineNo, questionEn: en, questionUr: ur,
        options: {}, optionsUr: {}, answer: null, explanation: null,
        subject: null, chapter: null, difficulty: null, marks: 1
      };
      lastField = 'question';
      return;
    }

    if (current) {
      const option = line.match(OPTION_LINE);
      if (option && !current.answer) {
        const letter = option[1].toUpperCase();
        let body = option[2];
        if (/\s*(\*|\(correct\)|✓|✔)\s*$/i.test(body)) {
          body = body.replace(/\s*(\*|\(correct\)|✓|✔)\s*$/i, '');
          current.starred = letter;
        }
        const [en, ur] = splitUrdu(body);
        if (current.options[letter]) warnings.push(`Question ${current.number}: option ${letter} appears twice (line ${lineNo}); the last one is used.`);
        current.options[letter] = en;
        current.optionsUr[letter] = ur;
        lastField = `option${letter}`;
        return;
      }
      const kv = line.match(KEY_VALUE);
      const key = kv && QUESTION_KEYS[kv[1].trim().toLowerCase()];
      if (key) {
        const value = kv[2].trim();
        if (key === 'answer') {
          const letter = value.replace(/^option\s*/i, '').replace(/[().]/g, '').trim().charAt(0).toUpperCase();
          if (!['A', 'B', 'C', 'D'].includes(letter)) errors.push(`Line ${lineNo}: answer must be A, B, C or D (found "${value}").`);
          else current.answer = letter;
        } else if (key === 'explanation') current.explanation = value;
        else if (key === 'marks') current.marks = Math.max(1, Number.parseInt(value, 10) || 1);
        else if (key === 'difficulty') current.difficulty = normalizeDifficulty(value, lineNo, warnings);
        else current[key] = value;
        lastField = key === 'explanation' ? 'explanation' : null;
        return;
      }
      // Continuation of a long question / option / explanation on the next line.
      if (lastField === 'question') { current.questionEn = `${current.questionEn} ${line}`.trim(); return; }
      if (lastField?.startsWith('option')) { const l = lastField.slice(6); current.options[l] = `${current.options[l]} ${line}`.trim(); return; }
      if (lastField === 'explanation') { current.explanation = `${current.explanation} ${line}`.trim(); return; }
      warnings.push(`Line ${lineNo} was not understood and was skipped: "${line.slice(0, 60)}"`);
      return;
    }

    const kv = line.match(KEY_VALUE);
    const key = kv && HEADER_KEYS[kv[1].trim().toLowerCase()];
    if (key) { header[key] = kv[2].trim(); return; }
    if (!header.title && !questions.length) { header.title = line; return; }
    warnings.push(`Line ${lineNo} was not understood and was skipped: "${line.slice(0, 60)}"`);
  });
  finish();

  for (const q of questions) {
    if (!q.answer && q.starred) {
      q.answer = q.starred;
      const i = errors.findIndex(e => e.startsWith(`Question ${q.number} (line ${q.line}): add an "Answer`));
      if (i !== -1) errors.splice(i, 1);
    }
    delete q.starred;
  }

  const quiz = {
    title: header.title || '',
    description: header.description || null,
    level: header.level || '',
    stream: header.stream || '',
    subject: header.subject || null,
    chapter: header.chapter || null,
    scheduledAt: header.date ? parseDate(header.date) : null,
    durationMinutes: header.duration ? Number.parseInt(header.duration, 10) : 45,
    fee: header.fee !== undefined ? Number(String(header.fee).replace(/[^\d.]/g, '')) : 0,
    prizePool: header.prizePool !== undefined ? Number(String(header.prizePool).replace(/[^\d.]/g, '')) : 0,
    difficulty: header.difficulty ? normalizeDifficulty(header.difficulty, 0, warnings) : 'Medium',
    randomizeQuestions: header.randomize === undefined ? true : yesNo(header.randomize)
  };

  if (!quiz.title) errors.push('Add a "Quiz Title:" line at the top of the file.');
  if (!quiz.level) errors.push('Add a "Class:" line (e.g. Class: 10th) so the quiz reaches the right students.');
  if (header.date && !quiz.scheduledAt) errors.push(`Date "${header.date}" is not valid. Use YYYY-MM-DD HH:MM, e.g. 2026-10-25 10:00.`);
  if (!header.date) warnings.push('No "Date:" line — the quiz will be saved as a Draft (hidden from students) until you schedule it in Quiz management.');
  if (!Number.isFinite(quiz.durationMinutes) || quiz.durationMinutes < 1) errors.push('Duration must be a number of minutes, e.g. Duration: 45.');
  if (!Number.isFinite(quiz.fee) || quiz.fee < 0) errors.push('Fee must be a number.');
  if (!Number.isFinite(quiz.prizePool) || quiz.prizePool < 0) errors.push('Prize Pool must be a number.');
  if (!questions.length) errors.push('No questions found. Start each question with its number, e.g. "1. What is ...?"');
  if (questions.length > 500) errors.push('A single file can contain at most 500 questions.');

  const seen = new Map();
  for (const q of questions) {
    if (seen.has(q.number)) warnings.push(`Question number ${q.number} is used twice (lines ${seen.get(q.number)} and ${q.line}).`);
    seen.set(q.number, q.line);
  }

  const normalized = questions.map(q => {
    const anyUrdu = q.questionUr || Object.values(q.optionsUr).some(Boolean);
    const urduOnly = !anyUrdu && hasUrdu(q.questionEn);
    return {
      number: q.number,
      line: q.line,
      subject: q.subject || quiz.subject,
      chapter: q.chapter || quiz.chapter,
      difficulty: q.difficulty || quiz.difficulty,
      languageType: anyUrdu ? 'Bilingual' : urduOnly ? 'Urdu' : 'English',
      questionEn: q.questionEn,
      questionUr: q.questionUr,
      optionAEn: q.options.A || '', optionAUr: q.optionsUr.A || null,
      optionBEn: q.options.B || '', optionBUr: q.optionsUr.B || null,
      optionCEn: q.options.C || '', optionCUr: q.optionsUr.C || null,
      optionDEn: q.options.D || '', optionDUr: q.optionsUr.D || null,
      correctOption: q.answer,
      explanationEn: q.explanation,
      marks: q.marks
    };
  });

  return { quiz, questions: normalized, errors, warnings };
}

function normalizeDifficulty(value, lineNo, warnings) {
  const v = String(value).trim().toLowerCase();
  if (v.startsWith('e')) return 'Easy';
  if (v.startsWith('h')) return 'Hard';
  if (v.startsWith('m')) return 'Medium';
  warnings.push(`${lineNo ? `Line ${lineNo}: ` : ''}difficulty "${value}" not recognised, using Medium.`);
  return 'Medium';
}

export const SAMPLE_QUIZ_TEXT = `Quiz Title: October Biology Test
Class: 10th
Stream: Biology
Subject: Biology
Chapter: Cell Biology
Date: 2026-10-25 10:00
Duration: 45
Description: Monthly test for 10th class Biology students.

1. What is the powerhouse of the cell?
A) Nucleus
B) Mitochondria
C) Ribosome
D) Golgi body
Answer: B

2. Which organelle makes proteins?
A) Ribosome
B) Lysosome
C) Vacuole
D) Cell wall
Answer: A
Explanation: Ribosomes join amino acids together to build proteins.

3. Plant cell walls are mainly made of:
A) Protein
B) Starch
C) Cellulose
D) Fat
Answer: C
`;
