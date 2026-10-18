import React, { useState, useEffect } from 'react';
import '../styles/RiskAnalysis.css';
import { listForecastStudents, listRealForecastStudents, predictForecast } from '../api/forecast';

function Sparkline({ vals, showForecast }) {
  if (!vals || vals.length === 0) return null;
  const W = 600, H = 140;
  const pad = { l: 40, r: 20, t: 20, b: 30 };
  const minV = Math.max(0, Math.min(...vals) - 5);
  const maxV = Math.min(100, Math.max(...vals) + 5);
  const n = vals.length;
  const xScale = i => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const yScale = v => H - pad.b - ((v - minV) / (maxV - minV)) * (H - pad.t - pad.b);

  const points = vals.map((v, i) => [xScale(i), yScale(v)]);
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaD = pathD + ` L${points[points.length - 1][0].toFixed(1)},${H - pad.b} L${pad.l},${H - pad.b} Z`;

  const yTicks = [0, 25, 50, 75, 100].filter(v => v >= minV && v <= maxV);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '160px', display: 'block' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".15" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map(v => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={yScale(v)} y2={yScale(v)} stroke="var(--surface-2)" strokeWidth="1" />
          <text x={pad.l - 5} y={yScale(v) + 4} fontSize="9" fill="var(--text-3)" textAnchor="end">{v}</text>
        </g>
      ))}

      <path d={areaD} fill="url(#areaGrad)" stroke="none" />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {showForecast && points.length >= 2 && (
        <line
          x1={points[points.length - 2][0]} y1={points[points.length - 2][1]}
          x2={points[points.length - 1][0]} y2={points[points.length - 1][1]}
          stroke="var(--warn)" strokeWidth="2" strokeDasharray="5,3"
        />
      )}

      {points.map(([px, py], i) => {
        const isFc = showForecast && i === vals.length - 1;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={isFc ? 6 : 4} fill={isFc ? 'var(--warn)' : 'var(--accent)'} stroke="var(--bg-panel)" strokeWidth="2" />
            <text x={px} y={py - 10} fontSize="10" fill={isFc ? 'var(--warn)' : 'var(--accent-2)'} textAnchor="middle" fontWeight="600">{vals[i].toFixed(0)}</text>
            <text x={px} y={H - pad.b + 14} fontSize="10" fill={isFc ? 'var(--warn)' : 'var(--text-2)'} textAnchor="middle" fontWeight={isFc ? '600' : '400'}>
              {isFc ? 'Next' : `W${i + 1}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// `onBack`/`inline` are still passed by Dashboard.jsx but unused here — this
// component renders inline and has no back button of its own.
export default function RiskAnalysis({ initialStudentId = null }) {
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
  // registered accounts, forecast from their own stored check-in history.
  const [source, setSource] = useState('csv');
  const [realStudents, setRealStudents] = useState([]);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState('');

  useEffect(() => {
    listForecastStudents()
      .then(list => {
        setStudents(list);
        setStudentsLoading(false);
        // Deep-linked from the home search bar — jump straight to the forecast.
        if (initialStudentId && list.some(s => s.student_id === initialStudentId)) {
          setSelectedId(initialStudentId);
          setTimeout(() => runForecast(initialStudentId), 0);
        }
      })
      .catch(err => { setStudentsError(err.message); setStudentsLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-student roster is fetched lazily — only when that mode is opened,
  // so the default CSV path makes exactly the same requests it always did.
  useEffect(() => {
    if (source !== 'real' || realStudents.length || realLoading) return;
    setRealLoading(true);
    listRealForecastStudents()
      .then(list => { setRealStudents(list); setRealLoading(false); })
      .catch(err => { setRealError(err.message); setRealLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const switchSource = (next) => {
    setSource(next);
    setSelectedId('');
    setResult(null);
    setPhase('idle');
    setError('');
    setSearch('');
  };

  const selectedRealStudent = realStudents.find(s => s.id === selectedId);

  useEffect(() => {
    if (phase !== 'loading') return;
    const steps = ['Building lag features…', 'Computing rolling statistics…', 'Running LightGBM forecast model…'];
    let i = 0;
    setLoadStep(steps[0]);
    const id = setInterval(() => { i = (i + 1) % steps.length; setLoadStep(steps[i]); }, 700);
    return () => clearInterval(id);
  }, [phase]);

  const runForecast = async (idOverride) => {
    const id = (typeof idOverride === 'string' && idOverride) || selectedId;
    if (!id) return;
    setPhase('loading'); setError('');
    try {
      const data = await predictForecast(id);
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

  // A parent's forecast result is the reduced {summary, trend} shape (no
  // trajectory/predicted_next_week_score) — without this guard, .map() on
  // undefined here crashed the whole page for any parent who ran a forecast.
  const allWb = result?.trajectory
    ? [...result.trajectory.map(t => t.actual_score), result.predicted_next_week_score]
    : [];

  return (
    <div className="ra-root">
      <div className="ra-header">
        <h2>Wellbeing Forecasting</h2>
        <p>Pick a student with real weekly history. A LightGBM time-series model — trained on lag features, rolling statistics, and momentum — forecasts their wellbeing score for next week.</p>
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
            ? `Forecasting needs real multi-week history per student — this app doesn't have that
               accumulated yet from live use, so this picks from the real 300-student / 8-week
               dataset the model was trained and evaluated on.`
            : `Registered student accounts, forecast from their own stored wellbeing check-ins.
               At least 3 check-ins are needed before the model can run — the deepest feature
               looks back 3 records.`}
        </p>

        {source === 'csv' && (
          <>
            {studentsLoading && <p style={{ color: 'var(--text-2)', fontSize: '16px' }}>Loading students…</p>}
            {studentsError && <div className="ra-alert-danger" style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {studentsError}</div>}

            {!studentsLoading && !studentsError && (
              <>
                <input
                  type="text"
                  placeholder="Search student ID (e.g. S001)…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '16px', marginBottom: '12px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {filtered.slice(0, 60).map(s => {
                    const active = s.student_id === selectedId;
                    const riskColor = s.risk_label === 'HIGH' ? 'var(--bad)' : s.risk_label === 'MEDIUM' ? 'var(--warn)' : 'var(--ok)';
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
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{s.student_id}</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-3)' }}>Grade {s.grade}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: riskColor, marginTop: '4px' }}>{s.risk_label}</div>
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
            {realError && <div className="ra-alert-danger" style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {realError}</div>}

            {!realLoading && !realError && realStudents.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: '15px' }}>
                No registered student accounts yet. Register one in the app, then file wellbeing
                check-ins for them (or run scripts/seed_forecast_history.py to generate history).
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
                        {s.eligible ? `✓ ${s.checkins_count} check-ins` : `${s.checkins_count} of 3 check-ins`}
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
            onClick={() => runForecast()}
            disabled={!selectedId || phase === 'loading' || (source === 'real' && selectedRealStudent && !selectedRealStudent.eligible)}
          >
            ✦ Forecast {source === 'real' ? (selectedRealStudent?.full_name || '…') : (selectedId || '…')}
          </button>
        </div>
      </div>

      {/* Not dismissible by design: the model was never validated on real
          user data, only on the training cohort. */}
      {source === 'real' && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 10,
          background: 'var(--warn-dim)', border: '1px solid var(--warn-dim)',
          color: 'var(--warn)', fontSize: 15, lineHeight: 1.6, marginBottom: '1.25rem',
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            This model was trained and validated on the training cohort only — treat real-student
            forecasts as provisional until validated on real data.
          </span>
        </div>
      )}

      {/* Not-eligible progress state — a 200 response, not an error. */}
      {phase === 'done' && result && result.eligible === false && (
        <div className="ra-card">
          <div className="ra-card-title"><span>📋</span> Not enough check-ins yet</div>
          <p style={{ fontSize: 16, color: 'var(--text-2)', marginBottom: '1rem' }}>
            {result.checkins_count} of {result.checkins_needed} check-ins needed before this student
            can be forecast. The deepest feature looks back {result.checkins_needed} records — with
            fewer, the model would be run on zero-filled inputs.
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
            <p>Running time-series forecast…</p>
            <div style={{ fontSize: '15px', color: 'var(--text-3)', marginTop: '8px' }}>{loadStep}</div>
          </div>
        </div>
      )}

      {phase === 'error' && <div className="ra-alert-danger" style={{ background: 'var(--bad-dim)', color: 'var(--bad)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bad-dim)', fontSize: '16px', marginBottom: '1rem' }}>⚠ {error}</div>}

      {/* Parent role gets a reduced {summary, trend} shape, not the full
          trajectory/metrics breakdown teacher/counselor see. */}
      {phase === 'done' && result && result.summary && result.predicted_next_week_score === undefined && (
        <div className="ra-card" style={{ textAlign: 'center' }}>
          <div className="ra-card-title" style={{ justifyContent: 'center' }}>Forecast Summary</div>
          <div className={`ra-trend-badge ${result.trend === 'improving' ? 'ra-trend-up' : result.trend === 'declining' ? 'ra-trend-down' : 'ra-trend-flat'}`} style={{ margin: '0.75rem auto' }}>
            {result.trend === 'improving' ? '↑ Improving' : result.trend === 'declining' ? '↓ Declining' : '→ Stable'}
          </div>
          <p style={{ fontSize: '16px', color: 'var(--text-2)', maxWidth: 480, margin: '0.5rem auto 0' }}>{result.summary}</p>
        </div>
      )}

      {phase === 'done' && result && result.predicted_next_week_score !== undefined && (
        <div className="fade-in">
          <div className="ra-card">
            <div className="ra-forecast-hero">
              <div className="ra-forecast-label" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>Predicted Next Week Wellbeing Score</div>
              <div className="ra-forecast-score">{result.predicted_next_week_score}</div>
              <div className="ra-forecast-label">out of 100 &nbsp;·&nbsp; currently {result.current_score} (week {result.current_week})</div>
              <div className={`ra-trend-badge ${result.trend === 'improving' ? 'ra-trend-up' : result.trend === 'declining' ? 'ra-trend-down' : 'ra-trend-flat'}`}>
                {result.trend === 'improving' ? `↑ Improving (${result.delta > 0 ? '+' : ''}${result.delta})` : result.trend === 'declining' ? `↓ Declining (${result.delta})` : '→ Stable'}
              </div>
            </div>
            {result.actual_next_week_score !== null && (
              <p style={{ fontSize: '16px', color: 'var(--text-2)', textAlign: 'center', paddingBottom: '1rem' }}>
                Real dataset's actual next-week score for this student: <strong style={{ color: 'var(--text)' }}>{result.actual_next_week_score}</strong>
                {' '}(model error this case: {Math.abs(result.actual_next_week_score - result.predicted_next_week_score).toFixed(1)} pts)
              </p>
            )}
          </div>

          <div className="ra-grid-2 ra-grid-wide" style={{ marginBottom: '1rem' }}>
            <div className="ra-card">
              <div className="ra-card-title"><span>📈</span> Wellbeing Trajectory</div>
              <Sparkline vals={allWb} showForecast={true} />
              <p style={{ fontSize: '14px', color: 'var(--text-3)', marginTop: '6px' }}>Weeks 1–{result.weeks_of_history} (real history) + Next (forecast)</p>
            </div>
            <div className="ra-card">
              <div className="ra-card-title">Model Metrics</div>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '10px' }}>Global test-set metrics (temporal split, weeks 7–8 held out) — same for every prediction, not per-student.</p>
              <div className="ra-metric-grid-4 ra-metric-grid-2col">
                <div className="ra-metric-cell"><div className="ra-metric-name">MAE</div><div className="ra-metric-val">{result.eval_metrics.mae.toFixed(2)}</div><div className="ra-metric-sub">Error</div></div>
                <div className="ra-metric-cell"><div className="ra-metric-name">RMSE</div><div className="ra-metric-val">{result.eval_metrics.rmse.toFixed(2)}</div><div className="ra-metric-sub">Root error</div></div>
                <div className="ra-metric-cell highlight"><div className="ra-metric-name">R²</div><div className="ra-metric-val">{result.eval_metrics.r_squared.toFixed(3)}</div><div className="ra-metric-sub">Fit quality</div></div>
                <div className="ra-metric-cell"><div className="ra-metric-name">MASE</div><div className="ra-metric-val">{result.eval_metrics.mase.toFixed(2)}</div><div className="ra-metric-sub">Scaled error</div></div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <div className="ra-card-title" style={{ fontSize: '16px', marginBottom: '8px' }}>Directional Accuracy</div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--surface-2)' }}>
                  <div style={{ fontSize: '2rem', fontFamily: "'DM Serif Display', serif", color: result.eval_metrics.directional_accuracy >= 70 ? 'var(--ok)' : 'var(--warn)' }}>{result.eval_metrics.directional_accuracy}%</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-2)', marginTop: '2px' }}>Directional Accuracy</div>
                  <div style={{ marginTop: '8px', height: '8px', background: 'var(--border)', borderRadius: '4px' }}>
                    <div style={{ height: '100%', width: `${result.eval_metrics.directional_accuracy}%`, background: result.eval_metrics.directional_accuracy >= 70 ? 'var(--ok)' : 'var(--warn)', borderRadius: '4px' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ra-card">
            <div className="ra-card-title"><span>🔍</span> Top Forecast Drivers <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-3)', fontWeight: 400 }}>LightGBM feature importance</span></div>
            {result.top_features.map((f, i) => {
              const maxImp = result.top_features[0]?.importance || 1;
              const pct = Math.round((f.importance / maxImp) * 100);
              return (
                <div className="ra-driver-row" key={i}>
                  <div className="ra-driver-header">
                    <span className="ra-driver-name">{f.feature}</span>
                    <span className="ra-driver-pct" style={{ color: 'var(--accent-2)' }}>{f.importance}</span>
                  </div>
                  <div className="ra-driver-track">
                    <div className="ra-driver-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }}></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ra-btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button className="ra-btn ra-btn-outline" onClick={() => { setPhase('idle'); setResult(null); }}>← Pick Another Student</button>
          </div>
        </div>
      )}
    </div>
  );
}
