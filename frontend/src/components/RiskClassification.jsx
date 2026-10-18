import React, { useState, useEffect, useRef } from 'react';
import { classifyRisk, getRiskHistory, getAdminRiskOverview, escalateRisk, deleteRiskHistoryItem } from '../api/risk';
import { getCurrentUser } from '../constants/permissions';
import { downloadCSV } from '../utils/csv';
import Pagination from './Pagination';

// Deliberately standalone — must work fully on its own without depending on
// WellbeingIndicator having run first in the same browser. The real XGBoost
// model DOES chain through the Wellbeing (Lasso) model internally on the
// backend for one of its own features (composite_wellbeing_score) — that's
// a server-side implementation detail, not something this page requires
// the user to have already done themselves.

// Values are CSS var() references, not literal colors — inline styles
// resolve var() live and repaint automatically when Settings -> Appearance
// changes the active theme, no re-render or hook needed.
const T = {
  card: 'var(--panel-glass)', border: 'var(--border)',
  text: 'var(--text)', text2: 'var(--text-2)', text3: 'var(--text-3)',
  blue: 'var(--accent)', blueD: 'var(--accent)', blueBg: 'var(--accent-dim)',
  green: 'var(--ok)', greenBg: 'var(--ok-dim)', greenBorder: 'var(--ok-dim)',
  amber: 'var(--warn)', amberBg: 'var(--warn-dim)', amberBorder: 'var(--warn-dim)',
  red: 'var(--bad)', redBg: 'var(--bad-dim)', redBorder: 'var(--bad-dim)',
  surface: 'var(--surface)',
};

const RISK_COLOR = { LOW: T.green, MEDIUM: T.amber, HIGH: T.red };
const RISK_BG = { LOW: T.greenBg, MEDIUM: T.amberBg, HIGH: T.redBg };
const RISK_BORDER = { LOW: T.greenBorder, MEDIUM: T.amberBorder, HIGH: T.redBorder };
const RISK_ICON = { LOW: '✓', MEDIUM: '●', HIGH: '⚠' };

const INITIAL = {
  grade:10, week:4, avg_exam_score:68, study_hours:3.5, homework_completion_rate:0.7,
  attendance_rate:85, absence_count:2, stress_level:4, anxiety_level:2, sleep_hours:7,
  fatigue_level:2, motivation_level:3, confidence_level:3, peer_interaction:3,
  teacher_support:3, class_participation:3, teacher_engagement_score:3, behavior_rating:4,
  academic_stress_index:0.35, attendance_stability_index:0.95, performance_trend_index:0,
  behavioral_score:0.75,
};

// range() builds [start..end] inclusive — used for the dropdown option lists below.
const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

const FIELDS = {
  // Discrete/enumerable fields render as a dropdown instead of a slider —
  // there's no meaningful "in-between" value for a grade or a term week.
  grade:              { label:'Grade Level',          type:'select', options:range(6,12),  fmt:v=>`Grade ${v}`,  hint:'' },
  week:               { label:'Week of Term',         type:'select', options:range(1,12),  fmt:v=>`Week ${v}`,   hint:'' },

  avg_exam_score:     { label:'Avg Exam Score',       min:0,  max:100, step:1,    fmt:v=>`${v}%`,       unit:'%',   hint:'' },
  study_hours:        { label:'Study Hours/Day',      min:0,  max:10,  step:0.5,  fmt:v=>`${v} hrs`,    unit:'hrs', hint:'' },
  // Stored 0-1, but shown/typed as a whole percentage — toInput/fromInput convert both ways.
  homework_completion_rate:{ label:'HW Completion',   min:0,  max:1,   step:0.05, fmt:v=>`${Math.round(v*100)}%`, unit:'%',
    toInput:v=>Math.round(v*100), fromInput:v=>v/100, inputMin:0, inputMax:100, inputStep:5, hint:'' },
  attendance_rate:    { label:'Attendance Rate',      min:0,  max:100, step:1,    fmt:v=>`${v}%`,       unit:'%',   hint:'' },
  absence_count:      { label:'Absence Count',        min:0,  max:15,  step:1,    fmt:v=>`${v}`,        unit:'',    hint:'This term' },
  stress_level:       { label:'Stress Level',         min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     unit:'/10', hint:'1=none, 10=extreme' },
  anxiety_level:      { label:'Anxiety Level',        min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     unit:'/10', hint:'' },
  sleep_hours:        { label:'Sleep Hours',          min:2,  max:12,  step:0.5,  fmt:v=>`${v} hrs`,    unit:'hrs', hint:'' },
  fatigue_level:      { label:'Fatigue Level',        min:1,  max:10,  step:0.5,  fmt:v=>`${v}/10`,     unit:'/10', hint:'' },
  motivation_level:   { label:'Motivation Level',     min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  confidence_level:   { label:'Confidence Level',     min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  peer_interaction:   { label:'Peer Interaction',     min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  teacher_support:    { label:'Teacher Support',      min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  class_participation:{ label:'Class Participation',  min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  teacher_engagement_score:{ label:'Teacher Engagement', min:1, max:5, step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  behavior_rating:    { label:'Behavior Rating',      min:1,  max:5,   step:1,    fmt:v=>`${v}/5`,      unit:'/5',  hint:'' },
  academic_stress_index:{ label:'Academic Stress Index (ASI)', min:0, max:1, step:0.01, fmt:v=>v.toFixed(2), unit:'', hint:'' },
  attendance_stability_index:{ label:'Attendance Stability (ATI)', min:0, max:1, step:0.01, fmt:v=>v.toFixed(2), unit:'', hint:'' },
  performance_trend_index:{ label:'Performance Trend (PTI)', min:-1, max:1, step:0.01, fmt:v=>v.toFixed(2), unit:'', hint:'Negative = declining' },
  behavioral_score:   { label:'Behavioral Score (BS)', min:0, max:1,  step:0.01, fmt:v=>v.toFixed(2), unit:'', hint:'' },
};

const selectStyle = { padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-panel)', color:'var(--text)', fontSize:16, fontWeight:600, fontFamily:'inherit', cursor:'pointer' };
const numInputStyle = { width:'100%', padding:'9px 12px', fontSize:16, fontWeight:700, color:T.text, background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:8, fontFamily:'inherit' };

// No sliders — every field is either a dropdown (discrete values) or a
// plain number box (type the exact figure directly), nothing to drag.
function NumberField({ id, vals, onChange }) {
  const f = FIELDS[id];
  const labelRow = (
    <label style={{ fontSize:14, fontWeight:600, color:T.text2, textTransform:'uppercase', letterSpacing:'.06em' }}>{f.label}</label>
  );

  if (f.type === 'select') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {labelRow}
        <select value={vals[id]} onChange={e => onChange(id, parseInt(e.target.value, 10))} style={selectStyle} className="themed-select">
          {f.options.map(o => <option key={o} value={o}>{f.fmt(o)}</option>)}
        </select>
        {f.hint && <div style={{ fontSize:14, color:T.text3 }}>{f.hint}</div>}
      </div>
    );
  }

  const toInput = f.toInput || (v => v);
  const fromInput = f.fromInput || (v => v);
  const inputMin = f.inputMin ?? f.min, inputMax = f.inputMax ?? f.max, inputStep = f.inputStep ?? f.step;
  const inputVal = toInput(vals[id]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {labelRow}
      <div style={{ position:'relative' }}>
        <input type="number" min={inputMin} max={inputMax} step={inputStep} value={inputVal}
          style={f.unit ? { ...numInputStyle, paddingRight: 36 } : numInputStyle}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '' || raw === '-') return; // let them clear/retype without snapping back mid-edit
            const n = parseFloat(raw);
            if (Number.isNaN(n)) return;
            const clamped = Math.min(inputMax, Math.max(inputMin, n));
            onChange(id, fromInput(clamped));
          }} />
        {f.unit && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:T.text3, pointerEvents:'none' }}>{f.unit}</span>}
      </div>
      {f.hint && <div style={{ fontSize:14, color:T.text3 }}>{f.hint}</div>}
    </div>
  );
}

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

// Borderline: the model's top two classes are close, i.e. it's not a
// confident call. Disagreement: the two pipeline stages point opposite
// ways (decent Wellbeing score but a HIGH decision, or a poor score but
// a LOW decision) — both are real signals derived from data already
// returned, not invented.
function computeFlags(riskLabel, probabilities, wellbeingScore) {
  let borderline = false;
  if (probabilities) {
    const sorted = ['LOW', 'MEDIUM', 'HIGH'].map(c => probabilities[c] || 0).sort((a, b) => b - a);
    borderline = (sorted[0] - sorted[1]) < 0.15;
  }
  let disagreement = false;
  if (wellbeingScore != null) {
    if (riskLabel === 'HIGH' && wellbeingScore >= 60) disagreement = true;
    if (riskLabel === 'LOW' && wellbeingScore < 40) disagreement = true;
  }
  return { borderline, disagreement };
}

function downloadRiskHistoryCSV(rows, filename) {
  const header = ['Date', 'Risk Label', 'Confidence %', 'LOW %', 'MEDIUM %', 'HIGH %', 'Wellbeing Score', 'Escalated', 'Decided By', 'Narrative'];
  const csvRows = rows.map(it => {
    const p = it.probabilities;
    return [
      new Date(it.created_at).toISOString(),
      it.risk_label,
      p ? Math.round((p[it.risk_label] || 0) * 100) : '',
      p ? Math.round((p.LOW || 0) * 100) : '',
      p ? Math.round((p.MEDIUM || 0) * 100) : '',
      p ? Math.round((p.HIGH || 0) * 100) : '',
      it.composite_wellbeing_score != null ? it.composite_wellbeing_score.toFixed(1) : '',
      it.escalated ? 'Yes' : 'No',
      it.decided_by_name || '',
      it.narrative || '',
    ];
  });
  downloadCSV(header, csvRows, filename);
}

function NavTabs({ tabs, step, setStep }) {
  return (
    <div style={{ display:'flex', border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', background:T.surface, marginBottom:'1.5rem' }}>
      {tabs.map((t,i) => {
        const active = step===i+1, done = step>i+1;
        return (
          <button key={i} onClick={()=>setStep(i+1)} style={{ flex:1, display:'flex', alignItems:'center', gap:10, padding:'14px 18px', fontSize:15, fontWeight:600, color:active?'white':done?T.green:T.text3, background:active?T.blueD:done?T.greenBg:'transparent', border:'none', borderRight:i<tabs.length-1?`1px solid ${T.border}`:'none', cursor:'pointer', fontFamily:'inherit', transition:'all .2s', letterSpacing:'.04em', textTransform:'uppercase' }}>
            <span style={{ width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, background:active?'rgba(255,255,255,.2)':done?T.green:T.border, color:active||done?'white':T.text3, flexShrink:0 }}>
              {done?'✓':i+1}
            </span>
            {t}
          </button>
        );
      })}
    </div>
  );
}

const card = { background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'1.5rem', marginBottom:'1.25rem' };

// Risk History — a reverse-chronological decision log, deliberately NOT a
// sparkline like Wellbeing Indicator's history: risk_label is categorical,
// so a line chart of LOW/MEDIUM/HIGH would just be discretized stair-steps
// with no real insight. A list reads better for "what did we decide, and
// when" — which is the point of this tool (see the page intro paragraph).
const PAGE_SIZE = 10;

function RiskHistoryView() {
  const isAdmin = getCurrentUser()?.role === 'admin';

  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  // Both scopes are real page-based pagination, 10 per page: 'mine' via
  // getRiskHistory, admin's 'all' via getAdminRiskOverview.
  const [page, setPage] = useState(1);
  const [pageTotal, setPageTotal] = useState(0);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'
  const [scope, setScope] = useState('mine'); // 'mine' | 'all' — admin only
  const [escalating, setEscalating] = useState({}); // id -> true while a request is in flight
  const [deleting, setDeleting] = useState({}); // id -> true while a request is in flight
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchPage = isAdmin && scope === 'all' ? getAdminRiskOverview : getRiskHistory;
    fetchPage(page, PAGE_SIZE)
      .then(res => { setItems(res.items); setPageTotal(res.total); })
      .catch(err => setError(err.message || 'Could not load risk history.'));
  }, [page, scope, isAdmin]);

  const doEscalate = async (id) => {
    setEscalating(e => ({ ...e, [id]: true }));
    try {
      const res = await escalateRisk(id);
      setItems(list => list.map(it => it.id === id ? { ...it, escalated: true, escalated_at: res.escalated_at } : it));
    } catch (err) {
      setError(err.message || 'Could not escalate this decision.');
    } finally {
      setEscalating(e => ({ ...e, [id]: false }));
    }
  };

  const doDelete = async (id) => {
    if (!window.confirm('Delete this risk decision from history? This cannot be undone.')) return;
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      await deleteRiskHistoryItem(id);
      setItems(list => list.filter(it => it.id !== id));
      setPageTotal(t => Math.max(0, t - 1));
    } catch (err) {
      setError(err.message || 'Could not delete this decision.');
      setDeleting(d => ({ ...d, [id]: false }));
    }
  };

  const total = items?.length || 0;
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  (items || []).forEach(it => { counts[it.risk_label] = (counts[it.risk_label] || 0) + 1; });
  const highPct = total ? Math.round((counts.HIGH / total) * 100) : 0;

  const visible = items && filter !== 'ALL' ? items.filter(it => it.risk_label === filter) : items;
  const canDelete = !(isAdmin && scope === 'all'); // "your own history" — not the cross-account admin view

  return (
    <div style={{ fontFamily:'Inter, sans-serif', maxWidth:900, margin:'0 auto', padding:'1rem' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:'1.5rem' }}>
        <div>
          <h2 style={{ fontSize:23, fontWeight:700, color:T.text, margin:'0 0 6px' }}>Risk History</h2>
          <p style={{ fontSize:16, color:T.text2, margin:0, maxWidth:640 }}>
            {isAdmin && scope === 'all'
              ? 'Every risk decision made by every staff account, most recent first.'
              : "Every risk decision you've made, most recent first — a log of what was decided and when, not a score trend."}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {isAdmin && (
            <div style={{ display:'flex', border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden' }}>
              {[['mine', 'My Decisions'], ['all', 'All Staff']].map(([val, label]) => (
                <button key={val} onClick={() => { setScope(val); setPage(1); }} style={{
                  padding:'8px 14px', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:'none',
                  background: scope === val ? T.blueD : 'transparent', color: scope === val ? 'white' : T.text3,
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {items?.length > 0 && (
            <button style={btnOutline} disabled={exporting} onClick={async () => {
              // Export the FULL history, not just the current page — fetch
              // fresh with the max page size rather than exporting whatever
              // 10-item page happens to be on screen.
              if (canDelete) {
                setExporting(true);
                try {
                  const all = await getRiskHistory(1, 100);
                  downloadRiskHistoryCSV(all.items, `risk-history-${scope}.csv`);
                } catch (err) {
                  setError(err.message || 'Could not export history.');
                } finally {
                  setExporting(false);
                }
              } else {
                downloadRiskHistoryCSV(visible || items, `risk-history-${scope}.csv`);
              }
            }}>
              {exporting ? 'Exporting…' : '⬇ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background:T.redBg, color:T.red, padding:'12px 16px', borderRadius:10, border:`1px solid ${T.redBorder}`, fontSize:16 }}>⚠ {error}</div>}

      {!error && items === null && (
        <div style={{ ...card, textAlign:'center', color:T.text3, fontSize:16 }}>Loading…</div>
      )}

      {!error && total > 0 && (
        <>
          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:'1.25rem' }}>
            <div style={{ ...card, margin:0, padding:'1rem 1.1rem' }}>
              <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:T.text3 }}>
                {`On This Page (${pageTotal} total)`}
              </div>
              <div style={{ fontSize:'1.5rem', fontWeight:800, color:T.text, marginTop:6 }}>{total}</div>
            </div>
            {['LOW','MEDIUM','HIGH'].map(cls => (
              <div key={cls} style={{ ...card, margin:0, padding:'1rem 1.1rem', background:RISK_BG[cls], border:`1px solid ${RISK_BORDER[cls]}` }}>
                <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:T.text3 }}>{cls}</div>
                <div style={{ fontSize:'1.5rem', fontWeight:800, color:RISK_COLOR[cls], marginTop:6 }}>{counts[cls]}</div>
              </div>
            ))}
          </div>

          {counts.HIGH > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:10, background:'rgba(224,112,106,0.12)', border:`1px solid ${T.redBorder}`, color:T.red, fontSize:15, fontWeight:600, marginBottom:'1.25rem' }}>
              🚨 {counts.HIGH} of {total} decisions ({highPct}%) came back HIGH risk — worth a scan for repeat names.
            </div>
          )}

          {/* Filter pills */}
          <div style={{ display:'flex', gap:8, marginBottom:'1.25rem' }}>
            {['ALL','LOW','MEDIUM','HIGH'].map(f => {
              const active = filter === f;
              const col = f === 'ALL' ? T.blue : RISK_COLOR[f];
              // Reuse the existing -Bg dim tokens for the tint instead of
              // concatenating a hex alpha suffix onto `col` — col is a
              // var(--x) reference (theme-aware), and `${col}22` produces
              // the literal invalid string "var(--x)22", not a real color.
              const colBg = f === 'ALL' ? T.blueBg : RISK_BG[f];
              return (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding:'6px 16px', borderRadius:20, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  border:`1px solid ${active ? col : T.border}`, background: active ? colBg : 'transparent', color: active ? col : T.text3,
                }}>
                  {f === 'ALL' ? `All (${total})` : `${f} (${counts[f]})`}
                </button>
              );
            })}
          </div>
        </>
      )}

      {!error && items !== null && items.length === 0 && (
        <div style={{ ...card, textAlign:'center', color:T.text3, fontSize:16 }}>
          No risk decisions yet — run a classification above to start your history.
        </div>
      )}

      {!error && visible && visible.length === 0 && total > 0 && (
        <div style={{ ...card, textAlign:'center', color:T.text3, fontSize:16 }}>
          No {filter} decisions in this history yet.
        </div>
      )}

      {!error && visible && visible.map((it, i) => {
        const hasProbabilities = it.probabilities !== undefined;
        const confidence = hasProbabilities ? Math.round((it.probabilities[it.risk_label] || 0) * 100) : null;
        const { borderline, disagreement } = hasProbabilities
          ? computeFlags(it.risk_label, it.probabilities, it.composite_wellbeing_score)
          : { borderline: false, disagreement: false };
        const key = it.id || i;
        return (
          <div key={key} style={{ ...card, marginBottom:'0.75rem', padding:'1.1rem 1.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:20, fontSize:16, fontWeight:700, background:RISK_BG[it.risk_label], border:`1px solid ${RISK_BORDER[it.risk_label]}`, color:RISK_COLOR[it.risk_label] }}>
                  <span>{RISK_ICON[it.risk_label]}</span>{it.risk_label} RISK
                </div>
                {confidence !== null && (
                  <span style={{ fontSize:14, color:T.text3, fontWeight:600 }}>{confidence}% confidence</span>
                )}
                {it.decided_by_name && (
                  <span style={{ padding:'3px 10px', borderRadius:12, background:'rgba(214,154,76,0.12)', color:T.amber, fontSize:14, fontWeight:700 }}>
                    {it.decided_by_name}
                  </span>
                )}
                {it.risk_label === 'HIGH' && (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:14, background:'rgba(224,112,106,0.12)', color:T.red, fontSize:14, fontWeight:700 }}>
                    🚨 Alert
                  </span>
                )}
              </div>
              <span style={{ fontSize:14, color:T.text3 }}>{timeAgo(it.created_at)}</span>
            </div>

            {(borderline || disagreement) && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                {borderline && (
                  <span style={{ fontSize:14, fontWeight:600, color:T.amber, background:T.amberBg, border:`1px solid ${T.amberBorder}`, borderRadius:8, padding:'3px 10px' }}>
                    ⚠ Borderline — low model confidence
                  </span>
                )}
                {disagreement && (
                  <span style={{ fontSize:14, fontWeight:600, color:T.amber, background:T.amberBg, border:`1px solid ${T.amberBorder}`, borderRadius:8, padding:'3px 10px' }}>
                    ⚡ Signal conflict — Stage 1 & 2 disagree
                  </span>
                )}
              </div>
            )}

            {it.narrative && <p style={{ fontSize:15, color:T.text2, lineHeight:1.6, margin:'0 0 12px' }}>{it.narrative}</p>}

            {it.composite_wellbeing_score != null && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14, color:T.text3, marginBottom:12 }}>
                <span style={{ opacity:.8 }}>Stage 1 · Wellbeing Score:</span>
                <span style={{ color:T.blue, fontWeight:700 }}>{it.composite_wellbeing_score.toFixed(1)}/100</span>
              </div>
            )}

            {hasProbabilities && (
              <div style={{ display:'flex', gap:14, marginBottom: it.risk_label === 'HIGH' && it.id ? 12 : 0 }}>
                {['LOW','MEDIUM','HIGH'].map(cls => {
                  const pct = Math.round((it.probabilities[cls]||0)*100);
                  return (
                    <div key={cls} style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                        <span style={{ color:RISK_COLOR[cls], fontWeight:600 }}>{cls}</span>
                        <span style={{ color:T.text3 }}>{pct}%</span>
                      </div>
                      <div style={{ height:4, background:T.border, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:RISK_COLOR[cls], borderRadius:2 }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
              {/* Escalation — id only exists in the full staff shape, never in
                  a parent's reduced view. */}
              {it.risk_label === 'HIGH' && it.id ? (
                it.escalated ? (
                  <div style={{ fontSize:14, color:T.green, fontWeight:600 }}>✓ Escalated {timeAgo(it.escalated_at)}</div>
                ) : (
                  <button
                    onClick={() => doEscalate(it.id)}
                    disabled={!!escalating[it.id]}
                    style={{ padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${T.redBorder}`, background:'rgba(224,112,106,0.12)', color:T.red }}
                  >
                    {escalating[it.id] ? 'Escalating…' : '🚨 Escalate to Counselor'}
                  </button>
                )
              ) : <span />}
              {canDelete && it.id && (
                <button
                  onClick={() => doDelete(it.id)}
                  disabled={!!deleting[it.id]}
                  title="Delete this entry from your history"
                  style={{ padding:'6px 12px', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${T.border}`, background:'transparent', color:T.text3 }}
                >
                  {deleting[it.id] ? 'Deleting…' : '🗑 Delete'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <Pagination page={page} pageSize={PAGE_SIZE} total={pageTotal} onPageChange={setPage} theme={T} />
    </div>
  );
}
const grid3 = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 };
const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 };
const sectionLabel = { fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em', color:T.blue, marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${T.border}` };
const btnPrimary = { display:'inline-flex', alignItems:'center', gap:8, padding:'11px 24px', borderRadius:10, fontFamily:'inherit', fontSize:16, fontWeight:600, cursor:'pointer', border:'none', background:T.blueD, color:'white', transition:'all .2s' };
const btnOutline = { ...btnPrimary, background:'transparent', border:`1px solid ${T.border}`, color:T.text2 };

export default function RiskClassification({ mode = 'decide' }) {
  // Hooks below must run unconditionally every render (Dashboard toggles
  // `mode` on the same mounted instance, not a remount) — so the mode
  // branch happens at the return, not before these declarations.
  const [step, setStep] = useState(1);
  const [vals, setVals] = useState(INITIAL);
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [loadStep, setLoadStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [escalateState, setEscalateState] = useState('idle'); // idle | sending | done | error
  const resultRef = useRef(null);

  const change = (id, v) => setVals(prev => ({ ...prev, [id]: v }));

  const doEscalate = async () => {
    if (!result?.id) return;
    setEscalateState('sending');
    try {
      await escalateRisk(result.id);
      setEscalateState('done');
    } catch {
      setEscalateState('error');
    }
  };

  useEffect(() => {
    if (phase !== 'loading') return;
    const steps = ['Scoring wellbeing model (Stage 1)…', 'Assembling risk feature vector…', 'Running XGBoost classifier (Stage 2)…', 'Computing alert priority…'];
    let i = 0;
    // Set the first message via a 0ms timer rather than synchronously in the
    // effect body — avoids the react-hooks/set-state-in-effect cascading-
    // render warning while still showing it effectively immediately.
    const kickoff = setTimeout(() => setLoadStep(steps[0]), 0);
    const id = setInterval(() => { i=(i+1)%steps.length; setLoadStep(steps[i]); }, 750);
    return () => { clearTimeout(kickoff); clearInterval(id); };
  }, [phase]);

  const runClassification = async () => {
    setError(''); setResult(null); setPhase('loading'); setEscalateState('idle');
    try {
      const data = await classifyRisk(vals);
      setResult(data);
      setPhase('done');
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    } catch (err) {
      setError(err.message || 'Failed to reach the risk classification API.');
      setPhase('error');
    }
  };

  if (mode === 'history') return <RiskHistoryView />;

  return (
    <div style={{ fontFamily:'Inter, sans-serif', maxWidth:900, margin:'0 auto', padding:'1rem' }}>
      <div style={{ marginBottom:'1.5rem' }}>
        <h2 style={{ fontSize:23, fontWeight:700, color:T.text, margin:'0 0 6px' }}>Risk Level Classification</h2>
        <p style={{ fontSize:16, color:T.text2, margin:0, maxWidth:640 }}>
          A two-stage pipeline: your Wellbeing score is computed first (Stage 1), then an XGBoost classifier
          uses it plus 6 more risk-specific signals (Stage 2) to answer — <strong style={{color:T.text}}>how at-risk is this
          student, and should someone act?</strong>
        </p>
      </div>

      <NavTabs tabs={['Academic Profile', 'Wellbeing Signals', 'Make Decision']} step={step} setStep={setStep} />

      {step === 1 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:18, color:T.text, marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:10 }}>
            <span>📚</span> Academic Profile
          </div>
          <div style={sectionLabel}>Context</div>
          <div style={{ ...grid2, marginBottom:'1.5rem' }}>
            {['grade','week'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={sectionLabel}>Performance</div>
          <div style={{ ...grid3, marginBottom:'1.5rem' }}>
            {['avg_exam_score','study_hours','homework_completion_rate'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={sectionLabel}>Attendance</div>
          <div style={grid2}>
            {['attendance_rate','absence_count'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.5rem' }}>
            <button style={btnPrimary} onClick={()=>setStep(2)}>Next: Wellbeing Signals →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <div style={{ fontWeight:700, fontSize:18, color:T.text, marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:10 }}>
            <span>🧠</span> Wellbeing Signals
          </div>
          <div style={sectionLabel}>Stress & Rest</div>
          <div style={{ ...grid2, marginBottom:'1.5rem' }}>
            {['stress_level','anxiety_level','sleep_hours','fatigue_level'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={sectionLabel}>Engagement & Support</div>
          <div style={{ ...grid3, marginBottom:'1.5rem' }}>
            {['motivation_level','confidence_level','class_participation','peer_interaction','teacher_support','teacher_engagement_score'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={sectionLabel}>Computed Indicators (ASI / ATI / PTI / BS)</div>
          <div style={grid3}>
            {['behavior_rating','academic_stress_index','attendance_stability_index','performance_trend_index','behavioral_score'].map(id => <NumberField key={id} id={id} vals={vals} onChange={change} />)}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'1.5rem' }}>
            <button style={btnOutline} onClick={()=>setStep(1)}>← Back</button>
            <button style={btnPrimary} onClick={()=>setStep(3)}>Make Decision →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ textAlign:'center', margin:'1.5rem 0' }}>
            <button style={{ ...btnPrimary, background:`linear-gradient(135deg, ${T.blueD}, #7c3aed)`, fontSize:17, padding:'14px 36px', boxShadow:'0 0 24px rgba(77,141,240,0.12)' }} onClick={runClassification} disabled={phase==='loading'}>
              ✦ Run Risk Classification
            </button>
            <p style={{ fontSize:14, color:T.text3, marginTop:8 }}>Stage 1 (Wellbeing score) runs automatically as part of this — no separate step needed.</p>
          </div>

          {phase==='loading' && (
            <div style={card}>
              <div style={{ textAlign:'center', padding:'2rem' }}>
                <div style={{ width:40, height:40, border:`3px solid ${T.border}`, borderTopColor:T.blue, borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 1rem' }}></div>
                <p style={{ fontSize:16, color:T.text2 }}>Running classification pipeline…</p>
                <p style={{ fontSize:14, color:T.text3, marginTop:4 }}>{loadStep}</p>
              </div>
            </div>
          )}

          {phase==='error' && <div style={{ background:T.redBg, color:T.red, padding:'12px 16px', borderRadius:10, border:`1px solid ${T.redBorder}`, marginBottom:'1rem', fontSize:16 }}>⚠ {error}</div>}

          {/* Parent role gets a reduced {summary, risk_label} shape, not the
              full label/confidence/factors breakdown teacher/counselor see. */}
          {phase==='done' && result && result.summary && result.probabilities===undefined && (
            <div className="rc-card" style={{ ...card, textAlign:'center' }}>
              <div className="rc-card-title" style={{ justifyContent:'center' }}>Risk Summary</div>
              <div className={`rc-result-badge ${result.risk_label.toLowerCase()}`} style={{ margin:'0.75rem auto' }}>
                {result.risk_label === 'LOW' ? '✓' : result.risk_label === 'HIGH' ? '⚠' : '●'} {result.risk_label} RISK
              </div>
              <p style={{ fontSize:17, color:'var(--text-2)', maxWidth:600, margin:'0 auto' }}>{result.summary}</p>
            </div>
          )}

          {phase==='done' && result && result.probabilities!==undefined && (() => {
            const { borderline, disagreement } = computeFlags(result.risk_label, result.probabilities, result.composite_wellbeing_score);
            return (
            <div ref={resultRef}>
              {/* Decision-first hero: risk + alert, not a score readout */}
              <div style={{ ...card, textAlign:'center', background:RISK_BG[result.risk_label], border:`1px solid ${RISK_BORDER[result.risk_label]}` }}>
                <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:T.text3, marginBottom:10 }}>Risk Decision</div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:12, padding:'14px 32px', borderRadius:12, fontSize:'1.3rem', fontWeight:700, background:'rgba(16,24,40,0.08)', color:RISK_COLOR[result.risk_label], marginBottom:12 }}>
                  <span style={{ fontSize:'1.5rem' }}>{RISK_ICON[result.risk_label]}</span>{result.risk_label} RISK
                </div>
                <p style={{ fontSize:16, color:T.text2, maxWidth:560, margin:'0 auto', lineHeight:1.8 }}>{result.narrative}</p>

                {(borderline || disagreement) && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center', marginTop:12 }}>
                    {borderline && (
                      <span style={{ fontSize:14, fontWeight:600, color:T.amber, background:'rgba(16,24,40,0.08)', border:`1px solid ${T.amberBorder}`, borderRadius:8, padding:'4px 10px' }}>
                        ⚠ Borderline — top classes are close, low model confidence
                      </span>
                    )}
                    {disagreement && (
                      <span style={{ fontSize:14, fontWeight:600, color:T.amber, background:'rgba(16,24,40,0.08)', border:`1px solid ${T.amberBorder}`, borderRadius:8, padding:'4px 10px' }}>
                        ⚡ Signal conflict — Stage 1 Wellbeing score and Stage 2 decision point opposite ways
                      </span>
                    )}
                  </div>
                )}

                {result.risk_label === 'HIGH' && (
                  <div style={{ marginTop:14, display:'inline-flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:20, background:'rgba(224,112,106,0.12)', color:T.red, fontSize:15, fontWeight:700 }}>
                    🚨 Alert triggered — priority follow-up recommended
                  </div>
                )}

                {result.risk_label === 'HIGH' && result.id && (
                  <div style={{ marginTop:14 }}>
                    {escalateState === 'done' ? (
                      <div style={{ fontSize:15, fontWeight:700, color:T.green }}>✓ Escalated to counselor</div>
                    ) : (
                      <button
                        onClick={doEscalate}
                        disabled={escalateState === 'sending'}
                        style={{ padding:'8px 18px', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', border:'none', background:T.red, color:'white' }}
                      >
                        {escalateState === 'sending' ? 'Escalating…' : '🚨 Escalate to Counselor'}
                      </button>
                    )}
                    {escalateState === 'error' && <div style={{ fontSize:14, color:T.red, marginTop:6 }}>Couldn't escalate — try again.</div>}
                  </div>
                )}
              </div>

              {/* The recommended action — leads, per "should we act?" */}
              {result.recommendations?.[0] && (
                <div style={{ ...card, borderLeft:`3px solid ${RISK_COLOR[result.risk_label]}` }}>
                  <div style={{ fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:T.text3, marginBottom:8 }}>Recommended Action</div>
                  <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                    <span style={{ fontSize:'1.6rem' }}>{result.recommendations[0].icon}</span>
                    <div>
                      <div style={{ fontSize:17, fontWeight:700, color:T.text, marginBottom:4 }}>{result.recommendations[0].title}</div>
                      <div style={{ fontSize:16, color:T.text2, lineHeight:1.6 }}>{result.recommendations[0].text}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pipeline trace */}
              {result.composite_wellbeing_score != null && (
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'0.75rem' }}>Pipeline Trace</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
                    <div style={{ flex:'1 1 200px', textAlign:'center', padding:'0.75rem', background:T.blueBg, borderRadius:10, border:`1px solid rgba(77,141,240,0.12)` }}>
                      <div style={{ fontSize:13, color:T.text3, textTransform:'uppercase', letterSpacing:'.05em' }}>Stage 1 — Wellbeing Indicator</div>
                      <div style={{ fontSize:'1.6rem', fontWeight:700, color:T.blue, margin:'4px 0' }}>{result.composite_wellbeing_score.toFixed(1)}<span style={{fontSize:'0.9rem',opacity:.6}}>/100</span></div>
                    </div>
                    <span style={{ color:T.blue, fontSize:23 }}>→</span>
                    <div style={{ flex:'1 1 200px', textAlign:'center', padding:'0.75rem', background:RISK_BG[result.risk_label], borderRadius:10, border:`1px solid ${RISK_BORDER[result.risk_label]}` }}>
                      <div style={{ fontSize:13, color:T.text3, textTransform:'uppercase', letterSpacing:'.05em' }}>Stage 2 — Risk Classifier</div>
                      <div style={{ fontSize:'1.6rem', fontWeight:700, color:RISK_COLOR[result.risk_label], margin:'4px 0' }}>{result.risk_label}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem' }}>Class Probabilities</div>
                  {['LOW','MEDIUM','HIGH'].map(cls => {
                    const pct = Math.round((result.probabilities[cls]||0)*100);
                    return (
                      <div key={cls} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, marginBottom:5 }}>
                          <span style={{ color:RISK_COLOR[cls], fontWeight:600 }}>{cls}</span>
                          <span style={{ color:T.text3 }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, background:T.border, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:RISK_COLOR[cls], borderRadius:3, transition:'width 1s ease' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem' }}>Top Contributing Signals</div>
                  {(result.top_features||[]).map((f,i) => {
                    const pct = Math.round(f.importance*100);
                    const col = f.direction==='positive' ? T.green : T.red;
                    return (
                      <div key={i} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:4 }}>
                          <span style={{ color:T.text2 }}>{f.feature}</span>
                          <span style={{ color:col, fontWeight:700 }}>{f.direction==='positive'?'↑':'↓'} {pct}%</span>
                        </div>
                        <div style={{ height:5, background:T.border, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.min(pct*3,100)}%`, background:col, borderRadius:3 }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {result.recommendations?.length > 1 && (
                <div style={card}>
                  <div style={{ fontWeight:700, fontSize:16, color:T.text, marginBottom:'1rem' }}>Other Considerations</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {result.recommendations.slice(1).map((rec,i) => {
                      const c = rec.priority==='high' ? {bg:T.redBg,border:T.redBorder,col:T.red} : rec.priority==='medium' ? {bg:T.amberBg,border:T.amberBorder,col:T.amber} : {bg:T.blueBg,border:'rgba(77,141,240,0.12)',col:T.blue};
                      return (
                        <div key={i} style={{ padding:14, borderRadius:10, background:c.bg, border:`1px solid ${c.border}` }}>
                          <div style={{ fontWeight:700, fontSize:15, color:c.col, marginBottom:5 }}>{rec.icon} {rec.title}</div>
                          <div style={{ fontSize:15, color:T.text2, lineHeight:1.6 }}>{rec.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ textAlign:'center', margin:'1rem 0' }}>
                <button style={btnOutline} onClick={()=>{ setResult(null); setPhase('idle'); setEscalateState('idle'); }}>← Assess Another Profile</button>
              </div>
            </div>
            );
          })()}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
