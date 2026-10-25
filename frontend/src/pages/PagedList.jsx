import React, { useEffect, useState } from 'react';

// Renders long admin lists 50 rows at a time, so pages stay fast with
// thousands of students, payments or results.
export default function PagedList({ items, render, step = 50 }) {
  const [count, setCount] = useState(step);
  useEffect(() => setCount(step), [items.length, step]);
  return (
    <>
      {items.slice(0, count).map(render)}
      {items.length > count && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 0' }}>
          <small style={{ color: '#6b7688' }}>Showing {count} of {items.length}</small>
          <button type="button" className="button secondary" style={{ width: 'auto', margin: 0 }} onClick={() => setCount(c => c + step)}>Show {Math.min(step, items.length - count)} more</button>
          <button type="button" className="button secondary" style={{ width: 'auto', margin: 0 }} onClick={() => setCount(items.length)}>Show all</button>
        </div>
      )}
    </>
  );
}
