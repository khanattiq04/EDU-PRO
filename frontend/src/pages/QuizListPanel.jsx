import React, { useMemo, useState } from 'react';
import { Archive, CalendarClock, Clock3, Eye, FileQuestion, Pencil, PlayCircle, Search } from 'lucide-react';
import './quiz-list.css';

const STATUS_ORDER = { 'Live now': 0, Upcoming: 1, Draft: 2, Closed: 3, Archived: 4 };
const fmt = value => new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function quizStatus(quiz, now = Date.now()) {
  if (quiz.status === 'Archived') return 'Archived';
  if (quiz.status === 'Draft') return 'Draft';
  const start = new Date(quiz.scheduled_at).getTime();
  const end = quiz.closes_at ? new Date(quiz.closes_at).getTime() : start + Number(quiz.duration_minutes || 0) * 60000;
  return now < start ? 'Upcoming' : now < end ? 'Live now' : 'Closed';
}
const quizEnd = q => q.closes_at ? new Date(q.closes_at) : new Date(new Date(q.scheduled_at).getTime() + Number(q.duration_minutes || 0) * 60000);

/**
 * Right-hand "Saved quizzes" panel in Quiz management:
 * class dropdown + status tabs + search, and one card per quiz with actions underneath.
 */
export default function QuizListPanel({ quizzes, classOptions = [], editingId, onView, onEdit, onOpenNow, onArchive }) {
  const [level, setLevel] = useState('all');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const now = Date.now();

  const withStatus = useMemo(() => quizzes.map(q => ({ ...q, _status: quizStatus(q, now) })), [quizzes, now]);

  // Classes in the dropdown: every configured class, plus any class used by an existing quiz.
  const levels = useMemo(() => {
    const names = [...classOptions];
    for (const q of quizzes) if (q.level && q.level !== 'General' && !names.includes(q.level)) names.push(q.level);
    return names;
  }, [classOptions, quizzes]);
  const countFor = value => withStatus.filter(q => q._status !== 'Archived' && (value === 'all' || q.level === value)).length;

  const byClass = withStatus.filter(q => level === 'all' || q.level === level);
  const tabs = [
    ['active', 'All active', q => q._status !== 'Archived'],
    ['Live now', 'Live', q => q._status === 'Live now'],
    ['Upcoming', 'Upcoming', q => q._status === 'Upcoming'],
    ['Closed', 'Closed', q => q._status === 'Closed'],
    ['Draft', 'Draft', q => q._status === 'Draft'],
    ['Archived', 'Archived', q => q._status === 'Archived']
  ];
  const tabFilter = tabs.find(t => t[0] === status)[2];
  const term = search.trim().toLowerCase();
  const visible = byClass
    .filter(tabFilter)
    .filter(q => !term || `${q.title} ${q.stream || ''} ${q.description || ''}`.toLowerCase().includes(term))
    .sort((a, b) => STATUS_ORDER[a._status] - STATUS_ORDER[b._status] || new Date(a.scheduled_at) - new Date(b.scheduled_at));

  return (
    <section className="admin-panel ql-panel">
      <div className="ql-head">
        <div>
          <h2>Saved quizzes</h2>
          <small>{countFor('all')} active · {withStatus.filter(q => q._status === 'Live now').length} live now</small>
        </div>
        <label className="ql-class">
          <span>Class</span>
          <select value={level} onChange={e => setLevel(e.target.value)}>
            <option value="all">All classes ({countFor('all')})</option>
            <option value="General">General – all classes ({countFor('General')})</option>
            {levels.map(name => <option key={name} value={name}>{name} ({countFor(name)})</option>)}
          </select>
        </label>
      </div>

      <div className="ql-tabs" role="tablist">
        {tabs.map(([key, label, test]) => (
          <button key={key} role="tab" aria-selected={status === key} className={status === key ? 'ql-tab ql-tab-on' : 'ql-tab'} onClick={() => setStatus(key)}>
            {label}<b>{byClass.filter(test).length}</b>
          </button>
        ))}
      </div>

      <div className="ql-search">
        <Search size={15} />
        <input value={search} placeholder="Search quiz title or stream" onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="ql-list">
        {visible.map(q => (
          <article key={q.id} className={`ql-card ${editingId === q.id ? 'ql-editing' : ''}`}>
            <div className="ql-card-top">
              <h3 title={q.title}>{q.title}</h3>
              <span className={`ql-badge ql-${q._status.replace(' ', '-').toLowerCase()}`}>{q._status === 'Live now' && <i />}{q._status}</span>
            </div>
            <div className="ql-chips">
              <span className="ql-chip ql-chip-class">{q.level === 'General' ? 'All classes' : q.level}</span>
              {q.stream && <span className="ql-chip">{q.stream}</span>}
              <span className="ql-chip"><FileQuestion size={12} /> {q.question_count} questions</span>
              <span className="ql-chip"><Clock3 size={12} /> {q.duration_minutes} min</span>
            </div>
            <div className="ql-dates">
              <CalendarClock size={14} />
              <span><b>Opens</b> {fmt(q.scheduled_at)}</span>
              <span><b>Closes</b> {fmt(quizEnd(q))}</span>
            </div>
            {!Number(q.question_count) && !q.question_template_id && <div className="ql-warn">No questions yet — add them in Question bank.</div>}
            <div className="ql-actions">
              <button className="ql-btn" onClick={() => onView(q)}><Eye size={15} /> View</button>
              <button className="ql-btn" onClick={() => onEdit(q)}><Pencil size={15} /> Edit</button>
              {q._status === 'Closed' && <button className="ql-btn ql-btn-primary" onClick={() => onOpenNow(q)}><PlayCircle size={15} /> Open now</button>}
              {q._status !== 'Archived' && (
                <button className="ql-btn ql-btn-ghost" title="Archive quiz (hides it from students)" onClick={() => onArchive(q)}><Archive size={15} /> Archive</button>
              )}
            </div>
          </article>
        ))}
        {!visible.length && (
          <div className="ql-empty">
            <FileQuestion size={26} />
            <strong>No quizzes here</strong>
            <span>{level === 'all' ? 'Try another status tab.' : `No ${tabs.find(t => t[0] === status)[1].toLowerCase()} quizzes for ${level === 'General' ? 'General' : level}.`}</span>
          </div>
        )}
      </div>
    </section>
  );
}
