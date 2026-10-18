import React from 'react';

// Shared page-number control for the 4 personal-history lists (Risk,
// Wellbeing, Coping, Social) — replaces what used to be a single growing
// "Load More" button per module with real Prev/Next + page numbers, backed
// by the API's real {items, total, page, page_size} shape (see
// backend/app/models/pagination.py).
export default function Pagination({ page, pageSize, total, onPageChange, disabled, theme }) {
  const T = theme; // caller's own color tokens, so this matches each host component's look
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  // A handful of page buttons around the current page, not every page for
  // a list that could grow large — same "don't render hundreds of buttons"
  // reasoning as any standard pager.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let p = start; p <= end; p++) pages.push(p);

  const btn = (active) => ({
    padding: '5px 11px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit', border: `1px solid ${active ? T.blue : T.border}`,
    background: active ? T.blueBg : 'transparent', color: active ? T.blue : T.text3,
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: '1rem', flexWrap: 'wrap' }}>
      <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} style={btn(false)}>‹ Prev</button>
      {start > 1 && <span style={{ color: T.text3, fontSize: 14, padding: '0 4px' }}>…</span>}
      {pages.map(p => (
        <button key={p} type="button" disabled={disabled} onClick={() => onPageChange(p)} style={btn(p === page)}>{p}</button>
      ))}
      {end < totalPages && <span style={{ color: T.text3, fontSize: 14, padding: '0 4px' }}>…</span>}
      <button type="button" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} style={btn(false)}>Next ›</button>
      <span style={{ color: T.text3, fontSize: 13, marginLeft: 8 }}>{total} total · page {page} of {totalPages}</span>
    </div>
  );
}
