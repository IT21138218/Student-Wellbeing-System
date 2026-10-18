import React, { useState, useEffect } from 'react';
import { listRegisteredStudents } from '../api/students';

// Visual contract deliberately matches the picker in RiskAnalysis.jsx
// (search input + scrollable card grid + blue active border), just widened —
// real names and emails need more room than an "S001" label.

function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function EmptyState({ role }) {
  const isParent = role === 'parent';
  return (
    <div style={{ textAlign: 'center', padding: '1.75rem 1rem' }}>
      <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem', opacity: 0.55 }}>
        {isParent ? '👨‍👩‍👧' : '🎓'}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>
        {isParent ? 'No children linked to your account' : 'No student accounts registered yet'}
      </div>
      <p style={{ fontSize: 15, color: 'var(--text-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
        {isParent
          ? "Ask a school administrator to link your child's student account to yours. Until then you can't file a check-in."
          : 'This picker lists real accounts from the database — a student needs to sign up before a check-in can be filed under their name. You can still run an untagged general check-in.'}
      </p>
    </div>
  );
}

export default function StudentPicker({ value, onChange, role }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listRegisteredStudents()
      .then(list => { setStudents(list); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading student accounts…</p>;

  if (error) {
    return (
      <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--bad-dim)', fontSize: 16 }}>
        ⚠ {error}
      </div>
    );
  }

  if (students.length === 0) return <EmptyState role={role} />;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? students.filter(s => `${s.full_name} ${s.email} ${s.grade || ''}`.toLowerCase().includes(q))
    : students;

  return (
    <>
      <input
        type="text"
        placeholder="Search by name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16, marginBottom: 12, fontFamily: 'inherit' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
        {filtered.map(s => {
          const active = value?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(active ? null : s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-dim)' : 'var(--surface)',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(s.full_name)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.full_name}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.email}
                </span>
                {s.grade && (
                  <span style={{ display: 'inline-block', marginTop: 3, fontSize: 13, fontWeight: 600, color: 'var(--accent-2)', background: 'var(--accent-dim)', padding: '1px 5px', borderRadius: 4 }}>
                    {s.grade}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 10 }}>No students match “{search.trim()}”.</p>
      )}
    </>
  );
}
