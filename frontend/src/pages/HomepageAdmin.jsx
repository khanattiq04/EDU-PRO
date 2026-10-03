import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';

function Panel({ title, children }) {
  return <section className="admin-panel"><div className="section-row"><h2>{title}</h2></div>{children}</section>;
}

export function HomepageContent({ data, refresh, flash }) {
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [news, setNews] = useState(data.news);
  useEffect(() => setNews(data.news), [data.news]);

  const add = async event => {
    event.preventDefault();
    try {
      await api('/api/admin/homepage-news', { method: 'POST', body: JSON.stringify({ message, expiresAt }) });
      setMessage('');
      setExpiresAt('');
      refresh();
      flash('Homepage news item added.');
    } catch (error) { flash(error.message); }
  };
  const update = async item => {
    try {
      await api(`/api/admin/homepage-news/${item.id}`, { method: 'PUT', body: JSON.stringify({ message: item.message, expiresAt: item.expires_at || '' }) });
      refresh();
      flash('News item saved.');
    } catch (error) { flash(error.message); }
  };
  const remove = async id => {
    try {
      await api(`/api/admin/homepage-news/${id}`, { method: 'DELETE' });
      refresh();
      flash('News item removed.');
    } catch (error) { flash(error.message); }
  };
  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= news.length) return;
    const reordered = [...news];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setNews(reordered);
    try {
      await api('/api/admin/homepage-news-order', { method: 'PUT', body: JSON.stringify({ ids: reordered.map(item => item.id) }) });
      refresh();
    } catch (error) { flash(error.message); }
  };
  const pin = async (resultId, position) => {
    try {
      await api(`/api/admin/homepage-honorees/${resultId}`, { method: 'POST', body: JSON.stringify({ position }) });
      refresh();
      flash('Position holder pinned to homepage.');
    } catch (error) { flash(error.message); }
  };
  const unpin = async resultId => {
    try {
      await api(`/api/admin/homepage-honorees/${resultId}`, { method: 'DELETE' });
      refresh();
      flash('Homepage position holder removed.');
    } catch (error) { flash(error.message); }
  };

  return <div className="admin-two-col">
    <Panel title="Homepage news ticker">
      <form className="admin-form" onSubmit={add}>
        <label>News item<textarea required maxLength="500" value={message} onChange={event => setMessage(event.target.value)} /></label>
        <label>Optional expiry date<input type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
        <button className="button primary">Add ticker item <Plus size={15} /></button>
      </form>
      <div className="table-list">{news.map((item, index) => <div className="table-row homepage-edit-row" key={item.id}>
        <div>
          <textarea aria-label="News item text" value={item.message} onChange={event => setNews(news.map(row => row.id === item.id ? { ...row, message: event.target.value } : row))} />
          <label>Expires <input type="date" value={item.expires_at?.slice(0, 10) || ''} onChange={event => setNews(news.map(row => row.id === item.id ? { ...row, expires_at: event.target.value } : row))} /></label>
        </div>
        <div className="homepage-row-actions">
          <button className="icon-button" aria-label="Move news up" disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
          <button className="icon-button" aria-label="Move news down" disabled={index === news.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
          <button className="button secondary" onClick={() => update(item)}>Save</button>
          <button className="icon-button" aria-label="Delete news" onClick={() => remove(item.id)}><Trash2 size={15} /></button>
        </div>
      </div>)}</div>
    </Panel>
    <Panel title="Published result position holders">
      <p className="admin-help">Suggested published top scorers appear below. Pin a student manually to override automatic homepage suggestions.</p>
      <div className="table-list">{data.honorees.map(item => <div className="table-row" key={item.result_id}>
        <div><strong>{item.position ? `#${item.position} · ` : ''}{item.student_name}</strong><small>{item.quiz_title} · {item.percentage}%</small></div>
        <button className="button secondary" onClick={() => unpin(item.result_id)}>Unpin</button>
      </div>)}</div>
      {data.suggestions.length === 0 && <p className="admin-help">No published results to suggest yet. Publish results first.</p>}
      <h3 className="admin-subheading">Auto-suggestions</h3>
      {data.suggestions.map(item => <div className="table-row" key={item.result_id}>
        <div><strong>{item.student_name}</strong><small>{item.quiz_title} · {item.percentage}%</small></div>
        <form className="pin-form" onSubmit={event => { event.preventDefault(); pin(item.result_id, Number(new FormData(event.currentTarget).get('position'))); }}>
          <label>Position<input name="position" type="number" min="1" max="10" defaultValue={item.position || 1} /></label>
          <button className="button primary">Pin</button>
        </form>
      </div>)}
    </Panel>
  </div>;
}

export function PartnersAdmin({ data, refresh, flash }) {
  const [partners, setPartners] = useState(data);
  const [form, setForm] = useState({ name: '', category: '', discountPercent: '', logoUrl: '' });
  useEffect(() => setPartners(data), [data]);
  const add = async event => {
    event.preventDefault();
    try {
      await api('/api/admin/partners', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', category: '', discountPercent: '', logoUrl: '' });
      refresh();
      flash('Partner added.');
    } catch (error) { flash(error.message); }
  };
  const save = async item => {
    try {
      await api(`/api/admin/partners/${item.id}`, { method: 'PUT', body: JSON.stringify({ name: item.name, category: item.category, discountPercent: item.discount_percent, logoUrl: item.logo_url || '' }) });
      refresh();
      flash('Partner saved.');
    } catch (error) { flash(error.message); }
  };
  const remove = async id => {
    try {
      await api(`/api/admin/partners/${id}`, { method: 'DELETE' });
      refresh();
      flash('Partner removed.');
    } catch (error) { flash(error.message); }
  };
  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= partners.length) return;
    const reordered = [...partners];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPartners(reordered);
    try {
      await api('/api/admin/partners-order', { method: 'PUT', body: JSON.stringify({ ids: reordered.map(item => item.id) }) });
      refresh();
    } catch (error) { flash(error.message); }
  };

  return <div className="admin-two-col">
    <Panel title="Add a partner"><form className="admin-form" onSubmit={add}>
      <label>Partner name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <div className="form-grid">
        <label>Category<input required placeholder="Health, retail, food..." value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /></label>
        <label>Discount %<input required type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={event => setForm({ ...form, discountPercent: event.target.value })} /></label>
      </div>
      <label>Logo image URL<input type="url" value={form.logoUrl} onChange={event => setForm({ ...form, logoUrl: event.target.value })} /></label>
      <button className="button primary">Add partner <Plus size={15} /></button>
    </form></Panel>
    <Panel title={`Homepage partner list · ${partners.length}`}><div className="table-list">{partners.map((item, index) => <div className="partner-edit-row" key={item.id}>
      <div className="form-grid">
        <label>Name<input value={item.name} onChange={event => setPartners(partners.map(row => row.id === item.id ? { ...row, name: event.target.value } : row))} /></label>
        <label>Category<input value={item.category} onChange={event => setPartners(partners.map(row => row.id === item.id ? { ...row, category: event.target.value } : row))} /></label>
        <label>Discount %<input type="number" min="0" max="100" step="0.01" value={item.discount_percent} onChange={event => setPartners(partners.map(row => row.id === item.id ? { ...row, discount_percent: event.target.value } : row))} /></label>
        <label>Logo URL<input value={item.logo_url || ''} onChange={event => setPartners(partners.map(row => row.id === item.id ? { ...row, logo_url: event.target.value } : row))} /></label>
      </div>
      <div className="homepage-row-actions">
        <button className="icon-button" aria-label="Move partner up" disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
        <button className="icon-button" aria-label="Move partner down" disabled={index === partners.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
        <button className="button secondary" onClick={() => save(item)}>Save</button>
        <button className="icon-button" aria-label="Delete partner" onClick={() => remove(item.id)}><Trash2 size={15} /></button>
      </div>
    </div>)}</div></Panel>
  </div>;
}
