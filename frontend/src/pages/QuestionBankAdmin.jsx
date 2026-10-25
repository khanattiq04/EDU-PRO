import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, Pencil, Trash2, Upload, X } from 'lucide-react';
import './quiz-modal.css';
import { api, getSession } from '../api/client.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Notepad saves as UTF-8 (with or without BOM) or "Unicode" (UTF-16 LE).
function decodeTextFile(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

const letters = ['A', 'B', 'C', 'D'];

function QuestionCard({ q, index, onDelete }) {
  const optionText = letter => q[`option_${letter.toLowerCase()}_en`] ?? q[`option${letter}En`];
  const optionUrdu = letter => q[`option_${letter.toLowerCase()}_ur`] ?? q[`option${letter}Ur`];
  const correct = q.correct_option ?? q.correctOption;
  const question = q.question_en ?? q.questionEn;
  const questionUrdu = q.question_ur ?? q.questionUr;
  const explanation = q.explanation_en ?? q.explanationEn;
  return (
    <div className="table-row" style={{ display: 'block', padding: '14px 0' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <strong>{index + 1}. {question}</strong>
          {questionUrdu && <div dir="rtl" style={{ marginTop: 4 }}>{questionUrdu}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, marginTop: 8 }}>
            {letters.map(letter => (
              <span
                key={letter}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 13,
                  border: `1px solid ${correct === letter ? '#2e9e6a' : '#e3e7ee'}`,
                  background: correct === letter ? '#e8f7ef' : 'transparent',
                  fontWeight: correct === letter ? 600 : 400
                }}
              >
                {letter}) {optionText(letter)}{optionUrdu(letter) ? ` | ${optionUrdu(letter)}` : ''}
                {correct === letter && <Check size={13} style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
              </span>
            ))}
          </div>
          {explanation && <small style={{ display: 'block', marginTop: 6 }}>Explanation: {explanation}</small>}
          <small style={{ display: 'block', marginTop: 4 }}>
            {[q.subject, q.chapter, q.difficulty, q.language_type ?? q.languageType].filter(Boolean).join(' · ')}
          </small>
        </div>
        {onDelete && (
          <button className="icon-button" title="Delete question" onClick={() => onDelete(q)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function TextQuizImport({ refresh, flash }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async value => {
    setBusy(true);
    try {
      setPreview(await api('/api/admin/quizzes/import-text', { method: 'POST', body: JSON.stringify({ text: value, dryRun: true }) }));
    } catch (error) {
      flash(error.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return flash('The text file must be smaller than 2 MB.');
    const value = decodeTextFile(await file.arrayBuffer());
    setFileName(file.name);
    setText(value);
    check(value);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api('/api/admin/quizzes/import-text', { method: 'POST', body: JSON.stringify({ text }) });
      flash(`"${saved.quiz.title}" created with ${saved.imported} questions for ${saved.quiz.level}${saved.quiz.stream ? ` · ${saved.quiz.stream}` : ''}.`);
      setText('');
      setFileName('');
      setPreview(null);
      refresh();
    } catch (error) {
      flash(error.message);
      check(text);
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/quizzes/import-text/sample`, {
        headers: { Authorization: `Bearer ${getSession()?.token || ''}` }
      });
      if (!response.ok) throw new Error('Could not download the sample file.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sample-quiz.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      flash(error.message);
    }
  };

  const quiz = preview?.quiz;
  const errors = preview?.errors || [];
  const warnings = preview?.warnings || [];

  return (
    <section className="admin-panel" style={{ marginBottom: 20 }}>
      <div className="section-row">
        <h2>Import complete quiz from Notepad (.txt)</h2>
        <button className="button secondary" onClick={downloadSample}><Download size={15} /> Download sample .txt</button>
      </div>
      <p>
        Write the quiz details (Quiz Title, Class, Stream, Subject, Date, Duration) at the top, then numbered questions with
        options A–D and an <b>Answer:</b> line. The quiz is created with all its questions and appears in the student panel for that class.
      </p>
      <div className="button-row">
        <label className="button primary">
          <Upload size={15} /> {busy ? 'Reading…' : 'Choose .txt file'}
          <input type="file" accept=".txt,text/plain" hidden disabled={busy} onChange={chooseFile} />
        </label>
        {fileName && <span><FileText size={14} /> {fileName}</span>}
      </div>
      <details style={{ marginTop: 12 }}>
        <summary>Or paste / edit the quiz text here</summary>
        <textarea
          rows={12}
          style={{ width: '100%', fontFamily: 'monospace', marginTop: 8 }}
          value={text}
          placeholder={'Quiz Title: ...\nClass: 10th\nDate: 2026-10-25 10:00\n\n1. Question?\nA) ...\nB) ...\nC) ...\nD) ...\nAnswer: B'}
          onChange={e => setText(e.target.value)}
        />
        <button className="button secondary" disabled={busy || !text.trim()} onClick={() => check(text)}>Check text</button>
      </details>

      {preview && (
        <div style={{ marginTop: 16 }}>
          {errors.length > 0 && (
            <div className="form-error">
              <strong>Fix these before importing:</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>{errors.map(e => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="admin-notice" style={{ position: 'static', marginTop: 8 }}>
              <ul style={{ margin: '0 0 0 18px' }}>{warnings.map(w => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {quiz && (
            <div className="table-row" style={{ display: 'block', marginTop: 10 }}>
              <strong>{quiz.title || '(no title)'}</strong>
              <small style={{ display: 'block' }}>
                Class {quiz.level || '?'}{quiz.stream ? ` · ${quiz.stream}` : ''} · {quiz.subject || 'Mixed subjects'} ·{' '}
                {quiz.scheduledAt ? new Date(quiz.scheduledAt).toLocaleString() : 'No date (Draft)'} · {quiz.durationMinutes} min ·{' '}
                {preview.questions.length} questions · Status: {quiz.status}
              </small>
            </div>
          )}
          <div className="table-list" style={{ maxHeight: 480, overflow: 'auto' }}>
            {preview.questions.map((q, i) => <QuestionCard key={`${q.number}-${q.line}`} q={q} index={i} />)}
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <button className="button primary" disabled={busy || errors.length > 0} onClick={save}>
              <Check size={15} /> Create quiz with {preview.questions.length} questions
            </button>
            <button className="button secondary" onClick={() => { setPreview(null); setText(''); setFileName(''); }}>
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function QuestionBankList({ quizzes, questions, refresh, flash }) {
  const [quizFilter, setQuizFilter] = useState('');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions
      .filter(q => quizFilter === '' ? true : quizFilter === 'bank' ? !q.quiz_id : String(q.quiz_id) === quizFilter)
      .filter(q => !term || `${q.question_en} ${q.question_ur || ''} ${q.subject || ''} ${q.chapter || ''}`.toLowerCase().includes(term))
      .sort((a, b) => (quizFilter && quizFilter !== 'bank' ? a.id - b.id : b.id - a.id));
  }, [questions, quizFilter, search]);
  const selectedQuiz = quizzes.find(q => String(q.id) === quizFilter);
  const remove = async q => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api(`/api/admin/questions/${q.id}`, { method: 'DELETE' });
      refresh();
      flash('Question deleted.');
    } catch (error) {
      flash(error.message);
    }
  };
  return (
    <section className="admin-panel" style={{ marginTop: 20 }}>
      <div className="section-row">
        <h2>Question bank · {visible.length} of {questions.length}</h2>
      </div>
      <div className="form-grid">
        <label>
          Show questions of
          <select value={quizFilter} onChange={e => setQuizFilter(e.target.value)}>
            <option value="">All questions</option>
            <option value="bank">Permanent / rehearsal bank (no quiz)</option>
            {quizzes.map(q => (
              <option key={q.id} value={q.id}>
                {q.title} · {q.level}{q.stream ? ` ${q.stream}` : ''} ({q.question_count}){q.status === 'Archived' ? ' · archived' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input value={search} placeholder="Question text, subject or chapter" onChange={e => setSearch(e.target.value)} />
        </label>
      </div>
      {selectedQuiz && (
        <small style={{ display: 'block', margin: '8px 0' }}>
          {selectedQuiz.level}{selectedQuiz.stream ? ` · ${selectedQuiz.stream}` : ''} · {new Date(selectedQuiz.scheduled_at).toLocaleString()} ·{' '}
          {selectedQuiz.duration_minutes} min · Status: {selectedQuiz.status}
        </small>
      )}
      <div className="table-list">
        {visible.map((q, i) => <QuestionCard key={q.id} q={q} index={i} onDelete={remove} />)}
        {!visible.length && <div className="empty-state">No questions match this filter.</div>}
      </div>
    </section>
  );
}

export function QuizViewModal({ quiz, onClose, onEdit }) {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    api(`/api/admin/questions?quizId=${quiz.id}`).then(rows => setQuestions([...rows].sort((a, b) => a.id - b.id))).catch(e => setError(e.message));
    const onKey = event => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [quiz.id]);
  const start = new Date(quiz.scheduled_at);
  const end = quiz.closes_at ? new Date(quiz.closes_at) : new Date(start.getTime() + Number(quiz.duration_minutes) * 60000);
  const now = Date.now();
  const state = quiz.status !== 'Scheduled' ? quiz.status : now < start ? 'Upcoming' : now < end ? 'Live now' : 'Closed';
  const totalMarks = (questions || []).reduce((sum, q) => sum + Number(q.marks || 1), 0);
  return (
    <div className="qm-backdrop" role="dialog" aria-modal="true" aria-label={quiz.title} onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="qm-shell qm-exam">
        <header className="qm-head">
          <div className="qm-head-title">
            <span className="qm-eyebrow">{quiz.level === 'General' ? 'All classes' : quiz.level}{quiz.stream ? ` · ${quiz.stream}` : ''}</span>
            <h2>{quiz.title}</h2>
          </div>
          <div className="qm-head-stats"><span className="qm-pill">{state}</span></div>
          <button className="qm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="qm-body">
          <div className="qm-facts">
            <div><small>Opens</small><strong>{start.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
            <div><small>Closes</small><strong>{end.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
            <div><small>Time per student</small><strong>{quiz.duration_minutes} min</strong></div>
            <div><small>Questions / marks</small><strong>{questions ? `${questions.length} / ${totalMarks}` : '…'}</strong></div>
          </div>
          {quiz.description && <p className="qm-desc">{quiz.description}</p>}
          <small style={{ display: 'block', marginBottom: 8 }}>
            Visible to: {quiz.level === 'General' ? 'every class' : `${quiz.level} students${quiz.stream ? ` (${quiz.stream} stream)` : ' (all streams)'}`} ·
            Order: {quiz.randomize_questions ? 'randomized per student' : 'fixed'} · Fee: Rs. {quiz.fee} · Prize pool: Rs. {quiz.prize_pool}
          </small>
          {error && <div className="form-error">{error}</div>}
          {quiz.question_template_id && <div className="admin-notice" style={{ position: 'static' }}>Questions are drawn from the bank by a distribution template, so each student gets a random set.</div>}
          <div className="table-list">
            {questions?.map((q, i) => <QuestionCard key={q.id} q={q} index={i} />)}
            {questions && !questions.length && <div className="empty-state">This quiz has no questions yet. Add them in Question bank.</div>}
          </div>
        </div>
        <div className="qm-foot" style={{ padding: '14px 22px', borderTop: '1px solid var(--line, #e5e8ec)', marginTop: 0 }}>
          <button className="button secondary" onClick={onClose}>Close</button>
          <button className="button primary" onClick={onEdit}><Pencil size={15} /> Edit quiz</button>
        </div>
      </div>
    </div>
  );
}

export { TextQuizImport };
