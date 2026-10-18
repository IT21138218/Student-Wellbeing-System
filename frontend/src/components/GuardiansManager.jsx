import React, { useState, useEffect } from 'react';
import { listParents, listRegisteredStudents, linkGuardian, unlinkGuardian } from '../api/students';

// Admin-only screen for parent -> child links.
//
// This is the gate that makes the parent restriction meaningful: a parent
// can only run and read wellbeing check-ins for students linked here, and
// they cannot edit the list themselves. Backend enforcement lives in
// app/services/student_service.py (resolve_student / can_access_student).

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const CARD = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.25rem',
};

export default function GuardiansManager() {
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set()); // student ids currently being toggled
  const [flash, setFlash] = useState('');
  const [search, setSearch] = useState('');

  const load = () =>
    Promise.all([listParents(), listRegisteredStudents()])
      .then(([p, s]) => { setParents(p); setStudents(s); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });

  useEffect(() => { load(); }, []);

  const selectedParent = parents.find(p => p.id === selectedParentId) || null;

  const toggle = async (student) => {
    if (!selectedParent || busyIds.has(student.id)) return;
    const isLinked = selectedParent.linked_student_ids.includes(student.id);
    // A Set (not a single id) so toggling two different students back to
    // back doesn't leave the earlier one's button re-clickable while its
    // request is still in flight — that race could fire a second, redundant
    // link/unlink call before the first one's response updates local state.
    setBusyIds(prev => new Set(prev).add(student.id));
    setError(''); setFlash('');
    try {
      const updated = isLinked
        ? await unlinkGuardian(selectedParent.id, student.id)
        : await linkGuardian(selectedParent.id, student.id);
      // The API returns the parent's full linked list — trust it over local guessing.
      setParents(prev => prev.map(p =>
        p.id === selectedParent.id ? { ...p, linked_student_ids: updated } : p));
      setFlash(`${isLinked ? 'Unlinked' : 'Linked'} ${student.full_name} ${isLinked ? 'from' : 'to'} ${selectedParent.full_name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(student.id); return next; });
    }
  };

  if (loading) return <p style={{ color: 'var(--text-2)', fontSize: 16 }}>Loading accounts…</p>;

  const q = search.trim().toLowerCase();
  const filteredStudents = q
    ? students.filter(s => `${s.full_name} ${s.email}`.toLowerCase().includes(q))
    : students;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Manage Guardians</h2>
        <p style={{ fontSize: 16, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 640 }}>
          Link a parent account to the students they're allowed to see. A parent can only run
          and read wellbeing check-ins for children linked here — they can't change this list
          themselves, which is what keeps one family's data out of another's hands.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--bad-dim)', fontSize: 16, marginBottom: '1rem' }}>
          ⚠ {error}
        </div>
      )}
      {flash && (
        <div style={{ background: 'var(--ok-dim)', color: 'var(--ok)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--ok-dim)', fontSize: 16, marginBottom: '1rem' }}>
          ✓ {flash}
        </div>
      )}

      {parents.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.5 }}>👪</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>No parent accounts yet</div>
          <p style={{ fontSize: 15, color: 'var(--text-3)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
            Once someone registers with the <strong>parent</strong> role they'll appear here,
            and you can choose which students they're allowed to see.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Parents */}
          <div style={CARD}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              Parents ({parents.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parents.map(p => {
                const active = p.id === selectedParentId;
                const n = p.linked_student_ids.length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedParentId(active ? '' : p.id); setFlash(''); setError(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    }}
                  >
                    <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {initials(p.full_name)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
                      <span style={{ display: 'inline-block', marginTop: 3, fontSize: 13, fontWeight: 600, color: n ? 'var(--ok)' : 'var(--text-3)', background: n ? 'var(--ok-dim)' : 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                        {n === 0 ? 'no children' : `${n} child${n > 1 ? 'ren' : ''}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Students */}
          <div style={CARD}>
            {!selectedParent ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem', opacity: 0.5 }}>👈</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>Pick a parent to begin</div>
                <p style={{ fontSize: 15, color: 'var(--text-3)' }}>Then tick the students they're allowed to see.</p>
              </div>
            ) : students.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem', opacity: 0.5 }}>🎓</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>No student accounts registered yet</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  Children of {selectedParent.full_name}
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 12 }}>
                  Click a student to link or unlink. Changes save immediately.
                </p>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16, marginBottom: 12, fontFamily: 'inherit' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                  {filteredStudents.map(s => {
                    const linked = selectedParent.linked_student_ids.includes(s.id);
                    const busy = busyIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy}
                        onClick={() => toggle(s)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                          padding: '10px 12px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
                          fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
                          border: `1.5px solid ${linked ? 'var(--ok)' : 'var(--border)'}`,
                          background: linked ? 'var(--ok-dim)' : 'var(--surface)',
                        }}
                      >
                        <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${linked ? 'var(--ok)' : 'var(--border-2)'}`, background: linked ? 'var(--ok)' : 'transparent', color: 'var(--bg-panel)', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {linked ? '✓' : ''}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</span>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filteredStudents.length === 0 && (
                  <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 10 }}>No students match “{search.trim()}”.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
