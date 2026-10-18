import React, { useState, useEffect } from 'react';
import '../styles/RiskAnalysis.css';
import { listSocialStudents, detectIsolation, getSocialHistory, listRealSocialStudents, deleteSocialHistoryItem } from '../api/social';
import { cssVar } from '../utils/color';
import Pagination from './Pagination';

// Minimal token set for Pagination — this file styles everything via plain
// var(--x) strings directly rather than a `T` object like the other 3
// History views, so build the small subset Pagination needs here.
const PAGINATION_THEME = { blue: 'var(--accent)', blueBg: 'var(--accent-dim)', border: 'var(--border)', text3: 'var(--text-3)' };

function timeAgo(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Real resolved hex, not var() — gets concatenated with a hex alpha suffix
// (`${col}22`) below, which only works with an actual color value.
const historyClusterColor = name => name === 'At-Risk / Isolated' ? cssVar('--bad') : cssVar('--warn');

// A reverse-chronological list of past detections — same "decision log,
// not a chart" reasoning as Risk Classification/Coping History: cluster
// membership is categorical, so a list reads better than a trend line.
const HISTORY_PAGE_SIZE = 10;

function SocialHistoryView() {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  // Real page-based pagination — was hard-capped at the backend's default
  // 10 with no way at all to see anything older.
  const [page, setPage] = useState(1);
  const [pageTotal, setPageTotal] = useState(0);
  const [deleting, setDeleting] = useState({}); // id -> true while a request is in flight

  useEffect(() => {
    getSocialHistory(page, HISTORY_PAGE_SIZE)
      .then(res => { setItems(res.items); setPageTotal(res.total); })
      .catch(err => setError(err.message || 'Could not load detection history.'));
  }, [page]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this detection from history? This cannot be undone.')) return;
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      await deleteSocialHistoryItem(id);
      setItems(list => list.filter(it => it.id !== id));
      setPageTotal(t => Math.max(0, t - 1));
    } catch (err) {
      setError(err.message || 'Could not delete this entry.');
      setDeleting(d => ({ ...d, [id]: false }));
    }
  };

  return (
    <div className="ra-root">
      <div className="ra-header">
        <h2>Detection History</h2>
        <p>Every isolation detection you've run, most recent first{pageTotal > 0 ? ` — ${pageTotal} total` : ''}.</p>
      </div>

      {error && <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px' }}>⚠ {error}</div>}

      {!error && items === null && (
        <div className="ra-card" style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 16 }}>Loading…</div>
      )}

      {!error && items !== null && items.length === 0 && (
        <div className="ra-card" style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 16 }}>
          No detections yet — run one above to start your history.
        </div>
      )}

      {!error && items !== null && items.map((it) => {
        const col = historyClusterColor(it.cluster_name);
        return (
          <div key={it.id} className="ra-card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 12px' }}>
                  {it.source_student_id}
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, fontSize: 15, fontWeight: 700, background: `${col}22`, border: `1px solid ${col}55`, color: col }}>
                  {it.cluster_name}
                </div>
                {it.isolation_risk_flag && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bad)', background: 'var(--bad-dim)', padding: '4px 10px', borderRadius: 8 }}>⚠ Isolation Risk Flagged</span>
                )}
              </div>
              <span style={{ fontSize: 14, color: 'var(--text-3)' }}>{timeAgo(it.created_at)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={() => handleDelete(it.id)}
                disabled={!!deleting[it.id]}
                title="Delete this entry from your history"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)' }}
              >
                {deleting[it.id] ? 'Deleting…' : '🗑 Delete'}
              </button>
            </div>
          </div>
        );
      })}

      <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={pageTotal} onPageChange={setPage} theme={PAGINATION_THEME} />
    </div>
  );
}

const PROFILE_LABELS = {
  belonging_score_mean: 'Belonging', loneliness_score_mean: 'Loneliness',
  help_seeking_comfort_mean: 'Help-Seeking Comfort', group_inclusion_mean: 'Group Inclusion',
  has_support_person_mean: 'Has Support Person', talks_to_someone_mean: 'Talks to Someone',
  class_support_mean: 'Class Support', peer_helping_mean: 'Peer Helping',
  social_perception_score: 'Social Perception', isolation_index: 'Isolation Index',
  support_availability: 'Support Availability', class_environment: 'Class Environment',
  social_stability: 'Social Stability', loneliness_trend: 'Loneliness Trend',
};

export default function SocialIsolation({ initialStudentId = null, mode = 'detect' }) {
  // Hooks below must run unconditionally every render (Dashboard toggles
  // `mode` on the same mounted instance, not a remount) — mode branch
  // happens at the return, same pattern as RiskClassification.jsx.
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialStudentId || '');

  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [loadStep, setLoadStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // 'csv' = the training-cohort replay (default, unchanged). 'real' = live
  // registered accounts, detected from their own stored CopingRecord history.
  const [source, setSource] = useState('csv');
  const [realStudents, setRealStudents] = useState([]);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState('');

  useEffect(() => {
    if (source !== 'real' || realStudents.length || realLoading) return;
    setRealLoading(true);
    listRealSocialStudents()
      .then(list => { setRealStudents(list); setRealLoading(false); })
      .catch(err => { setRealError(err.message); setRealLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const switchSource = (next) => {
    setSource(next); setSelectedId(''); setResult(null); setPhase('idle'); setError(''); setSearch('');
  };

  const selectedRealStudent = realStudents.find(s => s.id === selectedId);

  useEffect(() => {
    listSocialStudents()
      .then(list => {
        setStudents(list);
        setStudentsLoading(false);
        if (initialStudentId && list.some(s => s.student_id === initialStudentId)) {
          setSelectedId(initialStudentId);
          setTimeout(() => runDetection(initialStudentId), 0);
        }
      })
      .catch(err => { setStudentsError(err.message); setStudentsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    const steps = ['Scaling aggregated profile…', 'Running K-Means clustering…', 'Computing peer matches…'];
    let i = 0;
    setLoadStep(steps[0]);
    const id = setInterval(() => { i = (i + 1) % steps.length; setLoadStep(steps[i]); }, 700);
    return () => clearInterval(id);
  }, [phase]);

  const runDetection = async (idOverride) => {
    const id = (typeof idOverride === 'string' && idOverride) || selectedId;
    if (!id) return;
    setPhase('loading'); setError('');
    try {
      const data = await detectIsolation(id);
      setResult(data);
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  };

  const filtered = students.filter(s =>
    !search || s.student_id.toLowerCase().includes(search.toLowerCase())
  );

  // Real resolved hex, not var() — concatenated with a hex alpha suffix
  // (`${...}22`) below, which only works with an actual color value.
  const clusterColor = name => name === 'At-Risk / Isolated' ? cssVar('--bad') : cssVar('--warn');

  if (mode === 'history') return <SocialHistoryView />;

  return (
    <div className="ra-root">
      <div className="ra-header">
        <h2>Social Peer Matching &amp; Isolation Detection</h2>
        <p>Pick a student with a real aggregated survey profile. A K-Means clustering model — trained on belonging, loneliness, and support signals across their weekly check-ins — groups them and suggests compatible peers.</p>
      </div>

      <div className="ra-card">
        <div className="ra-card-title"><span>👤</span> Select Student</div>

        {/* Source toggle: CSV training cohort (default) vs live accounts */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content', marginBottom: '1rem' }}>
          {[['csv', 'Training cohort'], ['real', 'Real students']].map(([val, label]) => (
            <button key={val} onClick={() => switchSource(val)} style={{
              padding: '8px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
              background: source === val ? 'var(--accent)' : 'transparent', color: source === val ? 'white' : 'var(--text-3)',
            }}>
              {label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: '15px', color: 'var(--text-2)', marginBottom: '1rem' }}>
          {source === 'csv'
            ? `Clustering needs an aggregated profile across a student's multiple weekly survey
               responses — this app doesn't have that accumulated yet from live use, so this picks
               from the real 200-student profile export the model was trained and evaluated on.`
            : `Registered student accounts, clustered from their own stored Coping Strategies check-ins.
               At least 2 check-ins are needed to build a meaningful profile.`}
        </p>

        {source === 'csv' && (
          <>
            {studentsLoading && <p style={{ color: 'var(--text-2)', fontSize: '16px' }}>Loading students…</p>}
            {studentsError && <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {studentsError}</div>}

            {!studentsLoading && !studentsError && (
              <>
                <input
                  type="text"
                  placeholder="Search student ID (e.g. S001)…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '16px', marginBottom: '12px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {filtered.slice(0, 60).map(s => {
                    const active = s.student_id === selectedId;
                    return (
                      <button
                        key={s.student_id}
                        onClick={() => { setSelectedId(s.student_id); setPhase('idle'); setResult(null); }}
                        style={{
                          textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                          border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-dim)' : 'var(--surface)',
                        }}
                      >
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{s.student_id} {s.is_isolated && <span title="Isolation flagged">🔴</span>}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: clusterColor(s.social_group), marginTop: '4px' }}>{s.social_group}</div>
                      </button>
                    );
                  })}
                </div>
                {filtered.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '15px' }}>No students match.</p>}
              </>
            )}
          </>
        )}

        {source === 'real' && (
          <>
            {realLoading && <p style={{ color: 'var(--text-2)', fontSize: '16px' }}>Loading student accounts…</p>}
            {realError && <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {realError}</div>}

            {!realLoading && !realError && realStudents.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: '15px' }}>
                No registered student accounts yet. Register one, then file Coping Strategies
                check-ins for them (or run scripts/seed_social_isolation_history.py to generate history).
              </p>
            )}

            {!realLoading && !realError && realStudents.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {realStudents.map(s => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedId(s.id); setPhase('idle'); setResult(null); }}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'var(--accent-dim)' : 'var(--surface)',
                      }}
                    >
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{s.full_name}</div>
                      <div style={{ fontSize: '14px', color: s.eligible ? 'var(--ok)' : 'var(--warn)', marginTop: 4, fontWeight: 600 }}>
                        {s.eligible ? `✓ ${s.checkins_count} check-ins` : `${s.checkins_count} of 2 check-ins`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="ra-btn-row" style={{ justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button
            className="ra-btn ra-btn-gold"
            onClick={() => runDetection()}
            disabled={!selectedId || phase === 'loading' || (source === 'real' && selectedRealStudent && !selectedRealStudent.eligible)}
          >
            ✦ Detect &amp; Match {source === 'real' ? (selectedRealStudent?.full_name || '…') : (selectedId || '…')}
          </button>
        </div>
      </div>

      {/* Not dismissible by design: the anomaly detector and real peer pool
          aren't available on this path — see the caveat further down. */}
      {source === 'real' && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 10,
          background: 'var(--warn-dim)', border: '1px solid var(--warn-dim)',
          color: 'var(--warn)', fontSize: 15, lineHeight: 1.6, marginBottom: '1.25rem',
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            Real-student detections use cluster membership only — the anomaly detector trained
            alongside the CSV cohort model wasn't exported, so isolation flagging is less
            sensitive here. Peer matches are also drawn from the training cohort, not other real
            students, until enough real accounts have real history.
          </span>
        </div>
      )}

      {/* Not-eligible progress state — a 200 response, not an error. */}
      {phase === 'done' && result && result.eligible === false && (
        <div className="ra-card">
          <div className="ra-card-title"><span>📋</span> Not enough check-ins yet</div>
          <p style={{ fontSize: 16, color: 'var(--text-2)', marginBottom: '1rem' }}>
            {result.checkins_count} of {result.checkins_needed} check-ins needed before this
            student can be profiled and clustered.
          </p>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (result.checkins_count / result.checkins_needed) * 100)}%`, background: 'var(--warn)', borderRadius: 4 }} />
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="ra-card">
          <div className="ra-loading">
            <div className="ra-spinner"></div>
            <p>Running clustering pipeline…</p>
            <div style={{ fontSize: '15px', color: 'var(--text-3)', marginTop: '8px' }}>{loadStep}</div>
          </div>
        </div>
      )}

      {phase === 'error' && <div style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {error}</div>}

      {phase === 'done' && result && result.eligible !== false && (
        <div className="fade-in">
          <div className="ra-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{result.cluster_icon}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 28px', borderRadius: 12, fontSize: '1.1rem', fontWeight: 700, background: `${clusterColor(result.cluster_name)}22`, color: clusterColor(result.cluster_name), border: `1px solid ${clusterColor(result.cluster_name)}55`, marginBottom: 12 }}>
              {result.cluster_name}
            </div>
            {result.isolation_risk_flag && (
              <div style={{ display: 'inline-block', marginLeft: 10, fontSize: 14, fontWeight: 700, color: 'var(--bad)', background: 'var(--bad-dim)', padding: '4px 10px', borderRadius: 8 }}>⚠ Isolation Risk Flagged</div>
            )}
            <p style={{ fontSize: '16px', color: 'var(--text-2)', maxWidth: 520, margin: '10px auto 0' }}>{result.narrative}</p>
            <p style={{ fontSize: '14px', color: 'var(--text-3)', marginTop: 8 }}>Based on {result.survey_count} weekly check-ins for {result.student_id}</p>
          </div>

          <div className="ra-grid-2" style={{ marginBottom: '1rem', gridTemplateColumns: '1.2fr 1fr' }}>
            <div className="ra-card">
              <div className="ra-card-title">Aggregated Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {Object.entries(result.profile).map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--surface-2)' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{PROFILE_LABELS[k] || k}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ra-card">
              <div className="ra-card-title">Distance to Clusters</div>
              {result.cluster_distances.map((d, i) => {
                const maxD = Math.max(...result.cluster_distances.map(x => x.distance), 1);
                const pct = Math.round((d.distance / maxD) * 100);
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 4 }}>
                      <span style={{ color: clusterColor(d.cluster) }}>{d.cluster}</span>
                      <span style={{ color: 'var(--text-2)' }}>{d.distance}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: clusterColor(d.cluster), borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: '1rem', fontSize: 14, color: 'var(--text-3)' }}>
                Silhouette {result.eval_metrics.silhouette_score.toFixed(3)} · Davies-Bouldin {result.eval_metrics.davies_bouldin_index.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="ra-card">
            <div className="ra-card-title"><span>🤝</span> Suggested Peer Matches</div>
            <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 12 }}>Nearest students (by scaled profile distance) who aren't isolation-flagged.</p>
            {result.peer_matches.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, border: `1px solid ${i === 0 ? 'var(--ok-dim)' : 'var(--border)'}`, background: i === 0 ? 'var(--ok-dim)' : 'var(--surface)', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{p.student_id} {i === 0 && <span style={{ fontSize: 13, fontWeight: 600, background: 'var(--ok-dim)', color: 'var(--ok)', padding: '2px 8px', borderRadius: 10, marginLeft: 6 }}>Best Match</span>}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-3)' }}>{p.cluster}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{Math.round(p.compatibility * 100)}%</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>compatibility</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ra-card">
            <div className="ra-card-title"><span>💡</span> Recommendations</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 16, color: 'var(--text-2)', lineHeight: 1.9 }}>
              {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>

          <div className="ra-btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button className="ra-btn ra-btn-outline" onClick={() => { setPhase('idle'); setResult(null); }}>← Pick Another Student</button>
          </div>
        </div>
      )}
    </div>
  );
}
