import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, BookmarkCheck, Bookmark, Check, CheckCircle2, Clock3, ListChecks, LockKeyhole, Trophy, X } from 'lucide-react';
import { api } from '../api/client.js';
import './quiz-modal.css';

const LETTERS = ['A', 'B', 'C', 'D'];

function deviceIdentity() {
  try {
    const key = 'danistan_device';
    const value = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch {
    return 'browser';
  }
}

const formatClock = ms => {
  if (ms == null) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/**
 * Full-screen exam modal.
 * Phases: intro -> loading -> exam -> (confirm) -> done | error
 */
export default function StudentQuizModal({ quiz, onClose, onSubmitted }) {
  const resuming = quiz?.my_attempt_status === 'In progress';
  const [phase, setPhase] = useState('intro');
  const [error, setError] = useState('');
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState(() => new Set());
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const deviceId = useMemo(deviceIdentity, []);
  const submittedRef = useRef(false);

  // Lock page scroll behind the modal.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const start = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const data = await api('/api/attempts/start', { method: 'POST', body: JSON.stringify({ quizId: quiz.id, deviceId }) });
      offset.current = new Date(data.serverTime).getTime() - Date.now();
      setPaper(data);
      setAnswers(Object.fromEntries(data.answers.map(a => [a.question_id, a.answer])));
      setWarnings(Number(data.attempt.warnings || 0));
      setIndex(0);
      setPhase('exam');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }, [quiz.id, deviceId]);

  const deadline = paper?.deadline ? new Date(paper.deadline).getTime() : null;
  const remaining = deadline == null ? null : deadline - (now + offset.current);

  const submit = useCallback(async (reason) => {
    if (!paper || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api(`/api/attempts/${paper.attempt.id}/submit`, { method: 'POST' });
      setConfirming(false);
      setPhase('done');
      setError(reason || '');
      onSubmitted?.();
    } catch (e) {
      submittedRef.current = false;
      setSaveError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [paper, onSubmitted]);

  // Clock tick + auto-submit when time runs out.
  useEffect(() => {
    if (phase !== 'exam') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 'exam' && remaining != null && remaining <= 0) submit('Time is up — your saved answers were submitted automatically.');
  }, [phase, remaining, submit]);

  // Heartbeat / connection tracking / tab-switch warnings.
  useEffect(() => {
    if (phase !== 'exam' || !paper) return undefined;
    const id = paper.attempt.id;
    const heartbeat = () => api(`/api/attempts/${id}/heartbeat`, { method: 'POST' }).catch(() => {});
    const disconnect = () => api(`/api/attempts/${id}/disconnect`, { method: 'POST', keepalive: true }).catch(() => {});
    const onVisibility = async () => {
      if (document.visibilityState !== 'hidden') return;
      try {
        const result = await api(`/api/attempts/${id}/warning`, { method: 'POST' });
        setWarnings(result.warnings);
        if (result.autoSubmit) submit('You left the quiz screen 3 times, so it was submitted automatically.');
      } catch { /* ignore */ }
    };
    heartbeat();
    const timer = setInterval(heartbeat, 15000);
    window.addEventListener('offline', disconnect);
    window.addEventListener('pagehide', disconnect);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('pagehide', disconnect);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, paper, submit]);

  const questions = paper?.questions || [];
  const current = questions[index];
  const answeredCount = questions.filter(q => answers[q.id]).length;

  const choose = useCallback(async letter => {
    if (!current || submittedRef.current) return;
    const previous = answers[current.id];
    setAnswers(a => ({ ...a, [current.id]: letter }));
    setSaving(current.id);
    setSaveError('');
    try {
      await api(`/api/attempts/${paper.attempt.id}/answer`, { method: 'PUT', body: JSON.stringify({ questionId: current.id, answer: letter }) });
    } catch (e) {
      setAnswers(a => ({ ...a, [current.id]: previous }));
      setSaveError(e.message);
    } finally {
      setSaving(null);
    }
  }, [current, answers, paper]);

  const toggleReview = () => setReview(set => {
    const next = new Set(set);
    if (next.has(current.id)) next.delete(current.id); else next.add(current.id);
    return next;
  });

  // Keyboard: A-D / 1-4 to answer, arrows to move.
  useEffect(() => {
    if (phase !== 'exam' || confirming) return undefined;
    const onKey = event => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      const key = event.key.toUpperCase();
      const pick = LETTERS.includes(key) ? key : ['1', '2', '3', '4'].includes(key) ? LETTERS[Number(key) - 1] : null;
      if (pick) choose(pick);
      if (event.key === 'ArrowRight') setIndex(i => Math.min(questions.length - 1, i + 1));
      if (event.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, confirming, choose, questions.length]);

  const leave = () => {
    if (phase === 'exam' && !window.confirm('Leave the quiz? Your answers are saved, but the timer keeps running.')) return;
    onClose();
  };

  const opensAt = new Date(quiz.scheduled_at);
  const closesAt = quiz.window_closes_at ? new Date(quiz.window_closes_at) : null;
  const lowTime = remaining != null && remaining < 120000;

  return (
    <div className="qm-backdrop" role="dialog" aria-modal="true" aria-label={quiz.title}>
      <div className={`qm-shell ${phase === 'exam' ? 'qm-exam' : 'qm-compact'}`}>
        <header className="qm-head">
          <div className="qm-head-title">
            <span className="qm-eyebrow">{quiz.level}{quiz.stream ? ` · ${quiz.stream}` : ''}{quiz.level === 'General' ? ' · All classes' : ''}</span>
            <h2>{quiz.title}</h2>
          </div>
          {phase === 'exam' && (
            <div className="qm-head-stats">
              <span className="qm-pill"><ListChecks size={15} /> {answeredCount}/{questions.length} answered</span>
              {remaining != null && (
                <span className={`qm-pill qm-timer ${lowTime ? 'qm-low' : ''}`} aria-live="polite"><Clock3 size={15} /> {formatClock(remaining)}</span>
              )}
            </div>
          )}
          <button className="qm-close" onClick={leave} aria-label="Close quiz"><X size={18} /></button>
        </header>

        {phase === 'intro' && (
          <div className="qm-body qm-intro">
            <div className="qm-facts">
              <div><small>Questions</small><strong>{quiz.question_count ?? '—'}</strong></div>
              <div><small>Time allowed</small><strong>{quiz.duration_minutes} min</strong></div>
              <div><small>Opened</small><strong>{opensAt.toLocaleDateString()}</strong></div>
              <div><small>Closes</small><strong>{closesAt ? closesAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</strong></div>
            </div>
            {quiz.description && <p className="qm-desc">{quiz.description}</p>}
            <h3>Before you start</h3>
            <ul className="qm-rules">
              <li>You get <b>{quiz.duration_minutes} minutes</b> from the moment you press Start. The timer keeps running if you close this window.</li>
              <li>Every answer is saved as soon as you pick it. You can change answers until time is up.</li>
              <li>Use <b>Mark for review</b> to come back to a question, and the numbered grid to jump between questions.</li>
              <li>Stay on this screen — leaving the tab 3 times submits the quiz automatically.</li>
              <li>When time runs out, your saved answers are submitted automatically.</li>
            </ul>
            <div className="qm-actions">
              <button className="button secondary" onClick={onClose}>Not now</button>
              <button className="button primary" onClick={start}>{resuming ? 'Resume quiz' : 'Start quiz'} <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {phase === 'loading' && <div className="qm-body qm-center"><div className="qm-spinner" /><p>Preparing your paper…</p></div>}

        {phase === 'error' && (
          <div className="qm-body qm-center">
            <LockKeyhole size={34} />
            <h3>Quiz unavailable</h3>
            <p>{error}</p>
            <button className="button secondary" onClick={onClose}><ArrowLeft size={15} /> Back</button>
          </div>
        )}

        {phase === 'exam' && current && (
          <div className="qm-exam-grid">
            <section className="qm-question">
              {warnings > 0 && (
                <div className="qm-alert"><AlertTriangle size={16} /> You left the quiz screen {warnings} time{warnings > 1 ? 's' : ''}. At 3 the quiz is submitted automatically.</div>
              )}
              <div className="qm-qhead">
                <span>Question {index + 1} of {questions.length}</span>
                {current.subject && <span className="qm-tag">{current.subject}</span>}
                {review.has(current.id) && <span className="qm-tag qm-tag-review">Marked for review</span>}
              </div>
              <div className="qm-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
              <h3 className="qm-qtext">{current.question_en || current.question_ur}</h3>
              {current.question_ur && current.question_en && <p className="qm-urdu" dir="rtl">{current.question_ur}</p>}
              <div className="qm-options" role="radiogroup">
                {LETTERS.map(letter => {
                  const key = letter.toLowerCase();
                  const en = current[`option_${key}_en`];
                  const ur = current[`option_${key}_ur`];
                  const selected = answers[current.id] === letter;
                  return (
                    <button key={letter} role="radio" aria-checked={selected} className={`qm-option ${selected ? 'qm-selected' : ''}`} onClick={() => choose(letter)}>
                      <b>{letter}</b>
                      <span>{en || ur}{en && ur && <small dir="rtl">{ur}</small>}</span>
                      {selected && <Check size={18} className="qm-check" />}
                    </button>
                  );
                })}
              </div>
              <div className="qm-savestate">
                {saving === current.id ? 'Saving…' : saveError ? <span className="qm-error">{saveError}</span> : answers[current.id] ? <><CheckCircle2 size={14} /> Answer saved</> : 'Not answered yet'}
              </div>
              <div className="qm-foot">
                <button className="button secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={15} /> Previous</button>
                <button className="button secondary" onClick={toggleReview}>
                  {review.has(current.id) ? <><BookmarkCheck size={15} /> Unmark</> : <><Bookmark size={15} /> Mark for review</>}
                </button>
                {index < questions.length - 1
                  ? <button className="button primary" onClick={() => setIndex(index + 1)}>Next <ArrowRight size={15} /></button>
                  : <button className="button primary" onClick={() => setConfirming(true)}>Finish & submit <Check size={15} /></button>}
              </div>
            </section>

            <aside className="qm-nav">
              <h4>Questions</h4>
              <div className="qm-grid">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    className={['qm-cell', answers[q.id] && 'qm-answered', review.has(q.id) && 'qm-review', i === index && 'qm-current'].filter(Boolean).join(' ')}
                    onClick={() => setIndex(i)}
                    aria-label={`Question ${i + 1}${answers[q.id] ? ', answered' : ''}${review.has(q.id) ? ', marked for review' : ''}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <ul className="qm-legend">
                <li><i className="qm-answered" /> Answered</li>
                <li><i className="qm-review" /> For review</li>
                <li><i /> Not answered</li>
              </ul>
              <button className="button primary qm-submit" onClick={() => setConfirming(true)}>Submit quiz</button>
              <small className="qm-hint">Keys: A–D to answer, ← → to move</small>
            </aside>
          </div>
        )}

        {phase === 'done' && (
          <div className="qm-body qm-center qm-done">
            <div className="qm-done-icon"><Trophy size={30} /></div>
            <h3>Quiz submitted</h3>
            {error && <p className="qm-note">{error}</p>}
            <p>You answered <b>{answeredCount}</b> of <b>{questions.length}</b> questions. Your result will appear under <b>Results</b> once the admin publishes it.</p>
            <button className="button primary" onClick={onClose}>Back to dashboard</button>
          </div>
        )}

        {confirming && (
          <div className="qm-confirm-backdrop">
            <div className="qm-confirm">
              <h3>Submit your quiz?</h3>
              <div className="qm-confirm-stats">
                <div><strong>{answeredCount}</strong><small>Answered</small></div>
                <div className={questions.length - answeredCount ? 'qm-warn' : ''}><strong>{questions.length - answeredCount}</strong><small>Not answered</small></div>
                <div><strong>{review.size}</strong><small>Marked for review</small></div>
              </div>
              {questions.length - answeredCount > 0 && <p>Unanswered questions get zero marks.</p>}
              <p>You can't change your answers after submitting.</p>
              {saveError && <p className="qm-error">{saveError}</p>}
              <div className="qm-actions">
                <button className="button secondary" disabled={submitting} onClick={() => setConfirming(false)}>Keep working</button>
                <button className="button primary" disabled={submitting} onClick={() => submit()}>{submitting ? 'Submitting…' : 'Yes, submit'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
