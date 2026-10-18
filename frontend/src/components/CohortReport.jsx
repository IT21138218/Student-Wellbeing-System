import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { getCohortReport } from '../api/report';
import { downloadCSV } from '../utils/csv';
import { timeAgo } from '../utils/time';
import { useThemeSettings } from '../contexts/ThemeSettingsContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

// DOM-only styling: plain var() references resolve natively in inline
// styles and repaint automatically when Settings -> Appearance changes the
// active theme — no hook, no re-render needed for these.
const T = {
  card: 'var(--panel-glass)', border: 'var(--border)',
  text: 'var(--text)', text2: 'var(--text-2)', text3: 'var(--text-3)',
  blue: 'var(--accent)', blueBg: 'var(--accent-dim)',
  green: 'var(--ok)', greenBg: 'var(--ok-dim)', greenBorder: 'var(--ok-dim)',
  amber: 'var(--warn)', amberBg: 'var(--warn-dim)', amberBorder: 'var(--warn-dim)',
  red: 'var(--bad)', redBg: 'var(--bad-dim)', redBorder: 'var(--bad-dim)',
};

const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' };

function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ ...card, margin: 0, padding: '1.1rem 1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || T.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 14, color: T.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function CohortReport() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null); // null = loading
  const [error, setError] = useState('');
  // Canvas 2D (Chart.js) can't resolve CSS var() — it needs the real
  // resolved color, so this component re-renders (and Chart.js redraws)
  // whenever the active theme changes.
  const { tokens } = useThemeSettings();
  const RISK_COLOR = { LOW: tokens.ok, MEDIUM: tokens.warn, HIGH: tokens.bad };

  useEffect(() => {
    // Deliberately don't clear `report` here — keeps the previous window's
    // data on screen while the new one loads instead of flashing back to a
    // loading state on every day-range toggle.
    getCohortReport(days)
      .then(data => { setReport(data); setError(''); })
      .catch(err => setError(err.message || 'Could not load the cohort report.'));
  }, [days]);

  const exportCSV = () => {
    if (!report) return;
    const header = ['Metric', 'Value'];
    const rows = [
      ['Generated At', new Date(report.generated_at).toISOString()],
      ['Window (days)', report.days],
      ['Registered Users', report.registered_users],
      ...report.registered_by_role.map(r => [`  - ${r.role}`, r.count]),
      ['Risk Assessments', report.totals.risk_assessments],
      ['Wellbeing Check-ins', report.totals.wellbeing_checkins],
      ['Coping Recommendations', report.totals.coping_recommendations],
      ['Social Detections', report.totals.social_detections],
      ['Quiz Attempts', report.totals.quiz_attempts],
      ...report.risk_distribution.map(r => [`Risk: ${r.label}`, `${r.count} (${r.pct}%)`]),
      ['Escalated (total)', report.escalated_count],
      ['Isolation-Flagged', `${report.isolation_flagged_count} of ${report.isolation_detections_total}`],
      ['Coping Feedback Given', report.coping_effectiveness.total_with_feedback],
      ['Coping Prediction Match Rate', report.coping_effectiveness.match_rate != null ? `${report.coping_effectiveness.match_rate}%` : 'N/A'],
      ['Avg Quiz Score', report.avg_quiz_score != null ? report.avg_quiz_score : 'N/A'],
      ...report.recent_escalations.map(e => [`Escalation (${e.risk_label})`, new Date(e.escalated_at).toISOString()]),
    ];
    (report.module_summaries || []).forEach(m => {
      rows.push([`--- ${m.label} ---`, `${m.total} total`]);
      m.highlights.forEach(h => rows.push([`  ${h.label}`, h.value]));
      rows.push(['  Last activity', m.last_activity ? new Date(m.last_activity).toISOString() : 'None yet']);
    });
    downloadCSV(header, rows, `cohort-report-${days}d.csv`);
  };

  const lineData = report && {
    labels: report.activity_over_time.map(p => p.date.slice(5)), // MM-DD
    datasets: [{
      label: 'Assessments run',
      data: report.activity_over_time.map(p => p.count),
      borderColor: tokens.accent, backgroundColor: tokens.accentDim, fill: true, tension: 0.35,
      pointRadius: 2, pointBackgroundColor: tokens.accent, borderWidth: 2,
    }],
  };
  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tokens.text3, font: { size: 10 }, maxRotation: 0, autoSkip: true }, grid: { color: tokens.border } },
      y: { ticks: { color: tokens.text3, font: { size: 10 }, precision: 0 }, grid: { color: tokens.border } },
    },
  };

  const riskData = report && {
    labels: report.risk_distribution.map(r => `${r.label[0]}${r.label.slice(1).toLowerCase()}`),
    datasets: [{
      data: report.risk_distribution.map(r => r.count),
      backgroundColor: report.risk_distribution.map(r => RISK_COLOR[r.label]),
      borderWidth: 0, hoverOffset: 6,
    }],
  };
  const riskOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '70%',
    plugins: { legend: { position: 'bottom', labels: { color: tokens.text2, font: { size: 11 }, boxWidth: 10 } } },
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 1000, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: 23, fontWeight: 700, color: T.text, margin: '0 0 6px' }}>Cohort Report</h2>
          <p style={{ fontSize: 16, color: T.text2, margin: 0, maxWidth: 620 }}>
            Real counts and trends aggregated across every module (Risk Classification, Wellbeing Indicator,
            Coping Strategies, Social Isolation, Adaptive Quiz) — from actual app usage, not the training-cohort replay.
          </p>
        </div>
        {report && (
          <button onClick={exportCSV} style={{ padding: '9px 18px', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.text2 }}>
            ⬇ Export CSV
          </button>
        )}
      </div>

      {error && <div style={{ background: T.redBg, color: T.red, padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.redBorder}`, fontSize: 16, marginBottom: '1rem' }}>⚠ {error}</div>}
      {!error && !report && <div style={{ ...card, textAlign: 'center', color: T.text3, fontSize: 16 }}>Loading…</div>}

      {report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1rem' }}>
            <StatTile label="Registered Users" value={report.registered_users}
              sub={report.registered_by_role.map(r => `${r.role}: ${r.count}`).join(' · ')} />
            <StatTile label="Total Assessments Run" value={
              report.totals.risk_assessments + report.totals.wellbeing_checkins + report.totals.coping_recommendations
              + report.totals.social_detections + report.totals.quiz_attempts
            } sub="across all 5 modules" />
            <StatTile label="Escalated (Risk)" value={report.escalated_count} color={report.escalated_count > 0 ? T.red : T.text} />
            <StatTile label="Isolation-Flagged" value={report.isolation_flagged_count}
              sub={`of ${report.isolation_detections_total} detections`} color={report.isolation_flagged_count > 0 ? T.amber : T.text} />
            <StatTile label="Coping Match Rate" value={report.coping_effectiveness.match_rate != null ? `${report.coping_effectiveness.match_rate}%` : '—'}
              sub={`${report.coping_effectiveness.total_with_feedback} rated`} />
            <StatTile label="Avg Quiz Score" value={report.avg_quiz_score != null ? `${report.avg_quiz_score}%` : '—'}
              sub={`${report.totals.quiz_attempts} attempts`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>Activity Over Time</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => setDays(d)} style={{
                      padding: '4px 12px', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${days === d ? T.blue : T.border}`, background: days === d ? T.blueBg : 'transparent',
                      color: days === d ? T.blue : T.text3,
                    }}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 220 }}><Line data={lineData} options={lineOptions} /></div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: '1rem' }}>Risk Distribution (Real)</div>
              {report.totals.risk_assessments === 0 ? (
                <p style={{ fontSize: 15, color: T.text3, textAlign: 'center', padding: '2rem 0' }}>No risk classifications run yet.</p>
              ) : (
                <div style={{ height: 200 }}><Doughnut data={riskData} options={riskOptions} /></div>
              )}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: '4px' }}>Module Summary</div>
            <p style={{ fontSize: 14, color: T.text3, margin: '0 0 1rem' }}>
              Every module's own breakdown, not just its run count — real data from actual app usage.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {(report.module_summaries || []).map(m => (
                <div key={m.key} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.blue }}>{m.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text, marginBottom: 2 }}>{m.total}</div>
                  <div style={{ fontSize: 13, color: T.text3, marginBottom: 10 }}>total runs</div>
                  {m.highlights.map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '3px 0' }}>
                      <span style={{ color: T.text3 }}>{h.label}</span>
                      <span style={{ color: T.text2, fontWeight: 600, textAlign: 'right' }}>{h.value}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 13, color: T.text3, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                    {m.last_activity ? `Last activity ${timeAgo(m.last_activity)}` : 'No activity yet'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: '1rem' }}>Recent Escalations</div>
            {report.recent_escalations.length === 0 ? (
              <p style={{ fontSize: 15, color: T.text3 }}>No risk decisions have been escalated yet.</p>
            ) : (
              report.recent_escalations.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: i < report.recent_escalations.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: `${RISK_COLOR[e.risk_label]}22`, color: RISK_COLOR[e.risk_label] }}>{e.risk_label}</span>
                    {e.note && <span style={{ fontSize: 15, color: T.text2 }}>{e.note}</span>}
                  </div>
                  <span style={{ fontSize: 14, color: T.text3 }}>{timeAgo(e.escalated_at)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
