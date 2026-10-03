import React, { useEffect, useState } from 'react';
import { Check, Download, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client.js';

function Panel({ title, children }) {
  return <section className="admin-panel"><div className="section-row"><h2>{title}</h2></div>{children}</section>;
}

export function StudentsAdmin({ students, refresh, flash }) {
  const [editing, setEditing] = useState(null);
  const pending = students.filter(student => student.schoolApprovalStatus === 'Pending');
  const toggle = async student => {
    try {
      await api(`/api/admin/students/${student.id}`, { method: 'PUT', body: JSON.stringify({ blocked: !student.blocked }) });
      refresh();
      flash(student.blocked ? 'Student unblocked.' : 'Student blocked.');
    } catch (error) { flash(error.message); }
  };
  const save = async event => {
    event.preventDefault();
    try {
      const { fullName, mobile, email, schoolName, city, tehsil } = editing;
      await api(`/api/admin/students/${editing.id}`, { method: 'PUT', body: JSON.stringify({ fullName, mobile, email, schoolName, city, tehsil }) });
      setEditing(null);
      refresh();
      flash('Student details saved.');
    } catch (error) { flash(error.message); }
  };
  const approve = async id => {
    try {
      await api(`/api/admin/students/${id}/school-approval`, { method: 'PUT' });
      refresh();
      flash('School entry approved.');
    } catch (error) { flash(error.message); }
  };
  const exportCsv = () => {
    const escape = value => `"${String(value || '').replaceAll('"', '""')}"`;
    const csv = [['Name', 'Mobile', 'Email'], ...students.map(student => [student.fullName, student.mobile, student.email])]
      .map(row => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-contact-directory.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return <div className="student-admin-stack">
    <Panel title={`Student management · ${students.length} accounts`}>
      <button className="button secondary directory-export" onClick={exportCsv}><Download size={15}/> Export contact directory (CSV)</button>
      <div className="data-table"><div className="table-header"><span>Student</span><span>Pathway</span><span>Status</span><span>Action</span></div>
        {students.map(student => <div className="table-row" key={student.id}>
          <div><strong>{student.fullName}</strong><small>{student.email} · {student.mobile} · {student.registrationNumber}</small><small>{student.schoolName} {student.schoolApprovalStatus==='Pending'?'· School entry pending':''}</small></div>
          <span>{student.levelProfile.level} {student.levelProfile.stream&&`· ${student.levelProfile.stream}`}</span>
          <span className={student.blocked?'status blocked':'status active'}>{student.blocked?'Blocked':student.registrationStatus}</span>
          <div className="student-actions"><button className="button secondary" onClick={()=>setEditing(student)}>Edit</button><button className="button secondary" onClick={()=>toggle(student)}>{student.blocked?'Unblock':'Block'}</button>{student.schoolApprovalStatus==='Pending'&&<button className="button primary" onClick={()=>approve(student.id)}>Approve school</button>}</div>
        </div>)}
      </div>
    </Panel>
    {pending.length>0&&<Panel title={`Pending “Others” school entries · ${pending.length}`}><div className="table-list">{pending.map(student=><div className="table-row" key={student.id}><div><strong>{student.schoolName}</strong><small>{student.fullName} · {student.registrationNumber}</small></div><button className="button primary" onClick={()=>approve(student.id)}>Approve <Check size={15}/></button></div>)}</div></Panel>}
    {editing&&<div className="admin-modal-backdrop"><form className="admin-modal admin-form" onSubmit={save}><div className="section-row"><h2>Edit student</h2><button type="button" className="button secondary" onClick={()=>setEditing(null)}>Cancel</button></div>{[['fullName','Full name'],['mobile','Mobile'],['email','Email'],['schoolName','School / college'],['city','City'],['tehsil','Tehsil']].map(([key,label])=><label key={key}>{label}<input required={key==='fullName'} type={key==='email'?'email':'text'} value={editing[key]||''} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}<button className="button primary">Save student</button></form></div>}
  </div>;
}

export function AcademicStructureAdmin({ options, refresh, flash }) {
  const [category, setCategory] = useState('class');
  const [value, setValue] = useState('');
  const [parentValue, setParentValue] = useState('');
  const [rows, setRows] = useState(options);
  useEffect(() => setRows(options), [options]);
  const parents = category === 'stream' || category === 'program' ? options.filter(item => item.category === 'class').map(item => item.value) : [];
  const add = async event => {
    event.preventDefault();
    try {
      await api('/api/admin/academic-options', { method: 'POST', body: JSON.stringify({ category, value, parentValue: parents.length ? parentValue : null }) });
      setValue('');
      refresh();
      flash('Academic option added.');
    } catch (error) { flash(error.message); }
  };
  const save = async item => {
    try {
      await api(`/api/admin/academic-options/${item.id}`, { method: 'PUT', body: JSON.stringify({ value: item.value, parentValue: item.parent_value }) });
      refresh();
      flash('Academic option saved.');
    } catch (error) { flash(error.message); }
  };
  const remove = async id => {
    try {
      await api(`/api/admin/academic-options/${id}`, { method: 'DELETE' });
      refresh();
      flash('Academic option removed.');
    } catch (error) { flash(error.message); }
  };
  const filtered = rows.filter(item => item.category === category);
  return <div className="admin-two-col">
    <Panel title="Add class, stream, program, or subject">
      <form className="admin-form" onSubmit={add}>
        <label>Option type<select value={category} onChange={event=>{setCategory(event.target.value);setParentValue('')}}><option value="class">Class / level</option><option value="stream">Stream</option><option value="program">Program</option><option value="subject">Subject</option></select></label>
        {parents.length>0&&<label>Class / level<select required value={parentValue} onChange={event=>setParentValue(event.target.value)}><option value="">Choose class / level</option>{parents.map(parent=><option key={parent}>{parent}</option>)}</select></label>}
        <label>Option name<input required value={value} onChange={event=>setValue(event.target.value)}/></label>
        <button className="button primary">Add option <Plus size={15}/></button>
      </form>
    </Panel>
    <Panel title={`${category[0].toUpperCase()+category.slice(1)} options · ${filtered.length}`}>
      <div className="table-list">{filtered.map(item=><div className="table-row" key={item.id}>
        <div className="structure-option"><input aria-label={`${item.category} option`} value={item.value} onChange={event=>setRows(rows.map(row=>row.id===item.id?{...row,value:event.target.value}:row))}/>{item.parent_value&&<small>For {item.parent_value}</small>}</div>
        <button className="button secondary" onClick={()=>save(item)}>Save</button><button className="icon-button" aria-label="Remove option" onClick={()=>remove(item.id)}><Trash2 size={15}/></button>
      </div>)}</div>
    </Panel>
  </div>;
}
