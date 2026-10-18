import React, { useEffect, useState } from 'react';
import { getAlerts } from '../api/alerts';
import { escalateRisk } from '../api/risk';
import { timeAgo } from '../utils/time';
import { useThemeSettings } from '../contexts/ThemeSettingsContext';
import Pagination from './Pagination';

const PAGE_SIZE = 10;

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

const TYPE_ICON = { risk_high: 'analytics', isolation_flag: 'group', coping_low_confidence: 'self_improvement', wellbeing_high: 'health_metrics' };
const TYPE_LABEL = { risk_high: 'Risk', isolation_flag: 'Social Isolation', coping_low_confidence: 'Coping', wellbeing_high: 'Wellbeing' };

const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' };

function StatTile({ label, value, color }) {
  return (
    <div style={{ ...card, margin: 0, padding: '1.1rem 1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: T.text3 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: color || T.text, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function AlertsCenter() {
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [escalating, setEscalating] = useState({}); // id -> true while a request is in flight
  const [page, setPage] = useState(1);
  // SEVERITY_COLOR needs a real resolved hex (not var()) — it's concatenated
  // with a hex alpha suffix ("22") below for the badge background.
  const { tokens } = useThemeSettings();
  const SEVERITY_COLOR = { high: tokens.bad, medium: tokens.warn, low: tokens.accent };

  useEffect(() => {
    getAlerts()
      .then(res => { setData(res); setError(''); })
      .catch(err => setError(err.message || 'Could not load alerts.'));
  }, []);

  const handleEscalate = (id) => {
    setEscalating(s => ({ ...s, [id]: true }));
    escalateRisk(id)
      .then(() => {
        setData(d => ({
          ...d,
          alerts: d.alerts.filter(a => a.id !== id),
          open_count: Math.max(0, d.open_count - 1),
        }));
      })
      .catch(err => setError(err.message || 'Could not escalate this decision.'))
      .finally(() => setEscalating(s => ({ ...s, [id]: false })));
  };

  // The backend already caps the feed at 50, so page it here, 10 at a time.
  // Escalating removes an alert, which can leave the current page past the end.
  const alertCount = data?.alerts.length ?? 0;
  const lastPage = Math.max(1, Math.ceil(alertCount / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const pagedAlerts = data ? data.alerts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : [];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, color: T.text, margin: '0 0 6px' }}>Alerts</h2>
        <p style={{ fontSize: 16, color: T.text2, margin: 0, maxWidth: 620 }}>
          Real, cross-account signals every module already flags — unescalated HIGH-risk decisions,
          isolation-risk detections, low-confidence coping recommendations, and HIGH-risk wellbeing check-ins.
        </p>
      </div>

      {error && <div style={{ background: T.redBg, color: T.red, padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.redBorder}`, fontSize: 16, marginBottom: '1rem' }}>⚠ {error}</div>}
      {!error && !data && <div style={{ ...card, textAlign: 'center', color: T.text3, fontSize: 16 }}>Loading…</div>}

      {data && (
        <>
          {/* These tiles use the backend's own unlimited counts, not a tally
              of `data.alerts` — that list is capped (50 total / 15 per
              type), so counting it directly would under-report once any
              type has more open items than fits in the feed. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: '1.25rem' }}>
            <StatTile label="Open (needs escalation)" value={data.open_count} color={data.open_count > 0 ? T.red : T.text} />
            <StatTile label="Risk" value={data.open_count} color={T.red} />
            <StatTile label="Isolation" value={data.isolation_flagged_count} color={T.amber} />
            <StatTile label="Coping" value={data.coping_low_confidence_count} color={T.blue} />
            <StatTile label="Wellbeing" value={data.wellbeing_high_count} color={T.red} />
          </div>

          <div style={card}>
            {data.alerts.length === 0 ? (
              <p style={{ fontSize: 16, color: T.text3, textAlign: 'center', padding: '2rem 0' }}>No open alerts — nice work.</p>
            ) : (
              pagedAlerts.map((a, i) => (
                <div key={a.id + a.type} style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                  padding: '12px 0', borderBottom: i < pagedAlerts.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 23, color: SEVERITY_COLOR[a.severity], marginTop: 2 }}>{TYPE_ICON[a.type]}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{a.title}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${SEVERITY_COLOR[a.severity]}22`, color: SEVERITY_COLOR[a.severity] }}>{TYPE_LABEL[a.type]}</span>
                      </div>
                      <div style={{ fontSize: 15, color: T.text2, marginTop: 3 }}>{a.detail}</div>
                      <div style={{ fontSize: 14, color: T.text3, marginTop: 3 }}>{a.student_label} · {timeAgo(a.created_at)}</div>
                    </div>
                  </div>
                  {a.type === 'risk_high' && a.can_escalate && (
                    <button
                      onClick={() => handleEscalate(a.id)}
                      disabled={!!escalating[a.id]}
                      style={{
                        flexShrink: 0, padding: '7px 14px', borderRadius: 10, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
                        cursor: escalating[a.id] ? 'default' : 'pointer', border: `1px solid ${T.redBorder}`, background: T.redBg, color: T.red,
                        opacity: escalating[a.id] ? 0.6 : 1,
                      }}
                    >
                      {escalating[a.id] ? 'Escalating…' : '🚨 Escalate to Counselor'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <Pagination page={currentPage} pageSize={PAGE_SIZE} total={alertCount} onPageChange={setPage} theme={T} />
        </>
      )}
    </div>
  );
}
