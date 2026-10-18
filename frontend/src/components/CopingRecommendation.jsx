import React, { useState, useRef, useEffect } from 'react';
import { recommendCoping, getCopingHistory, submitCopingFeedback, deleteCopingHistoryItem } from '../api/coping';
import { downloadCSV } from '../utils/csv';
import Pagination from './Pagination';
import '../styles/CopingSocial.css';

// Values are CSS var() references, not literal colors — inline styles
// resolve var() live and repaint automatically when Settings -> Appearance
// changes the active theme, no re-render or hook needed.
const T = {
  bg: 'var(--bg-deep)', card: 'var(--panel-glass)', border: 'var(--border)',
  borderHover: 'var(--accent)', text: 'var(--text)', text2: 'var(--text-2)',
  text3: 'var(--text-3)', blue: 'var(--accent)', blueD: 'var(--accent)', blueBg: 'var(--accent-dim)',
  green: 'var(--ok)', greenBg: 'var(--ok-dim)', greenBorder: 'var(--ok-dim)',
  amber: 'var(--warn)', amberBg: 'var(--warn-dim)', amberBorder: 'var(--warn-dim)',
  red: 'var(--bad)', redBg: 'var(--bad-dim)', redBorder: 'var(--bad-dim)',
  surface: 'var(--surface)', surfaceHover: 'var(--surface-2)',
};

// Matches the REAL trained coping model's categories exactly — see
// backend/ml/coping_recommendation/features.py (TRIGGERS / STRATEGIES).
const TRIGGERS = [
  { id:'Exams', icon:'📝', desc:'Upcoming exams or grades' },
  { id:'Homework', icon:'📚', desc:'Assignment workload' },
  { id:'Family', icon:'🏠', desc:'Stress from home environment' },
  { id:'Friends', icon:'💬', desc:'Tension or issues with friends' },
  { id:'Teachers', icon:'🧑‍🏫', desc:'Pressure from educators' },
  { id:'Time pressure', icon:'⏱️', desc:'Not enough time to get things done' },
];

const STRATEGIES = [
  { id:'Deep breathing', icon:'🌬️', desc:'Controlled breathing exercises' },
  { id:'Exercise/Sports', icon:'🏃', desc:'Physical movement or sport' },
  { id:'Gaming/Entertainment', icon:'🎮', desc:'Games, shows, or other media' },
  { id:'Ignoring/Avoidance', icon:'🙈', desc:'Putting it out of mind' },
  { id:'Journaling', icon:'📓', desc:'Write down thoughts & feelings' },
  { id:'Music/Relaxation', icon:'🎵', desc:'Calming music or relaxation' },
  { id:'Sleeping', icon:'😴', desc:'Resting it off' },
  { id:'Talking to someone', icon:'🗣️', desc:'Share with someone you trust' },
];

// Controlled component — value lives in the parent's `vals` state, not
// local state read via document.getElementById(). The old DOM-lookup
// approach silently returned 0 for any field whose step wasn't currently
// mounted (React unmounts step 1/2's sliders once you're on step 3),
// which is why every numeric field was submitting as 0.
function SliderField({ id, label, hint, min, max, step, value, onChange, fmt }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:14, fontWeight:600, color:T.text2, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</label>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <input type="range" id={id} min={min} max={max} step={step} value={value}
          style={{ flex:1, accentColor:T.blue, cursor:'pointer' }}
          onChange={e => onChange(parseFloat(e.target.value))} />
        <span style={{ fontSize:16, fontWeight:700, color:T.blue, minWidth:44, textAlign:'right' }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
      {hint && <div style={{ fontSize:14, color:T.text3 }}>{hint}</div>}
    </div>
  );
}

const card = { background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'1.5rem', marginBottom:'1.25rem' };
const grid3 = { gap:14 };
const grid2 = { gap:14 };
const sectionLabel = { fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em', color:T.blue, marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${T.border}` };

function StratCard({ item, selected, onClick }) {
  return (
    <div onClick={onClick} style={{ border:`1.5px solid ${selected?T.blue:T.border}`, borderRadius:10, padding:'12px 14px', cursor:'pointer', background:selected?T.blueBg:T.surface, transition:'all .2s' }}>
      <div style={{ fontSize:'1.3rem', marginBottom:5 }}>{item.icon}</div>
      <div style={{ fontSize:15, fontWeight:600, color:selected?T.blue:T.text }}>{item.id}</div>
      <div style={{ fontSize:14, color:T.text3, marginTop:3 }}>{item.desc}</div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize:14, fontWeight:600, color:T.text2, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{label}</div>
      <div style={{ display:'flex', gap:8 }}>
        {['Yes','No'].map(opt => {
          const active = (opt==='Yes' && value==='1') || (opt==='No' && value==='0');
          const col = opt==='Yes' ? T.green : T.red;
          const bg = opt==='Yes' ? T.greenBg : T.redBg;
          return (
            <button key={opt} onClick={()=>onChange(opt==='Yes'?'1':'0')}
              style={{ padding:'6px 18px', borderRadius:20, fontSize:15, fontWeight:600, border:`1.5px solid ${active?col:T.border}`, background:active?bg:T.surface, color:active?col:T.text2, cursor:'pointer' }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavTabs({ tabs, step, setStep }) {
  return (
    <div className="mt-nav-tabs" style={{ display:'flex', border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', background:T.surface, marginBottom:'1.5rem' }}>
      {tabs.map((t,i) => {
        const active = step===i+1, done = step>i+1;
        return (
          <button key={i} className="mt-nav-tab" onClick={()=>setStep(i+1)} style={{ flex:1, display:'flex', alignItems:'center', gap:10, padding:'14px 18px', fontSize:15, fontWeight:600, color:active?'white':done?T.green:T.text3, background:active?T.blueD:done?T.greenBg:'transparent', border:'none', borderRight:i<tabs.length-1?`1px solid ${T.border}`:'none', cursor:'pointer', fontFamily:'inherit', transition:'all .2s', letterSpacing:'.04em', textTransform:'uppercase' }}>
            <span style={{ width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, background:active?'rgba(255,255,255,.2)':done?T.green:T.border, color:active||done?'white':T.text3, flexShrink:0 }}>
              {done?'✓':i+1}
            </span>
            <span className="mt-nav-tab-label">{t}</span>
          </button>
        );
      })}
    </div>
  );
}

const INITIAL_VALS = { wk: 4, bs: 4, ls: 2, gi: 4, bf: 3, hsc: 4, cs: 4, cc: 3, ph: 4 };

const EFFECTIVENESS_STYLE = {
  2: { bg: T.greenBg, col: T.green, b: T.greenBorder, label: 'Very Effective', icon: '✓' },
  1: { bg: T.amberBg, col: T.amber, b: T.amberBorder, label: 'Somewhat Effective', icon: '●' },
  0: { bg: T.redBg, col: T.red, b: T.redBorder, label: 'Not Effective', icon: '✗' },
};

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

const historyCard = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' };

function downloadCopingHistoryCSV(rows) {
  const header = ['Date', 'Trigger', 'Strategy Evaluated', 'Predicted Effectiveness', 'Low Confidence', 'Top Recommendation', 'Actual Effectiveness'];
  const csvRows = rows.map(it => [
    new Date(it.created_at).toISOString(),
    it.stress_trigger,
    it.selected_strategy,
    it.effectiveness_label,
    it.low_confidence ? 'Yes' : 'No',
    it.top_recommendation,
    it.actual_effectiveness_label || '',
  ]);
  downloadCSV(header, csvRows, 'coping-history.csv');
}

// One history row's feedback control: 3 buttons to report the real outcome
// (once tried), or the recorded comparison once it's been given.
function FeedbackControl({ item, onSubmit }) {
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState('');

  if (item.actual_effectiveness !== null && item.actual_effectiveness !== undefined) {
    const actual = EFFECTIVENESS_STYLE[item.actual_effectiveness];
    const matched = item.actual_effectiveness === item.selected_effectiveness;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}`, fontSize: 15 }}>
        <span style={{ color: T.text3 }}>What actually happened:</span>
        <span style={{ color: actual.col, fontWeight: 700 }}>{actual.icon} {actual.label}</span>
        <span style={{ color: matched ? T.green : T.red, fontSize: 14, fontWeight: 600 }}>
          {matched ? '✓ matched prediction' : '✗ prediction missed'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
      <div style={{ fontSize: 14, color: T.text3, marginBottom: 6 }}>Did this actually help? (once tried)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[0, 1, 2].map(val => {
          const s = EFFECTIVENESS_STYLE[val];
          return (
            <button key={val} disabled={sending} onClick={async () => {
              setSending(true); setLocalError('');
              try { await onSubmit(item.id, val); }
              catch (err) { setLocalError(err.message || 'Could not save feedback.'); }
              finally { setSending(false); }
            }} style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 14, fontWeight: 600, cursor: sending ? 'default' : 'pointer',
              fontFamily: 'inherit', border: `1px solid ${s.b}`, background: s.bg, color: s.col, opacity: sending ? 0.6 : 1,
            }}>
              {s.icon} {s.label}
            </button>
          );
        })}
      </div>
      {localError && <div style={{ fontSize: 14, color: T.red, marginTop: 6 }}>⚠ {localError}</div>}
    </div>
  );
}

// A reverse-chronological list of past recommendations — same "decision
// log, not a chart" reasoning as Risk Classification's History: effectiveness
// is a categorical label, so a list reads better than a trend line here too.
const HISTORY_PAGE_SIZE = 10;

function CopingHistoryView() {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  // Real page-based pagination — was hard-capped at the backend's default
  // 10 with no way at all to see or export anything older.
  const [page, setPage] = useState(1);
  const [pageTotal, setPageTotal] = useState(0);
  const [deleting, setDeleting] = useState({}); // id -> true while a request is in flight
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getCopingHistory(page, HISTORY_PAGE_SIZE)
      .then(res => { setItems(res.items); setPageTotal(res.total); })
      .catch(err => setError(err.message || 'Could not load coping history.'));
  }, [page]);

  const handleFeedback = async (recordId, actualEffectiveness) => {
    const res = await submitCopingFeedback(recordId, actualEffectiveness);
    setItems(list => list.map(it => it.id === recordId
      ? { ...it, actual_effectiveness: res.actual_effectiveness, actual_effectiveness_label: res.actual_effectiveness_label }
      : it));
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Delete this recommendation from history? This cannot be undone.')) return;
    setDeleting(d => ({ ...d, [recordId]: true }));
    try {
      await deleteCopingHistoryItem(recordId);
      setItems(list => list.filter(it => it.id !== recordId));
      setPageTotal(t => Math.max(0, t - 1));
    } catch (err) {
      setError(err.message || 'Could not delete this entry.');
      setDeleting(d => ({ ...d, [recordId]: false }));
    }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await getCopingHistory(1, 100);
      downloadCopingHistoryCSV(all.items.filter(it =>
        (!triggerFilter || it.stress_trigger === triggerFilter) &&
        (!strategyFilter || it.selected_strategy === strategyFilter)
      ));
    } catch (err) {
      setError(err.message || 'Could not export history.');
    } finally {
      setExporting(false);
    }
  };

  const filtered = (items || []).filter(it =>
    (!triggerFilter || it.stress_trigger === triggerFilter) &&
    (!strategyFilter || it.selected_strategy === strategyFilter)
  );

  // Insight strip — computed from the full (unfiltered) history.
  const total = items?.length || 0;
  const counts = (arr, key) => arr.reduce((acc, it) => ({ ...acc, [it[key]]: (acc[it[key]] || 0) + 1 }), {});
  const topOf = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];
  const triggerCounts = counts(items || [], 'stress_trigger');
  const recCounts = counts(items || [], 'top_recommendation');
  const withFeedback = (items || []).filter(it => it.actual_effectiveness !== null && it.actual_effectiveness !== undefined);
  const matchedCount = withFeedback.filter(it => it.actual_effectiveness === it.selected_effectiveness).length;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, color: T.text, margin: '0 0 6px' }}>Coping History</h2>
          <p style={{ fontSize: 16, color: T.text2, margin: 0, maxWidth: 560 }}>
            Every coping recommendation you've run, most recent first.
          </p>
        </div>
        {total > 0 && (
          <button onClick={exportAll} disabled={exporting} style={{ padding: '9px 18px', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.text2 }}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        )}
      </div>

      {error && <div style={{ background: T.redBg, color: T.red, padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.redBorder}`, fontSize: 16, marginBottom: '1rem' }}>⚠ {error}</div>}

      {!error && items === null && (
        <div style={{ ...historyCard, textAlign: 'center', color: T.text3, fontSize: 16 }}>Loading…</div>
      )}

      {!error && items !== null && items.length === 0 && (
        <div style={{ ...historyCard, textAlign: 'center', color: T.text3, fontSize: 16 }}>
          No recommendations yet — run one above to start your history.
        </div>
      )}

      {!error && total > 0 && (
        <>
          {/* Insight strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.25rem' }}>
            <div style={{ ...historyCard, margin: 0, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>On This Page ({pageTotal} total)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text, marginTop: 6 }}>{total}</div>
            </div>
            <div style={{ ...historyCard, margin: 0, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>Most Common Trigger</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 6 }}>{topOf(triggerCounts) || '—'}</div>
            </div>
            <div style={{ ...historyCard, margin: 0, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>Most Recommended</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.green, marginTop: 6 }}>{topOf(recCounts) || '—'}</div>
            </div>
            <div style={{ ...historyCard, margin: 0, padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>Prediction Match Rate</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text, marginTop: 6 }}>
                {withFeedback.length ? `${Math.round((matchedCount / withFeedback.length) * 100)}%` : '—'}
              </div>
              <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>{withFeedback.length} of {total} rated</div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <select value={triggerFilter} onChange={e => setTriggerFilter(e.target.value)} className="cs-select"
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'var(--bg-panel)', color: T.text, fontSize: 15, fontFamily: 'inherit' }}>
              <option value="">All triggers</option>
              {Object.keys(triggerCounts).sort().map(t => <option key={t} value={t}>{t} ({triggerCounts[t]})</option>)}
            </select>
            <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} className="cs-select"
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'var(--bg-panel)', color: T.text, fontSize: 15, fontFamily: 'inherit' }}>
              <option value="">All strategies</option>
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
            {(triggerFilter || strategyFilter) && (
              <button onClick={() => { setTriggerFilter(''); setStrategyFilter(''); }}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {!error && total > 0 && filtered.length === 0 && (
        <div style={{ ...historyCard, textAlign: 'center', color: T.text3, fontSize: 16 }}>No recommendations match these filters.</div>
      )}

      {!error && filtered.map((it) => {
        const eff = EFFECTIVENESS_STYLE[it.selected_effectiveness] || EFFECTIVENESS_STYLE[1];
        const strategyIcon = STRATEGIES.find(s => s.id === it.selected_strategy)?.icon || '✦';
        const recIcon = STRATEGIES.find(s => s.id === it.top_recommendation)?.icon || '🏆';
        return (
          <div key={it.id} style={{ ...historyCard, marginBottom: '0.75rem', padding: '1.1rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.text2, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '4px 12px' }}>
                  {it.stress_trigger}
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, fontSize: 15, fontWeight: 700, background: eff.bg, border: `1px solid ${eff.b}`, color: eff.col }}>
                  <span>{eff.icon}</span>{eff.label}
                </div>
                {it.low_confidence && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.amber, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 8, padding: '3px 10px' }}>
                    ⚠ Close call — low model confidence
                  </span>
                )}
              </div>
              <span style={{ fontSize: 14, color: T.text3 }}>{timeAgo(it.created_at)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: T.text2, marginBottom: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>{strategyIcon}</span>
              Evaluated: <strong style={{ color: T.text }}>{it.selected_strategy}</strong>
            </div>
            {it.top_recommendation !== it.selected_strategy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: T.text2 }}>
                <span style={{ fontSize: '1.1rem' }}>{recIcon}</span>
                Top alternative: <strong style={{ color: T.green }}>{it.top_recommendation}</strong>
              </div>
            )}
            <FeedbackControl item={it} onSubmit={handleFeedback} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={() => handleDelete(it.id)}
                disabled={!!deleting[it.id]}
                title="Delete this entry from your history"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${T.border}`, background: 'transparent', color: T.text3 }}
              >
                {deleting[it.id] ? 'Deleting…' : '🗑 Delete'}
              </button>
            </div>
          </div>
        );
      })}

      {!triggerFilter && !strategyFilter && (
        <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={pageTotal} onPageChange={setPage} theme={T} />
      )}
    </div>
  );
}

export default function CopingRecommendation({ mode = 'recommend' }) {
  // Hooks below must run unconditionally every render (Dashboard toggles
  // `mode` on the same mounted instance, not a remount) — mode branch
  // happens at the return, matching RiskClassification.jsx's pattern.
  const [step, setStep] = useState(1);
  const [trigger, setTrigger] = useState('Exams');
  const [strategy, setStrategy] = useState('Talking to someone');
  const [support, setSupport] = useState('1');
  const [talks, setTalks] = useState('1');
  const [vals, setVals] = useState(INITIAL_VALS);
  const setVal = (id, v) => setVals(prev => ({ ...prev, [id]: v }));
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  const loadingSteps = ['Encoding contextual features…','Running Random Forest…','Running XGBoost…','Running LightGBM…','Ranking all strategies…','Generating personalised output…'];

  const runRecommendation = async () => {
    setError(''); setResult(null); setLoading(true);
    let si = 0; setLoadingStep(loadingSteps[0]);
    const interval = setInterval(() => { si=(si+1)%loadingSteps.length; setLoadingStep(loadingSteps[si]); }, 750);

    const inputs = {
      week: vals.wk, stress_trigger: trigger, coping_primary_strategy: strategy,
      strategies_used: [strategy],
      belonging_score: vals.bs, loneliness_score: vals.ls,
      group_inclusion: vals.gi, has_support_person: Number(support),
      talks_to_someone: Number(talks), break_frequency: vals.bf,
      help_seeking_comfort: vals.hsc, class_support: vals.cs,
      class_competition: vals.cc, peer_helping: vals.ph,
    };

    try {
      const apiResult = await recommendCoping(inputs);
      clearInterval(interval); setLoading(false);
      setResult(apiResult);
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    } catch(err) { clearInterval(interval); setLoading(false); setError(err.message); }
  };

  const btnPrimary = { display:'inline-flex', alignItems:'center', gap:8, padding:'11px 24px', borderRadius:10, fontFamily:'inherit', fontSize:16, fontWeight:600, cursor:'pointer', border:'none', background:T.blueD, color:'white', transition:'all .2s' };
  const btnOutline = { ...btnPrimary, background:'transparent', border:`1px solid ${T.border}`, color:T.text2 };

  if (mode === 'history') return <CopingHistoryView />;

  return (
    <div className="mt-root" style={{ fontFamily:'Inter, sans-serif', maxWidth:900, margin:'0 auto', padding:'1rem' }}>
      <NavTabs tabs={['Stress Context','Social & Behavior','Recommend']} step={step} setStep={setStep} />

      {/* STEP 1 */}
      {step===1 && (
        <div className="mt-card" style={card}>
          <div style={{ fontWeight:700, fontSize:18, color:T.text, marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:10 }}>
            <span className="material-symbols-outlined" style={{ color:T.blue }}>bolt</span> Stress Context
          </div>
          <div style={sectionLabel}>Primary Stress Trigger</div>
          <div className="mt-grid-3" style={{ ...grid3, marginBottom:'1.5rem' }}>
            {TRIGGERS.map(t => <StratCard key={t.id} item={t} selected={trigger===t.id} onClick={()=>setTrigger(t.id)} />)}
          </div>
          <div style={sectionLabel}>Coping Strategy to Evaluate</div>
          <div className="mt-grid-3" style={{ ...grid3 }}>
            {STRATEGIES.map(st => <StratCard key={st.id} item={st} selected={strategy===st.id} onClick={()=>setStrategy(st.id)} />)}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.5rem' }}>
            <button style={btnPrimary} onClick={()=>setStep(2)}>Next <span className="material-symbols-outlined" style={{ fontSize:19 }}>arrow_forward</span></button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step===2 && (
        <div className="mt-card" style={card}>
          <div style={{ fontWeight:700, fontSize:18, color:T.text, marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:10 }}>
            <span className="material-symbols-outlined" style={{ color:T.blue }}>group</span> Social & Behavioral Metrics
          </div>
          <div style={sectionLabel}>Timing</div>
          <div className="mt-grid-3" style={{ ...grid3, marginBottom:'1.5rem' }}>
            <SliderField id="wk" label="Week of Term" min={1} max={12} step={1} value={vals.wk} onChange={v=>setVal('wk',v)} fmt={v=>`Week ${v}`} />
          </div>
          <div style={sectionLabel}>Social Connection</div>
          <div className="mt-grid-3" style={{ ...grid3, marginBottom:'1.5rem' }}>
            <SliderField id="bs" label="Belonging Score" hint="1–5" min={1} max={5} step={1} value={vals.bs} onChange={v=>setVal('bs',v)} fmt={v=>`${v}/5`} />
            <SliderField id="ls" label="Loneliness Score" hint="1=not lonely, 5=very lonely" min={1} max={5} step={1} value={vals.ls} onChange={v=>setVal('ls',v)} fmt={v=>`${v}/5`} />
            <SliderField id="gi" label="Group Inclusion" hint="1–5" min={1} max={5} step={1} value={vals.gi} onChange={v=>setVal('gi',v)} fmt={v=>`${v}/5`} />
          </div>
          <div style={sectionLabel}>Support Access</div>
          <div className="mt-grid-2" style={{ ...grid2, marginBottom:'1.5rem' }}>
            <Toggle label="Do you have a support person?" value={support} onChange={setSupport} />
            <Toggle label="Do you talk to someone when stressed?" value={talks} onChange={setTalks} />
          </div>
          <div style={sectionLabel}>Behavioral Patterns</div>
          <div className="mt-grid-3" style={{ ...grid3 }}>
            <SliderField id="bf" label="Break Frequency" hint="1–5" min={1} max={5} step={1} value={vals.bf} onChange={v=>setVal('bf',v)} fmt={v=>`${v}/5`} />
            <SliderField id="hsc" label="Help-Seeking Comfort" hint="1–5" min={1} max={5} step={1} value={vals.hsc} onChange={v=>setVal('hsc',v)} fmt={v=>`${v}/5`} />
            <SliderField id="cs" label="Class Support" hint="1–5" min={1} max={5} step={1} value={vals.cs} onChange={v=>setVal('cs',v)} fmt={v=>`${v}/5`} />
            <SliderField id="cc" label="Class Competition" hint="1–5" min={1} max={5} step={1} value={vals.cc} onChange={v=>setVal('cc',v)} fmt={v=>`${v}/5`} />
            <SliderField id="ph" label="Peer Helping" hint="1–5" min={1} max={5} step={1} value={vals.ph} onChange={v=>setVal('ph',v)} fmt={v=>`${v}/5`} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'1.5rem' }}>
            <button style={btnOutline} onClick={()=>setStep(1)}><span className="material-symbols-outlined" style={{ fontSize:19 }}>arrow_back</span> Back</button>
            <button style={btnPrimary} onClick={()=>setStep(3)}>Get Recommendation <span className="material-symbols-outlined" style={{ fontSize:19 }}>arrow_forward</span></button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step===3 && (
        <div>
          <div className="mt-card" style={card}>
            <div style={{ fontWeight:700, fontSize:18, color:T.text, marginBottom:'1rem' }}>📋 Profile Summary</div>
            <div className="mt-grid-2" style={grid2}>
              {[['Stress Trigger',trigger],['Strategy',strategy],['Has Support',support==='1'?'Yes':'No'],['Talks When Stressed',talks==='1'?'Yes':'No']].map(([k,v])=>(
                <div key={k} style={{ background:T.surface, borderRadius:10, padding:'10px 14px', border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text3, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{k}</div>
                  <div style={{ fontSize:17, fontWeight:600, color:T.text }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign:'center', margin:'1.5rem 0' }}>
            <button style={{ ...btnPrimary, background:`linear-gradient(135deg, ${T.blueD}, #7c3aed)`, fontSize:17, padding:'14px 36px', boxShadow:`0 0 24px rgba(77,141,240,0.12)` }} onClick={runRecommendation} disabled={loading}>
              <span className="material-symbols-outlined" style={{ fontSize:21 }}>auto_awesome</span>
              Get Coping Recommendation
            </button>
            <p style={{ fontSize:14, color:T.text3, marginTop:8 }}>AI classifier evaluates all strategies for your profile.</p>
          </div>

          {loading && (
            <div className="mt-card" style={card}>
              <div style={{ textAlign:'center', padding:'2rem' }}>
                <div style={{ width:40, height:40, border:`3px solid ${T.border}`, borderTopColor:T.blue, borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 1rem' }}></div>
                <p style={{ fontSize:16, color:T.text2 }}>Running classification pipeline…</p>
                <p style={{ fontSize:14, color:T.text3, marginTop:4 }}>{loadingStep}</p>
              </div>
            </div>
          )}

          {error && <div style={{ background:T.redBg, color:T.red, padding:'12px 16px', borderRadius:10, border:`1px solid ${T.redBorder}`, marginBottom:'1rem', fontSize:16 }}>⚠ {error}</div>}

          {result && (
            <div ref={resultRef}>
              {/* Hero */}
              <div className="mt-card" style={{ ...card, textAlign:'center' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:8 }}>{STRATEGIES.find(s=>s.id===result.top_recommendation)?.icon || result.top_rec_icon || '✦'}</div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'12px 28px', borderRadius:12, fontSize:'1.1rem', fontWeight:700, background:T.greenBg, color:T.green, border:`1px solid ${T.greenBorder}`, marginBottom:12 }}>
                  🏆 {result.top_recommendation}
                </div>
                <p style={{ fontSize:16, color:T.text2, maxWidth:500, margin:'10px auto 0', lineHeight:1.8 }}>{result.narrative}</p>
                {result.low_confidence && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginTop:12, padding:'6px 16px', borderRadius:20, background:T.amberBg, border:`1px solid ${T.amberBorder}`, color:T.amber, fontSize:15, fontWeight:600 }}>
                    ⚠ Close call — the top strategies/effectiveness scores were near each other, treat this with extra caution
                  </div>
                )}
              </div>

              {/* Effectiveness + Rankings */}
              <div className="mt-grid-2" style={{ gap:'1rem', marginBottom:'1rem' }}>
                <div className="mt-card" style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem' }}>Selected Strategy</div>
                  {(() => {
                    const eff = result.selected_effectiveness;
                    const c = eff===2?{bg:T.greenBg,col:T.green,b:T.greenBorder,label:'Very Effective',icon:'✓'}:eff===1?{bg:T.amberBg,col:T.amber,b:T.amberBorder,label:'Somewhat Effective',icon:'●'}:{bg:T.redBg,col:T.red,b:T.redBorder,label:'Not Effective',icon:'✗'};
                    return (
                      <div style={{ textAlign:'center', padding:'1rem 0 1.5rem' }}>
                        <div style={{ fontSize:13, color:T.text3, marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>Predicted Effectiveness</div>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 24px', borderRadius:12, fontSize:'1rem', fontWeight:700, background:c.bg, color:c.col, border:`1px solid ${c.b}` }}>{c.icon} {c.label}</div>
                        <div style={{ fontSize:15, color:T.text3, marginTop:8 }}>For: <span style={{ color:T.text, fontWeight:600 }}>{result.selected_strategy}</span></div>
                      </div>
                    );
                  })()}
                  <div style={{ fontWeight:600, fontSize:15, color:T.text2, marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Effectiveness Probabilities</div>
                  {[{key:'2',label:'Very Effective',col:T.green},{key:'1',label:'Somewhat Effective',col:T.amber},{key:'0',label:'Not Effective',col:T.red}].map(p=>{
                    const pct = Math.round((result.selected_probs?.[p.key]||0)*100);
                    return (
                      <div key={p.key} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, marginBottom:5 }}>
                          <span style={{ color:p.col, fontWeight:600 }}>{p.label}</span>
                          <span style={{ color:T.text3 }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, background:T.border, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:p.col, borderRadius:3, transition:'width 1s ease' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-card" style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem' }}>All Strategies Ranked</div>
                  {(result.ranked_strategies||[]).map((rs,i)=>{
                    const pct = Math.round((rs.prob_class2||0)*100);
                    const icon = STRATEGIES.find(x=>x.id===rs.strategy)?.icon || rs.icon || '✦';
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, border:`1px solid ${i===0?T.greenBorder:T.border}`, background:i===0?T.greenBg:T.surface, marginBottom:6 }}>
                        <div style={{ width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, background:i===0?T.green:T.border, color:'white', flexShrink:0 }}>{i+1}</div>
                        <span style={{ fontSize:'1rem' }}>{icon}</span>
                        <span style={{ fontSize:15, fontWeight:600, flex:1, color:i===0?T.green:T.text }}>{rs.strategy}</span>
                        <span style={{ fontSize:15, fontWeight:700, color:i===0?T.green:T.text2 }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Apply Steps */}
              <div className="mt-card" style={card}>
                <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem', display:'flex', alignItems:'center', gap:8 }}>
                  <span className="material-symbols-outlined" style={{ color:T.green, fontSize:21 }}>task_alt</span> How to Apply Your Recommended Strategy
                </div>
                <div className="mt-grid-2" style={grid2}>
                  {(result.apply_steps||[]).map(st=>(
                    <div key={st.step} style={{ display:'flex', gap:12, padding:14, background:T.surface, borderRadius:10, border:`1px solid ${T.border}` }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:T.blueD, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, flexShrink:0 }}>{st.step}</div>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:3 }}>{st.title}</div>
                        <div style={{ fontSize:15, color:T.text2, lineHeight:1.6 }}>{st.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign:'center', margin:'1rem 0' }}>
                <button style={btnOutline} onClick={()=>{setResult(null);setStep(1);}}>
                  <span className="material-symbols-outlined" style={{ fontSize:19 }}>arrow_back</span> Try a Different Stressor
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
