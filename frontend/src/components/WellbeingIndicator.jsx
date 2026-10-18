import React, { useState, useEffect } from 'react';
import '../styles/WellbeingIndicator.css';
import { getWellbeingHistory, predictWellbeing, deleteWellbeingHistoryItem } from '../api/wellbeing';
import StudentPicker from './StudentPicker';
import { listRegisteredStudents } from '../api/students';
import { getCurrentUser } from '../constants/permissions';
import { cssVar } from '../utils/color';
import Pagination from './Pagination';

// Minimal token set for Pagination — this file styles everything via plain
// var(--x) strings/CSS classes rather than a `T` object like the "decide"
// pages, so build the small subset Pagination needs here.
const PAGINATION_THEME = { blue: 'var(--accent)', blueBg: 'var(--accent-dim)', border: 'var(--border)', text3: 'var(--text-3)' };
const HISTORY_PAGE_SIZE = 10;

// Matches the 22 raw inputs Member 1's REAL trained model (Lasso, from
// their notebook) actually expects — see backend/ml/wellbeing_indicator/features.py.
const INITIAL = {
  grade:10, week:4, avg_exam_score:68, study_hours:3.5, homework_completion_rate:0.7,
  attendance_rate:85, absence_count:2, stress_level:4, anxiety_level:2, sleep_hours:7,
  fatigue_level:2, motivation_level:3, confidence_level:3, peer_interaction:3,
  teacher_support:3, class_participation:3, teacher_engagement_score:3, behavior_rating:4,
  academic_stress_index:0.35, attendance_stability_index:0.95, performance_trend_index:0,
  behavioral_score:0.75,
};

const FIELDS = {
  grade:              { label:'Grade Level',           min:6,  max:12,  step:1,    fmt:v=>`Grade ${v}`,  hint:'' },
  week:               { label:'Week of Term',          min:1,  max:12,  step:1,    fmt:v=>`Week ${v}`,   hint:'' },
  avg_exam_score:      { label:'Avg Exam Score',        min:0,  max:100, step:1,    fmt:v=>`${v}%`,       hint:'' },
  study_hours:        { label:'Study Hours/Day',       min:0,  max:10,  step:0.5,  fmt:v=>`${v} hrs`,    hint:'' },
  homework_completion_rate:{ label:'HW Completion',   min:0,  max:1,   step:0.05, fmt:v=>`${Math.round(v*100)}%`, hint:'' },
  attendance_rate:     { label:'Attendance Rate',       min:0,  max:100, step:1,    fmt:v=>`${v}%`,       hint:'' },
  absence_count:       { label:'Absence Count',         min:0,  max:15,  step:1,    fmt:v=>`${v}`,        hint:'This term' },
  stress_level:        { label:'Stress Level',          min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     hint:'1=none, 10=extreme' },
  anxiety_level:       { label:'Anxiety Level',         min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     hint:'' },
  sleep_hours:         { label:'Sleep Hours',           min:2,  max:12,  step:0.5,  fmt:v=>`${v} hrs`,    hint:'Avg hours/night' },
  fatigue_level:       { label:'Fatigue Level',         min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     hint:'' },
  motivation_level:    { label:'Motivation Level',      min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  confidence_level:    { label:'Confidence Level',      min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  peer_interaction:    { label:'Peer Interaction',      min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  teacher_support:     { label:'Teacher Support',       min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  class_participation: { label:'Class Participation',   min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  teacher_engagement_score:{ label:'Teacher Engagement', min:1, max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'Educator-rated' },
  behavior_rating:     { label:'Behavior Rating',       min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      hint:'' },
  academic_stress_index:{ label:'Academic Stress Index (ASI)', min:0, max:1, step:0.01, fmt:v=>v.toFixed(2), hint:'Weighted combination of workload, exam pressure, and self-reported stress' },
  attendance_stability_index:{ label:'Attendance Stability Index (ATI)', min:0, max:1, step:0.01, fmt:v=>v.toFixed(2), hint:'Consistency of attendance over a rolling 4-week window' },
  performance_trend_index:{ label:'Performance Trend Index (PTI)', min:-1, max:1, step:0.01, fmt:v=>v.toFixed(2), hint:'Regression slope of term-by-term exam scores — negative = declining, positive = improving' },
  behavioral_score:    { label:'Behavioral Score (BS)', min:0, max:1, step:0.01, fmt:v=>v.toFixed(2), hint:'Normalized teacher behavioral rating + peer interaction score' },
};

// These 4 (ASI/ATI/PTI/BS) are the spec's "computed wellbeing indicators"
// (Section 1.4.1) — in a full system they'd be auto-derived from raw
// attendance logs, exam history, and behavioral surveys by Component 1's
// data framework. That derivation layer doesn't exist yet in this build,
// so they're entered directly here as a stand-in for now. They ARE real
// inputs to the trained Lasso model either way (confirmed via its
// feature_names_in_) — this doesn't change what gets sent to the API,
// only how honestly the UI labels what these numbers represent.
const COMPUTED_INDICATOR_FIELDS = ['academic_stress_index', 'attendance_stability_index', 'performance_trend_index', 'behavioral_score'];

const STEPS = [
  { label:'Academic', icon:'📚', fields:['grade','week','avg_exam_score','study_hours','homework_completion_rate','attendance_rate','absence_count'],
    sections:[{ label:'Context', fields:['grade','week'], grid:2 },
              { label:'Performance', fields:['avg_exam_score','study_hours','homework_completion_rate'], grid:3 },
              { label:'Attendance', fields:['attendance_rate','absence_count'], grid:2 }] },
  { label:'Sleep & Stress', icon:'😴', fields:['stress_level','anxiety_level','sleep_hours','fatigue_level'],
    sections:[{ label:'Stress', fields:['stress_level','anxiety_level'], grid:2 },
              { label:'Rest', fields:['sleep_hours','fatigue_level'], grid:2 }] },
  { label:'Engagement & Behavior', icon:'👥', fields:['motivation_level','confidence_level','peer_interaction','teacher_support','class_participation','teacher_engagement_score','behavior_rating','academic_stress_index','attendance_stability_index','performance_trend_index','behavioral_score'],
    sections:[{ label:'Engagement', fields:['motivation_level','confidence_level','class_participation'], grid:3 },
              { label:'Support', fields:['peer_interaction','teacher_support','teacher_engagement_score'], grid:3 },
              { label:'Behavior', fields:['behavior_rating'], grid:3 },
              { label:'Computed Wellbeing Indicators (ASI / ATI / PTI / BS)', fields:COMPUTED_INDICATOR_FIELDS, grid:2, computed:true }] },
  { label:'Review & Predict', icon:'⚙️', fields:[] },
  { label:'Recommendations & History', icon:'💡', fields:[] },
];

function computeEng(v) {
  const stress = v.stress_level, sleep = v.sleep_hours;
  return {
    sleep_stress_ratio: stress>0 ? (sleep/stress).toFixed(3) : '∞',
    engagement_composite: ((v.motivation_level+v.confidence_level+v.class_participation)/3).toFixed(1),
    academic_effort_index: (v.study_hours*v.homework_completion_rate).toFixed(2),
    social_support_index: ((v.peer_interaction+v.teacher_support)/2).toFixed(1),
    stress_squared: (stress*stress).toFixed(1),
    sleep_squared: (sleep*sleep).toFixed(2),
    stress_x_sleep: (stress*sleep).toFixed(2),
    motivation_x_study: (v.motivation_level*v.study_hours).toFixed(1),
    absence_count_log: v.absence_count>0 ? Math.log(v.absence_count+1).toFixed(3) : '0.000',
    stress_squared_log: Math.log(stress*stress+1).toFixed(3),
  };
}

const ENG_DESC = {
  sleep_stress_ratio:'sleep ÷ stress', engagement_composite:'avg(motiv,conf,part)',
  academic_effort_index:'study_hrs × hw_rate', social_support_index:'avg(peer,teacher)',
  stress_squared:'stress²', sleep_squared:'sleep²', stress_x_sleep:'stress × sleep',
  motivation_x_study:'motivation × study', absence_count_log:'log(absence+1)',
  stress_squared_log:'log(stress²+1)',
};

// var() references — resolve natively in style props AND SVG presentation
// attributes (fill/stroke), repainting automatically when Settings ->
// Appearance changes the active theme.
const RISK_HEX = { LOW: 'var(--ok)', MEDIUM: 'var(--warn)', HIGH: 'var(--bad)' };

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Real summary stats over the actual history — not decorative, every
// number here is computed from the same records the list below shows.
function HistoryStats({ items }) {
  if (items.length === 0) return null;
  const scores = items.map(h => h.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best = Math.max(...scores);
  const first = items[items.length - 1].score, last = items[0].score;
  const trendDiff = last - first;
  const trend = trendDiff > 1 ? 'Improving' : trendDiff < -1 ? 'Declining' : 'Stable';
  const trendColor = trendDiff > 1 ? RISK_HEX.LOW : trendDiff < -1 ? RISK_HEX.HIGH : 'var(--text-3)';
  const trendIcon = trendDiff > 1 ? '↗' : trendDiff < -1 ? '↘' : '→';

  const tiles = [
    { label: 'Check-ins', value: items.length, color: 'var(--text)' },
    { label: 'Latest', value: Math.round(last), color: 'var(--text)' },
    { label: 'Average', value: Math.round(avg), color: 'var(--text)' },
    { label: 'Best', value: Math.round(best), color: RISK_HEX.LOW },
    { label: 'Trend', value: `${trendIcon} ${trend}`, color: trendColor, small: true },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
      {tiles.map(t => (
        <div key={t.label} style={{ background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: t.small ? 13 : 20, fontWeight: 700, color: t.color, whiteSpace: 'nowrap' }}>{t.value}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// Trend chart for the History tab — gradient area fill + gridlines +
// risk-colored points, built from real check-in scores, oldest to newest
// (history itself is stored newest-first).
function HistorySparkline({ items }) {
  if (items.length < 2) return null;
  const chrono = [...items].reverse();
  const vals = chrono.map(h => h.score);
  const W = 300, H = 120, padX = 8, padY = 16;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 10;
  const yMin = min - span * 0.15, yMax = max + span * 0.15;
  const x = i => padX + (i / (vals.length - 1)) * (W - padX * 2);
  const y = v => H - padY - ((v - yMin) / (yMax - yMin)) * (H - padY * 2);
  const points = vals.map((v, i) => [x(i), y(v)]);
  const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${H - padY} L${points[0][0].toFixed(1)},${H - padY} Z`;
  const gridLines = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '130px', display: 'block' }}>
        <defs>
          <linearGradient id="wiHistFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="var(--surface-2)" strokeWidth="1" />
            <text x={W - padX} y={y(g) - 3} fontSize="8" fill="var(--text-3)" textAnchor="end">{Math.round(g)}</text>
          </g>
        ))}
        <path d={area} fill="url(#wiHistFill)" stroke="none" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map(([px, py], i) => {
          const isLast = i === points.length - 1;
          const col = RISK_HEX[chrono[i].risk_label] || 'var(--accent)';
          return (
            <circle key={i} cx={px} cy={py} r={isLast ? 5 : 3} fill={isLast ? col : 'var(--bg-panel)'} stroke={col} strokeWidth="2" />
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 13, color: 'var(--text-3)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: RISK_HEX.LOW, marginRight: 4 }} />Low risk</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: RISK_HEX.MEDIUM, marginRight: 4 }} />Medium</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: RISK_HEX.HIGH, marginRight: 4 }} />High</span>
      </div>
    </div>
  );
}

// Vertical timeline layout for the check-in list, replacing plain rows —
// a connecting line + risk-colored dot per entry, relative timestamps.
function HistoryTimeline({ items, onDelete, deleting }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
      {items.map((h, i) => {
        const prev = items[i + 1];
        const delta = prev ? h.score - prev.score : null;
        const col = RISK_HEX[h.risk_label] || 'var(--text-3)';
        // The glow ring below concatenates a hex alpha suffix, which only
        // works with a real color value — var(--x) can't be resolved that
        // way, so this one spot needs the actual resolved hex instead of `col`.
        const glowCol = cssVar(`--${h.risk_label === 'LOW' ? 'ok' : h.risk_label === 'HIGH' ? 'bad' : 'warn'}`) || col;
        return (
          <div key={h.id || i} style={{ position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 18 }}>
            <div style={{ position: 'absolute', left: -22, top: 4, width: 12, height: 12, borderRadius: '50%', background: col, border: '2px solid var(--bg-panel)', boxShadow: `0 0 0 2px ${glowCol}55` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--surface-2)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', minWidth: 44 }}>{Math.round(h.score)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--text-3)' }}>{timeAgo(h.created_at)}</div>
                <span className={`wi-pill wi-pill-${h.risk_label==='LOW'?'low':h.risk_label==='HIGH'?'high':'med'}`}>{h.risk_label} RISK</span>
              </div>
              {delta !== null
                ? (delta === 0
                    ? <div style={{ fontSize: 15, color: 'var(--text-3)' }}>→ No change</div>
                    : <div style={{ fontSize: 15, fontWeight: 600, color: delta > 0 ? RISK_HEX.LOW : RISK_HEX.HIGH }}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}</div>)
                : <div style={{ fontSize: 14, color: 'var(--text-3)' }}>First run</div>}
              {h.id && onDelete && (
                <button
                  onClick={() => onDelete(h.id)}
                  disabled={!!deleting?.[h.id]}
                  title="Delete this check-in from history"
                  style={{ marginLeft: 4, padding: '5px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)' }}
                >
                  {deleting?.[h.id] ? '…' : '🗑'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SliderField({ id, vals, onChange }) {
  const f = FIELDS[id];
  return (
    <div className="wi-field">
      <label>{f.label}</label>
      <div className="wi-slider-wrap">
        <input type="range" min={f.min} max={f.max} step={f.step} value={vals[id]}
          onChange={e => onChange(id, parseFloat(e.target.value))} />
        <span className="wi-slider-val">{f.fmt(vals[id])}</span>
      </div>
      {f.hint && <div className="wi-field-hint">{f.hint}</div>}
    </div>
  );
}

export default function WellbeingIndicator({ initialStudentId = null }) {
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState(INITIAL);
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [loadStep, setLoadStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [deletingHistory, setDeletingHistory] = useState({}); // id -> true while a request is in flight
  const [resultTab, setResultTab] = useState('recommendations'); // recommendations | history
  // The whole student object, not just an id — the History tab shows the name.
  const [selectedStudent, setSelectedStudent] = useState(null);

  const role = getCurrentUser()?.role;
  const selectedStudentId = selectedStudent?.id || '';
  // Parents may only file against a linked child, so an untagged check-in is
  // rejected server-side with a 400 — gate the button rather than let them hit it.
  const studentRequired = role === 'parent';

  const eng = computeEng(vals);

  const change = (id, v) => setVals(prev => ({ ...prev, [id]: v }));

  const refreshHistory = (page = historyPage) =>
    getWellbeingHistory(selectedStudentId, page, HISTORY_PAGE_SIZE)
      .then(res => { setHistory(res.items); setHistoryTotal(res.total); })
      .catch(() => {});

  const deleteHistoryItem = async (id) => {
    if (!window.confirm('Delete this check-in from history? This cannot be undone.')) return;
    setDeletingHistory(d => ({ ...d, [id]: true }));
    try {
      await deleteWellbeingHistoryItem(id);
      setHistory(list => list.filter(h => h.id !== id));
      setHistoryTotal(t => Math.max(0, t - 1));
    } catch (err) {
      setError(err.message || 'Could not delete this check-in.');
    } finally {
      setDeletingHistory(d => ({ ...d, [id]: false }));
    }
  };

  // Real check-in history for this logged-in account, not a
  // browser-session-only list — loads on mount, whenever the selected
  // student or page changes, and after every new prediction. refreshHistory
  // is redefined every render (reads selectedStudentId/historyPage from the
  // closure) — listing it as a dep would just re-run this on every render
  // instead of only the two real triggers below.
  useEffect(() => { refreshHistory(historyPage); }, [selectedStudentId, historyPage]); // eslint-disable-line react-hooks/exhaustive-deps
  // Selecting a different student should always land back on page 1 of
  // their history, not wherever the previous student's list happened to be.
  useEffect(() => { setHistoryPage(1); }, [selectedStudentId]);

  // Deep-link support, for parity with RiskAnalysis/SocialIsolation.
  //
  // NOTE — this is currently a deliberate no-op: App.jsx only ever sets
  // initialStudentId from listForecastStudents(), i.e. a CSV cohort ID like
  // "S001", which can never equal a Mongo account id. The guard is what keeps
  // that safe. Do NOT "fix" it by fuzzy-matching S001 onto an account — those
  // are different populations and a false match would file a check-in under
  // the wrong child. Real deep-linking needs the home search bar to search
  // /students too, which is separate work.
  useEffect(() => {
    if (!initialStudentId) return;
    listRegisteredStudents()
      .then(list => {
        const hit = list.find(s => s.id === initialStudentId);
        if (hit) setSelectedStudent(hit);
      })
      .catch(() => {});
  }, [initialStudentId]);

  useEffect(() => {
    if (phase !== 'loading') return;
    const steps = ['Computing engineered features…','Normalizing feature vector (32 features)…','Running regression ensemble…','Computing risk classification…','Generating recommendations…'];
    let i = 0;
    const initial = setTimeout(() => setLoadStep(steps[0]), 0);
    const id = setInterval(() => { i=(i+1)%steps.length; setLoadStep(steps[i]); }, 900);
    return () => { clearTimeout(initial); clearInterval(id); };
  }, [phase]);

  // Reset to a fresh "run prediction" view only when arriving at Review
  // from the input steps (0-2) — not when coming back from step 4
  // (Recommendations & History), which would otherwise wipe the result
  // you just got.
  const goStep = n => { setStep(n); if(n===3 && step<3) setPhase('idle'); };

  const runPrediction = async () => {
    setPhase('loading'); setError('');
    try {
      const parsed = await predictWellbeing({ ...vals, student_id: selectedStudentId || null });
      setResult(parsed);
      // Land back on page 1 so the just-saved record (newest first) is
      // actually visible — refreshHistory(historyPage) alone would silently
      // refetch whatever page was previously open, which might not include it.
      setHistoryPage(1);
      refreshHistory(1); // pull the real, freshly-saved record back from the database
      setPhase('done');
    } catch(e) {
      setError(e.message);
      setPhase('error');
    }
  };

  const score = result ? Math.round(result.composite_wellbeing_score) : 0;
  const circumference = 2 * Math.PI * 60;
  const arcOffset = circumference - (score/100)*circumference;
  const scoreColor = score>=70?'var(--ok)':score>=50?'var(--warn)':'var(--bad)';
  const riskCls = result?.risk_label==='LOW'?'low':result?.risk_label==='HIGH'?'high':'med';
  // history[0] is the check-in that was just saved (post-refresh); history[1] is the one before it.
  const lastDelta = result && history.length > 1 ? Math.round(history[0].score - history[1].score) : null;

  const DIM_LABELS = {
    sleep_wellbeing:'Sleep Wellbeing', stress_management:'Stress Management',
    academic_engagement:'Academic Engagement', social_support:'Social Support',
    physical_lifestyle:'Physical & Lifestyle',
  };

  return (
    <div className="wi-root">
      <div className="wi-header">
        <h2>Wellbeing Indicator</h2>
        <p>Complete your check-in. The AI model analyzes 32 behavioral, academic, and lifestyle features to compute your composite wellbeing score and risk label.</p>
      </div>

      {/* STEP TABS */}
      <div className="wi-tabs">
        {STEPS.map((s,i) => (
          <button key={i} className={`wi-tab${step===i?' wi-tab-active':i<step?' wi-tab-done':''}`}
            onClick={()=>goStep(i)}>
            <span className="wi-tab-num">{i<step?'✓':i+1}</span>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* STEPS 0-2 */}
      {step < 3 && (
        <div className="wi-card">
          <div className="wi-card-title">
            <span className="wi-card-icon">{STEPS[step].icon}</span>
            {STEPS[step].label} Metrics
          </div>
          {step === 0 && (
            <div className="wi-field" style={{marginBottom:'1.5rem'}}>
              <label>
                Student{' '}
                <span style={{color:'var(--text-3)',fontWeight:400}}>
                  ({studentRequired ? 'required' : 'optional'})
                </span>
              </label>
              <div className="wi-field-hint" style={{marginBottom:10}}>
                File this check-in under a registered student account so their history
                stays separate from everyone else you check in on.
                {!studentRequired && ' Leave unselected for a general check-in.'}
              </div>
              <StudentPicker value={selectedStudent} onChange={setSelectedStudent} role={role} />
            </div>
          )}
          {STEPS[step].sections.map((sec,si) => (
            <div key={si}>
              <div className="wi-section-label" style={sec.computed?{display:'flex',alignItems:'center',gap:8}:undefined}>
                {sec.label}
                {sec.computed && <span style={{fontSize:13,fontWeight:700,letterSpacing:'.04em',color:'var(--accent-2)',background:'rgba(77,141,240,0.12)',padding:'2px 6px',borderRadius:4}}>SPEC-DEFINED</span>}
              </div>
              {sec.computed && (
                <p style={{fontSize:14,color:'var(--text-3)',margin:'-4px 0 10px'}}>
                  In production these would be auto-computed from raw attendance logs, exam history, and behavioral surveys — entered directly here since that derivation layer isn't built yet.
                </p>
              )}
              <div className={sec.grid===3?'wi-grid-3':'wi-grid-2'} style={{marginBottom:'0.5rem'}}>
                {sec.fields.map(fid => <SliderField key={fid} id={fid} vals={vals} onChange={change}/>)}
              </div>
            </div>
          ))}
          <div className="wi-btn-row">
            {step>0
              ? <button className="wi-btn wi-btn-outline" onClick={()=>goStep(step-1)}>← Back</button>
              : <span/>}
            <button className="wi-btn wi-btn-primary" onClick={()=>goStep(step+1)}>
              {step===2?'Review & Predict →':'Next →'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Predict */}
      {step === 3 && (
        <>
          {/* Engineered Features */}
          <div className="wi-card">
            <div className="wi-card-title">
              <span className="wi-card-icon">⚙️</span> Engineered Features
              <span className="wi-pill wi-pill-blue" style={{marginLeft:'auto'}}>Auto-computed</span>
            </div>
            <p style={{fontSize:'15px',color:'var(--text-3)',marginBottom:'12px'}}>
              10 features automatically derived from your inputs — capturing non-linear interactions.
            </p>
            <div className="wi-eng-grid">
              {Object.entries(eng).map(([k,v]) => (
                <div className="wi-eng-cell" key={k}>
                  <div className="wi-eng-name">{k}</div>
                  <div className="wi-eng-val">{v}</div>
                  <div className="wi-eng-desc">{ENG_DESC[k]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Input Summary */}
          <div className="wi-card">
            <div className="wi-card-title"><span className="wi-card-icon">📋</span> Input Summary</div>
            <div className="wi-summary-grid">
              {Object.keys(FIELDS).map(fid => (
                <div className="wi-summary-cell" key={fid}>
                  <div className="wi-summary-label">{FIELDS[fid].label}</div>
                  <div className="wi-summary-val">{FIELDS[fid].fmt(vals[fid])}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Predict Button */}
          <div style={{textAlign:'center',margin:'1.5rem 0'}}>
            <button className="wi-btn wi-btn-gold" onClick={runPrediction}
              disabled={phase==='loading' || (studentRequired && !selectedStudentId)}
              style={{fontSize:'18px',padding:'14px 36px'}}>
              ✦ Run Wellbeing Prediction
            </button>
            <p style={{fontSize:'15px',color:'var(--text-3)',marginTop:'8px'}}>
              {studentRequired && !selectedStudentId
                ? 'Go back to step 1 and select which of your children this check-in is for.'
                : 'The AI analyzes all 32 features and outputs your composite wellbeing score and risk label.'}
            </p>
          </div>

          {/* Loading */}
          {phase==='loading' && (
            <div className="wi-card">
              <div className="wi-loading">
                <div className="wi-spinner"/>
                <p>Running regression model…</p>
                <div className="wi-loading-step">{loadStep}</div>
              </div>
            </div>
          )}

          {/* Error */}
          {phase==='error' && (
            // Ownership 403 ("not your child") must be matched BEFORE the generic
            // 403 branch below, or a parent filing against another family's
            // student would be told it's their role that's wrong, which is false.
            error.toLowerCase().includes('linked to your account') ? (
              <div className="wi-card" style={{textAlign:'center', padding:'2rem 1.5rem'}}>
                <div style={{fontSize:'2rem', marginBottom:'0.75rem', opacity:0.5}}>👪</div>
                <div style={{fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:'0.4rem'}}>Not your student</div>
                <p style={{fontSize:15, color:'var(--text-3)', maxWidth:380, margin:'0 auto', lineHeight:1.6}}>
                  You can only run check-ins for a student linked to your account. Pick one of
                  your children in step 1, or ask a school administrator to link the account.
                </p>
              </div>
            ) : error.includes('400') || error.toLowerCase().includes('which of your children') ? (
              <div className="wi-card" style={{textAlign:'center', padding:'2rem 1.5rem'}}>
                <div style={{fontSize:'2rem', marginBottom:'0.75rem', opacity:0.5}}>👧</div>
                <div style={{fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:'0.4rem'}}>Select a student first</div>
                <p style={{fontSize:15, color:'var(--text-3)'}}>Go back to step 1 and choose which of your children this check-in is for.</p>
              </div>
            ) : error.includes('403') || error.toLowerCase().includes('access denied') ? (
              <div className="wi-card" style={{textAlign:'center', padding:'2rem 1.5rem'}}>
                <div style={{fontSize:'2rem', marginBottom:'0.75rem', opacity:0.5}}>🔒</div>
                <div style={{fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:'0.4rem'}}>Not available for your role</div>
                <p style={{fontSize:15, color:'var(--text-3)', maxWidth:360, margin:'0 auto'}}>
                  The Wellbeing Indicator is available to Teachers, Counselors, Parents, and Admins. Ask a staff member for a wellbeing check-in.
                </p>
              </div>
            ) : error.includes('401') || error.toLowerCase().includes('log in') ? (
              <div className="wi-card" style={{textAlign:'center', padding:'2rem 1.5rem'}}>
                <div style={{fontSize:'2rem', marginBottom:'0.75rem', opacity:0.5}}>🔑</div>
                <div style={{fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:'0.4rem'}}>Please log in</div>
                <p style={{fontSize:15, color:'var(--text-3)'}}>You need to be signed in to run a wellbeing check-in.</p>
              </div>
            ) : (
              <div className="wi-alert wi-alert-danger">⚠ {error}</div>
            )
          )}

          {/* Result — Parent role gets a reduced {summary, risk_label} shape,
              not the full breakdown a teacher/counselor sees. */}
          {phase==='done' && result && result.summary && result.composite_wellbeing_score===undefined && (
            <div className="wi-card" style={{textAlign:'center'}}>
              <div className="wi-card-title" style={{justifyContent:'center'}}>Wellbeing Summary</div>
              <div className={`wi-risk-badge wi-risk-${result.risk_label==='LOW'?'low':result.risk_label==='HIGH'?'high':'med'}`} style={{margin:'0.75rem auto'}}>
                {result.risk_label} RISK
              </div>
              <p style={{fontSize:'16px',color:'var(--text-2)',maxWidth:'480px',margin:'0 auto',lineHeight:1.7}}>{result.summary}</p>
            </div>
          )}

          {/* Result */}
          {phase==='done' && result && result.composite_wellbeing_score!==undefined && (
            <>
              {/* Score Ring */}
              <div className="wi-card" style={{textAlign:'center'}}>
                <div className="wi-card-title" style={{justifyContent:'center'}}>Composite Wellbeing Score</div>
                <div className="wi-ring-wrap wi-score-pop">
                  <svg width="150" height="150" viewBox="0 0 150 150">
                    <circle cx="75" cy="75" r="60" fill="none" stroke="var(--border)" strokeWidth="12"/>
                    <circle cx="75" cy="75" r="60" fill="none" stroke={scoreColor} strokeWidth="12"
                      strokeDasharray={circumference} strokeDashoffset={arcOffset}
                      strokeLinecap="round" style={{transition:'stroke-dashoffset 1.2s ease'}}/>
                  </svg>
                  <div className="wi-ring-center">
                    <div className="wi-score-big" style={{color:scoreColor}}>{score}</div>
                    <div className="wi-score-sub">out of 100</div>
                  </div>
                </div>
                <div className={`wi-risk-badge wi-risk-${riskCls}`} style={{marginTop:'1.25rem'}}>
                  <span style={{fontSize:'1.3rem'}}>
                    {result.risk_label==='LOW'?'✓':result.risk_label==='HIGH'?'⚠':'●'}
                  </span>
                  {result.risk_label} RISK
                </div>
                {lastDelta !== null && (
                  <div style={{marginTop:'0.6rem', fontSize:'15px', color: lastDelta>=0?'var(--ok)':'var(--bad)'}}>
                    {lastDelta>=0?'↑':'↓'} {Math.abs(lastDelta)} pts vs your last check-in
                  </div>
                )}
                <p style={{fontSize:'16px',color:'var(--text-2)',maxWidth:'480px',margin:'0 auto',lineHeight:1.7}}>
                  {result.score_narrative}
                </p>
              </div>

              {/* Breakdown + Metrics */}
              <div className="wi-result-two">
                <div className="wi-card">
                  <div className="wi-card-title">Dimension Breakdown</div>
                  {Object.entries(DIM_LABELS).map(([k,label]) => {
                    const v = Math.round(result.dimensions?.[k]||50);
                    const col = v>=70?'var(--ok)':v>=50?'var(--warn)':'var(--bad)';
                    return (
                      <div className="wi-dim-row" key={k}>
                        <div className="wi-dim-name">{label}</div>
                        <div className="wi-dim-track">
                          <div className="wi-dim-fill" style={{width:`${v}%`,background:col}}/>
                        </div>
                        <div className="wi-dim-num">{v}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="wi-card">
                  <div className="wi-card-title">Evaluation Metrics</div>
                  <div className="wi-eval-grid">
                    {[
                      {label:'MAE',val:(result.eval_metrics?.mae||0).toFixed(2),cls:''},
                      {label:'RMSE',val:(result.eval_metrics?.rmse||0).toFixed(2),cls:''},
                      {label:'R²',val:(result.eval_metrics?.r_squared||0).toFixed(3),cls:'blue'},
                      {label:'MAPE',val:(result.eval_metrics?.mape||0).toFixed(1)+'%',cls:''},
                    ].map(m => (
                      <div className={`wi-eval-cell ${m.cls}`} key={m.label}>
                        <div className="wi-eval-label">{m.label}</div>
                        <div className="wi-eval-val">{m.val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="wi-card-title" style={{marginTop:'1rem',marginBottom:'8px'}}>Feature Importance (Top 5)</div>
                  {(result.top_features||[]).map((f,i) => {
                    const pct = Math.round(f.importance*100);
                    const col = f.direction==='positive'?'var(--ok)':'var(--bad)';
                    return (
                      <div className="wi-feat-row" key={i}>
                        <div className="wi-feat-header">
                          <span className="wi-feat-name">{f.feature}</span>
                          <span className="wi-feat-pct" style={{color:col}}>{f.direction==='positive'?'↑':'↓'} {pct}%</span>
                        </div>
                        <div className="wi-feat-track">
                          <div className="wi-feat-fill" style={{width:`${Math.min(pct*4,100)}%`,background:col}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{display:'flex',justifyContent:'center',marginTop:'1rem'}}>
                <button className="wi-btn wi-btn-primary" onClick={()=>goStep(4)}>
                  Next: Recommendations & History →
                </button>
              </div>
            </>
          )}

          <div className="wi-btn-row" style={{marginTop:'1rem'}}>
            <button className="wi-btn wi-btn-outline" onClick={()=>goStep(2)}>← Back</button>
          </div>
        </>
      )}

      {/* STEP 4: Recommendations & History */}
      {step === 4 && (
        <>
          {!result ? (
            <div className="wi-card" style={{textAlign:'center', padding:'2.5rem 1.5rem'}}>
              <div style={{fontSize:'2rem', marginBottom:'0.75rem', opacity:0.5}}>💡</div>
              <div style={{fontSize:17, fontWeight:600, color:'var(--text)', marginBottom:'0.4rem'}}>No prediction yet</div>
              <p style={{fontSize:15, color:'var(--text-3)', marginBottom:'1.25rem'}}>Run a wellbeing check-in first to see your recommendations and history.</p>
              <button className="wi-btn wi-btn-primary" onClick={()=>goStep(3)}>← Go to Review & Predict</button>
            </div>
          ) : (
            <>
              <div className="wi-card">
                <div style={{display:'flex', gap:'4px', marginBottom:'1.25rem', borderBottom:'1px solid var(--border)'}}>
                  <button
                    onClick={()=>setResultTab('recommendations')}
                    style={{flex:1, padding:'10px', background:'none', border:'none', borderBottom: resultTab==='recommendations'?'2px solid var(--accent)':'2px solid transparent', color: resultTab==='recommendations'?'var(--text)':'var(--text-3)', fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}
                  >
                    💡 Recommendations
                  </button>
                  <button
                    onClick={()=>setResultTab('history')}
                    style={{flex:1, padding:'10px', background:'none', border:'none', borderBottom: resultTab==='history'?'2px solid var(--accent)':'2px solid transparent', color: resultTab==='history'?'var(--text)':'var(--text-3)', fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit'}}
                  >
                    📅 History {historyTotal>0 && `(${historyTotal})`}
                  </button>
                </div>

                {resultTab==='history' && selectedStudent && (
                  <div style={{fontSize:14,color:'var(--text-3)',marginBottom:'0.75rem',marginTop:'-0.5rem'}}>
                    Showing check-ins for <strong style={{color:'var(--text-2)'}}>{selectedStudent.full_name}</strong> only
                  </div>
                )}

                {resultTab==='recommendations' && (
                  <div className="wi-rec-grid">
                    {(result.recommendations||[]).map((r,i) => (
                      <div className={`wi-rec-card wi-rec-${r.priority}`} key={i}>
                        <h5>{r.icon} {r.title}</h5>
                        <p>{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {resultTab==='history' && (
                  history.length===0
                    ? <p style={{fontSize:'16px',color:'var(--text-3)',textAlign:'center',padding:'1rem'}}>No check-ins yet — run a prediction above to start your history.</p>
                    : <>
                        <HistoryStats items={history} />
                        <HistorySparkline items={history} />
                        <HistoryTimeline items={history} onDelete={deleteHistoryItem} deleting={deletingHistory} />
                        <Pagination page={historyPage} pageSize={HISTORY_PAGE_SIZE} total={historyTotal} onPageChange={setHistoryPage} theme={PAGINATION_THEME} />
                      </>
                )}
              </div>

              <div style={{display:'flex',gap:'10px',justifyContent:'center',marginTop:'1rem'}}>
                <button className="wi-btn wi-btn-outline" onClick={()=>{goStep(0);setPhase('idle');}}>← New Check-in</button>
                <button className="wi-btn wi-btn-primary" onClick={runPrediction}>↺ Rerun Prediction</button>
              </div>
            </>
          )}

          <div className="wi-btn-row" style={{marginTop:'1rem'}}>
            <button className="wi-btn wi-btn-outline" onClick={()=>goStep(3)}>← Back to Review</button>
          </div>
        </>
      )}
    </div>
  );
}
