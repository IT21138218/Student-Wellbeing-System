import React, { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import BackgroundScene from '../components/BackgroundScene.jsx';
import WellbeingIndicator from '../components/WellbeingIndicator.jsx';
import AdaptiveQuiz from '../components/AdaptiveQuiz.jsx';
import QuestionBank from '../components/QuestionBank.jsx';
import RiskAnalysis from '../components/RiskAnalysis.jsx';
import RiskClassification from '../components/RiskClassification.jsx';
import CopingRecommendation from '../components/CopingRecommendation.jsx';
import SocialIsolation from '../components/SocialIsolation.jsx';
import Profile from '../components/Profile.jsx';
import GuardiansManager from '../components/GuardiansManager.jsx';
import CohortReport from '../components/CohortReport.jsx';
import AlertsCenter from '../components/AlertsCenter.jsx';
import { canAccessTool, getCurrentUser } from '../constants/permissions.js';
import { logout } from '../api/auth.js';
import { getOverviewStats } from '../api/overview.js';
import { getAlerts } from '../api/alerts.js';
import { syncAgo } from '../utils/time.js';
import { useThemeSettings } from '../contexts/ThemeSettingsContext.js';
import '../styles/Dashboard.css';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler);

// Sidebar dropdown group key -> the activeTool value that belongs to it.
const GROUP_TOOL = { bank: 'topic', risk: 'classification', coping: 'coping', social: 'social' };


export default function Dashboard({ onBack, initialTool = null, initialStudentId = null }) {
  // Canvas 2D (Chart.js) can't resolve CSS var() — it needs the real
  // resolved color, so this component re-renders (and Chart.js redraws)
  // whenever the active theme changes.
  const { tokens } = useThemeSettings();
  const RISK_COLORS = { LOW: tokens.ok, MEDIUM: tokens.warn, HIGH: tokens.bad };
  // Purely categorical (which grade is this bar, not how it's doing) —
  // deliberately avoids ok/warn/bad. Those mean LOW/MEDIUM/HIGH risk
  // everywhere else in the app, so reusing them here made an unremarkable
  // grade (e.g. a HIGH-risk-colored Grade 11 with a perfectly normal 69.8
  // average) read as an alarm that wasn't there.
  const CLASS_BAR_COLORS = [tokens.accent, '#4aa8bd', 'var(--violet)', 'var(--gold)', '#e879a8', '#67c9c4'];
  const [animateBars, setAnimateBars] = useState(false);
  const [activeTool, setActiveTool] = useState(initialTool); // null, wellbeing, quiz, topic
  // Accordion: only one sidebar dropdown group open at a time — previously
  // each had its own boolean and they stacked (Question Bank + Risk
  // Classification + Coping Strategies all expanded together turns the
  // sidebar into a dense, hard-to-scan wall). Opening one now closes the
  // others; a group also auto-shows as expanded while its tool is active,
  // same as before.
  const [openGroup, setOpenGroup] = useState(null); // 'bank' | 'risk' | 'coping' | 'social' | null
  const toggleGroup = (group, tool) => {
    setActiveTool(tool);
    setOpenGroup(g => (g === group ? null : group));
  };
  // Keep the accordion honest when a *plain* nav item, quick action, or
  // keyboard shortcut changes activeTool directly (bypassing toggleGroup):
  // drop a manually-opened group the moment its tool is no longer active,
  // so at most one dropdown is ever expanded.
  useEffect(() => {
    setOpenGroup(g => (g && GROUP_TOOL[g] === activeTool ? g : null));
  }, [activeTool]);
  const [bankTab, setBankTab] = useState('questions'); // 'questions' | 'review' — which sub-privilege is active
  const bankExpanded = openGroup === 'bank' || activeTool === 'topic';
  const [riskTab, setRiskTab] = useState('decide'); // 'decide' | 'history' — which sub-privilege is active
  const riskExpanded = openGroup === 'risk' || activeTool === 'classification';
  const [copingTab, setCopingTab] = useState('recommend'); // 'recommend' | 'history' — which sub-privilege is active
  const copingExpanded = openGroup === 'coping' || activeTool === 'coping';
  const [socialTab, setSocialTab] = useState('detect'); // 'detect' | 'history' — which sub-privilege is active
  const socialExpanded = openGroup === 'social' || activeTool === 'social';
  const [user, setUser] = useState(getCurrentUser());
  const [showProfile, setShowProfile] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [, setClock] = useState(0); // ticks the "Updated Ns ago" label
  const role = user?.role || null;
  const visible = tool => !role || canAccessTool(role, tool); // not logged in = show everything (backend still gates the actual call)

  useEffect(() => {
    // Add a slight delay before animating bars to match standard mounting
    const timer = setTimeout(() => setAnimateBars(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const refreshStats = () => getOverviewStats()
    .then(data => { setStats(data); setStatsError(''); setLastSync(Date.now()); })
    .catch(err => setStatsError(err.message));

  // Refetch on first mount and every time we land on Overview (e.g. coming
  // back after running an assessment elsewhere).
  useEffect(() => {
    refreshStats();
  }, [activeTool]);

  // Auto-refresh across every view (not just Overview) so the header's live
  // status pill and the Mongo-backed counts stay current system-wide.
  useEffect(() => {
    const interval = setInterval(refreshStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-render the "Updated Ns ago" label without refetching.
  useEffect(() => {
    const t = setInterval(() => setClock(c => c + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // Alerts sidebar badge: a global count, not tied to which tool is active
  // (unlike Overview's stats above) — polled every 30s so staff notice a
  // fresh HIGH-risk decision without having to open the Alerts page.
  const [alertsOpenCount, setAlertsOpenCount] = useState(0);
  useEffect(() => {
    if (!visible('alerts')) return;
    const refreshAlertsCount = () => getAlerts().then(d => setAlertsOpenCount(d.open_count)).catch(() => {});
    refreshAlertsCount();
    const interval = setInterval(refreshAlertsCount, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Quick Actions: one-key shortcuts to jump straight into a tool, shown as
  // clickable cards on Overview and also usable from anywhere in the
  // dashboard via the keyboard. Gated by the same `visible()` role check as
  // the sidebar, so a shortcut never appears (or fires) for a tool the
  // signed-in role can't actually use.
  const quickActions = useMemo(() => ([
    visible('alerts') && { key: 'a', label: 'Alerts', icon: 'notifications', go: () => setActiveTool('alerts') },
    visible('wellbeing') && { key: 'w', label: 'Wellbeing Indicator', icon: 'health_metrics', go: () => setActiveTool('wellbeing') },
    visible('quiz') && { key: 'q', label: 'Adaptive Quiz', icon: 'quiz', go: () => setActiveTool('quiz') },
    visible('topic') && { key: 'b', label: 'Question Bank', icon: 'topic', go: () => { setActiveTool('topic'); setBankTab('questions'); } },
    visible('classification') && { key: 'c', label: 'Risk Classification', icon: 'analytics', go: () => { setActiveTool('classification'); setRiskTab('decide'); } },
    visible('risk') && { key: 'f', label: 'Forecasting & Trends', icon: 'warning', go: () => setActiveTool('risk') },
    visible('coping') && { key: 'p', label: 'Coping Strategies', icon: 'self_improvement', go: () => { setActiveTool('coping'); setCopingTab('recommend'); } },
    visible('social') && { key: 's', label: 'Social Isolation', icon: 'group', go: () => { setActiveTool('social'); setSocialTab('detect'); } },
    visible('reports') && { key: 'r', label: 'Reports', icon: 'description', go: () => setActiveTool('reports') },
  ].filter(Boolean)), [role]); // eslint-disable-line react-hooks/exhaustive-deps -- setState setters are stable, only `role` actually varies what's included

  // Keyboard shortcuts: "O" always jumps to Overview; each Quick Action's
  // own letter jumps straight to it. Ignored while typing in a form field.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'o') { setActiveTool(null); return; }
      const action = quickActions.find(a => a.key === k);
      if (action) action.go();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickActions]);

  const trendData = stats && {
    labels: stats.weekly_trend.map(p => `W${p.week}`),
    datasets: [{
      label: 'Avg wellbeing score',
      data: stats.weekly_trend.map(p => p.avg_score),
      borderColor: tokens.accent,
      backgroundColor: tokens.accentDim,
      fill: true,
      tension: 0.45,
      pointBackgroundColor: tokens.accent,
      pointBorderColor: tokens.bgPanel,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2
    }]
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: tokens.text3, font: { size: 10, family: 'Inter' }, padding: 8 },
        grid: { color: tokens.border, drawBorder: false }
      },
      y: {
        ticks: { color: tokens.text3, font: { size: 10, family: 'Inter' }, padding: 8, stepSize: 5 },
        grid: { color: tokens.border, drawBorder: false }
      }
    }
  };

  const riskData = stats && {
    labels: stats.risk_distribution.map(r => `${r.label[0]}${r.label.slice(1).toLowerCase()} risk`),
    datasets: [{
      data: stats.risk_distribution.map(r => r.pct),
      backgroundColor: stats.risk_distribution.map(r => RISK_COLORS[r.label]),
      borderWidth: 0,
      hoverOffset: 6
    }]
  };

  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
      if (chart.config.type !== 'doughnut' || !stats) return;
      var width = chart.width,
          height = chart.height,
          ctx = chart.ctx;

      ctx.restore();
      var fontSize = (height / 8).toFixed(2);
      ctx.font = "400 " + fontSize + "px Inter";
      ctx.textBaseline = "middle";
      ctx.fillStyle = tokens.text;

      var text = String(stats.total_students),
          textX = Math.round((width - ctx.measureText(text).width) / 2),
          textY = height / 2 - 8;

      ctx.fillText(text, textX, textY);

      var subFontSize = (height / 20).toFixed(2);
      ctx.font = "400 " + subFontSize + "px Inter";
      ctx.fillStyle = tokens.text3;
      var subText = "students",
          subTextX = Math.round((width - ctx.measureText(subText).width) / 2),
          subTextY = height / 2 + 12;

      ctx.fillText(subText, subTextX, subTextY);
      ctx.save();
    }
  };

  const riskOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '78%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed}%`
        }
      }
    }
  };

  return (
    <div className="dashboard-layout fade-in animate-duration-500 font-sans text-[var(--text)] min-h-screen flex overflow-hidden relative">
      <BackgroundScene />

      {/* Sidebar */}
      <aside className="sidebar z-40 relative">
        <div className="sidebar-logo cursor-pointer" onClick={onBack}>
          <span className="brand-plate" style={{ width: "100%" }}><img src="/logo.png" alt="Student Wellbeing AI Monitoring System" className="w-full h-auto" /></span>
        </div>
        <nav className="sidebar-nav">
          <button onClick={() => setActiveTool(null)} title="Shortcut: O" className={`nav-item text-left w-full ${!activeTool ? 'active' : ''}`} style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined">grid_view</span>
              <span>Overview</span>
            </span>
            <span style={{ fontSize: 13, opacity: 0.35, border: '1px solid currentColor', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>O</span>
          </button>
          {visible('alerts') && (
            <button onClick={() => setActiveTool('alerts')} title="Shortcut: A" className={`nav-item cursor-pointer text-left w-full ${activeTool === 'alerts' ? 'active' : ''}`} style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined">notifications</span>
                <span>Alerts</span>
              </span>
              {alertsOpenCount > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: 'var(--bad-dim)', color: 'var(--bad)' }}>{alertsOpenCount}</span>
              )}
            </button>
          )}
          {visible('wellbeing') && (
            <button onClick={() => setActiveTool('wellbeing')} title="Shortcut: W" className={`nav-item cursor-pointer text-left w-full ${activeTool === 'wellbeing' ? 'active' : ''}`}>
              <span className="material-symbols-outlined">health_metrics</span>
              <span>Wellbeing Indicator</span>
            </button>
          )}
          {visible('quiz') && (
            <button onClick={() => setActiveTool('quiz')} title="Shortcut: Q" className={`nav-item cursor-pointer text-left w-full ${activeTool === 'quiz' ? 'active' : ''}`}>
              <span className="material-symbols-outlined">quiz</span>
              <span>Adaptive Quiz</span>
            </button>
          )}
          {visible('topic') && (
            <div className="nav-group">
              <button type="button" onClick={() => toggleGroup('bank', 'topic')} title="Shortcut: B" className={`nav-group-header cursor-pointer text-left w-full ${activeTool === 'topic' ? 'active' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined">topic</span>
                  <span>Question Bank</span>
                </span>
                <span className={`nav-chevron${bankExpanded ? ' open' : ''}`}>⌄</span>
              </button>
              {bankExpanded && (
                <div className="nav-subitems">
                  <button
                    type="button"
                    onClick={() => { setActiveTool('topic'); setBankTab('questions'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'topic' && bankTab === 'questions' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Question Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTool('topic'); setBankTab('review'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'topic' && bankTab === 'review' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Review
                  </button>
                </div>
              )}
            </div>
          )}
          {visible('classification') && (
            <div className="nav-group">
              <button type="button" onClick={() => toggleGroup('risk', 'classification')} title="Shortcut: C" className={`nav-group-header cursor-pointer text-left w-full ${activeTool === 'classification' ? 'active' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined">analytics</span>
                  <span>Risk Classification</span>
                </span>
                <span className={`nav-chevron${riskExpanded ? ' open' : ''}`}>⌄</span>
              </button>
              {riskExpanded && (
                <div className="nav-subitems">
                  <button
                    type="button"
                    onClick={() => { setActiveTool('classification'); setRiskTab('decide'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'classification' && riskTab === 'decide' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Make Decision
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTool('classification'); setRiskTab('history'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'classification' && riskTab === 'history' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Risk History
                  </button>
                </div>
              )}
            </div>
          )}
          {visible('risk') && (
            <button onClick={() => setActiveTool('risk')} title="Shortcut: F" className={`nav-item cursor-pointer text-left w-full ${activeTool === 'risk' ? 'active' : ''}`}>
              <span className="material-symbols-outlined">warning</span>
              <span>Forecasting & Trends</span>
            </button>
          )}
          {visible('coping') && (
            <div className="nav-group">
              <button type="button" onClick={() => toggleGroup('coping', 'coping')} title="Shortcut: P" className={`nav-group-header cursor-pointer text-left w-full ${activeTool === 'coping' ? 'active' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined">self_improvement</span>
                  <span>Coping Strategies</span>
                </span>
                <span className={`nav-chevron${copingExpanded ? ' open' : ''}`}>⌄</span>
              </button>
              {copingExpanded && (
                <div className="nav-subitems">
                  <button
                    type="button"
                    onClick={() => { setActiveTool('coping'); setCopingTab('recommend'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'coping' && copingTab === 'recommend' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Coping Strategies
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTool('coping'); setCopingTab('history'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'coping' && copingTab === 'history' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> History
                  </button>
                </div>
              )}
            </div>
          )}
          {visible('social') && (
            <div className="nav-group">
              <button type="button" onClick={() => toggleGroup('social', 'social')} title="Shortcut: S" className={`nav-group-header cursor-pointer text-left w-full ${activeTool === 'social' ? 'active' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined">group</span>
                  <span>Social Isolation</span>
                </span>
                <span className={`nav-chevron${socialExpanded ? ' open' : ''}`}>⌄</span>
              </button>
              {socialExpanded && (
                <div className="nav-subitems">
                  <button
                    type="button"
                    onClick={() => { setActiveTool('social'); setSocialTab('detect'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'social' && socialTab === 'detect' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> Detection
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTool('social'); setSocialTab('history'); }}
                    className={`nav-subitem cursor-pointer text-left w-full ${activeTool === 'social' && socialTab === 'history' ? 'active' : ''}`}
                  >
                    <span className="nav-subitem-dash">—</span> History
                  </button>
                </div>
              )}
            </div>
          )}
          {visible('reports') && (
            <button onClick={() => setActiveTool('reports')} title="Shortcut: R" className={`nav-item cursor-pointer text-left w-full ${activeTool === 'reports' ? 'active' : ''}`}>
              <span className="material-symbols-outlined">description</span>
              <span>Reports</span>
            </button>
          )}
          {role === 'admin' && (
            <button onClick={() => setActiveTool('guardians')} className={`nav-item cursor-pointer text-left w-full ${activeTool === 'guardians' ? 'active' : ''}`}>
              <span className="material-symbols-outlined">family_restroom</span>
              <span>Manage Guardians</span>
            </button>
          )}
          {/* Monitoring / Admin used to sit here as buttons that did nothing
              when clicked. Removed rather than left as dead controls —
              Settings now opens the Profile panel, and Reports (above) is
              now real too. */}
          <div className="nav-divider">
            <button onClick={() => setShowProfile(true)} className="nav-item cursor-pointer text-left w-full">
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </button>
            <button className="nav-item mt-4 opacity-100 hover:bg-transparent w-full text-left" style={{ color: 'var(--accent-2)' }} onClick={onBack}>
              <span className="material-symbols-outlined transform -scale-x-100">open_in_new</span>
              <span>Back to Home</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main-wrap">
        <div className="main-inner">
          {/* Top bar */}
          <div className="topbar pt-2">
            <div>
              <div className="topbar-greeting">
                {user ? `${greeting()}, ${user.full_name?.split(' ')[0] || 'there'}` : 'Welcome'}
                <span className="topbar-greeting-date"> · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="topbar-title font-sans text-2xl font-medium tracking-tight">
                {activeTool === 'alerts' ? 'Alerts' : activeTool === 'wellbeing' ? 'Wellbeing Indicator' : activeTool === 'quiz' ? 'Adaptive Quiz' : activeTool === 'topic' ? (bankTab === 'review' ? 'Question Bank · Review' : 'Question Bank') : activeTool === 'risk' ? 'Forecasting & Trends' : activeTool === 'classification' ? (riskTab === 'history' ? 'Risk Classification · History' : 'Risk Classification') : activeTool === 'coping' ? (copingTab === 'history' ? 'Coping Strategies · History' : 'Coping Strategies') : activeTool === 'social' ? (socialTab === 'history' ? 'Social Isolation · History' : 'Social Isolation Detection') : activeTool === 'guardians' ? 'Manage Guardians' : activeTool === 'reports' ? 'Cohort Report' : 'Overview Dashboard'}
              </div>
              <div className="topbar-sub font-sans mt-0 tracking-wide text-[14px]" style={{ color: 'var(--accent-2)', opacity: 0.6 }}>
                {stats ? `Real dataset · Week ${stats.current_week} of 8 · ${stats.total_students} students` : statsError ? 'Stats unavailable' : 'Loading…'}
              </div>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                onClick={refreshStats}
                title="Refresh data now"
                className="sync-pill"
              >
                <span className="sync-dot" style={{ background: statsError ? tokens.bad : tokens.ok, boxShadow: `0 0 6px ${(statsError ? tokens.badDim : tokens.okDim)}` }}></span>
                <span>{statsError ? 'Sync failed' : `Updated ${syncAgo(lastSync)}`}</span>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
              </button>
              {visible('alerts') ? (
                <button
                  type="button"
                  onClick={() => setActiveTool('alerts')}
                  title="Open Alerts"
                  className="alert-badge font-medium tracking-wide cursor-pointer"
                >
                  <span className="alert-dot shadow-sm" style={{ background: 'var(--bad)' }}></span>
                  <span style={{ color: 'var(--bad)' }}>
                    {stats ? `${stats.high_risk_count} students at HIGH risk` : '…'}
                    {alertsOpenCount > 0 && ` · ${alertsOpenCount} open alert${alertsOpenCount === 1 ? '' : 's'}`}
                  </span>
                </button>
              ) : (
                <div className="alert-badge font-medium tracking-wide">
                  <span className="alert-dot shadow-sm" style={{ background: 'var(--bad)' }}></span>
                  <span style={{ color: 'var(--bad)' }}>{stats ? `${stats.high_risk_count} students at HIGH risk` : '…'}</span>
                </div>
              )}
              {user ? (
                <div
                  className="avatar bg-[var(--accent)] border-none text-white shadow-sm cursor-pointer overflow-hidden"
                  onClick={() => setShowProfile(true)}
                  title={`${user.full_name} — ${user.role}`}
                >
                  {user.avatar_data_url
                    ? <img src={user.avatar_data_url} alt="" className="w-full h-full object-cover" />
                    : (user.full_name || user.email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              ) : (
                <button onClick={onBack} className="text-[var(--accent-2)] text-xs font-medium cursor-pointer hover:text-[var(--accent-2)]">
                  Log In
                </button>
              )}
            </div>
          </div>

          {showProfile && user && (
            <Profile
              user={user}
              onClose={() => setShowProfile(false)}
              onUserUpdated={updated => setUser(updated)}
              onLogout={() => { logout(); setUser(null); setShowProfile(false); onBack(); }}
            />
          )}

          {/* Active Tool: Wellbeing Indicator */}
          {activeTool === 'wellbeing' && (
            <WellbeingIndicator onBack={() => setActiveTool(null)} inline={true} initialStudentId={initialStudentId} />
          )}

          {/* Active Tool: Manage Guardians (admin only — the sidebar entry is
              also admin-gated, and the API itself is admin-only) */}
          {activeTool === 'guardians' && <GuardiansManager />}

          {/* Active Tool: Cohort Report (real Mongo data, counselor/admin only) */}
          {activeTool === 'reports' && (
            <div className="px-2 py-4"><CohortReport /></div>
          )}

          {/* Active Tool: Alerts (cross-account, real Mongo signals, teacher/counselor/admin only) */}
          {activeTool === 'alerts' && (
            <div className="px-2 py-4"><AlertsCenter /></div>
          )}

          {/* Active Tool: Adaptive Quiz */}
          {activeTool === 'quiz' && (
            <AdaptiveQuiz onBack={() => setActiveTool(null)} inline={true} />
          )}

          {/* Active Tool: Coping Recommendation (two sub-privileges: recommend, history) */}
          {activeTool === 'coping' && (
            <div className="px-2 py-4"><CopingRecommendation mode={copingTab} /></div>
          )}

          {/* Active Tool: Social Isolation (two sub-privileges: detect, history) */}
          {activeTool === 'social' && (
            <div className="px-2 py-4"><SocialIsolation initialStudentId={initialStudentId} mode={socialTab} /></div>
          )}

          {/* Active Tool: Question Bank (two sub-privileges: browse, review) */}
          {activeTool === 'topic' && (
            <div className="px-2 py-4"><QuestionBank mode={bankTab} /></div>
          )}

          {/* Active Tool: Risk Analysis (Forecasting) */}
          {activeTool === 'risk' && (
            <RiskAnalysis onBack={() => setActiveTool(null)} inline={true} initialStudentId={initialStudentId} />
          )}

          {/* Active Tool: Risk Classification (two sub-privileges: decide, history) */}
          {activeTool === 'classification' && (
            <div className="px-2 py-4"><RiskClassification mode={riskTab} /></div>
          )}

          {/* Overview Dashboard (default) */}
          {!activeTool && (
            <>
              {statsError && (
                <div className="card" style={{ background: 'var(--bad-dim)', border: '1px solid var(--bad-dim)', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                  <span style={{ color: 'var(--bad)', fontSize: 16 }}>⚠ Couldn't load real stats: {statsError}</span>
                </div>
              )}

              {!stats && !statsError && (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 16 }}>
                  Loading real cohort data…
                </div>
              )}

              {stats && (
                <>
                  {/* Metric cards — all real, computed from the 300-student dataset */}
                  <div className="metrics-grid">
                    <div className="card metric-card">
                      <div className="h-[2px] w-6 bg-[var(--accent)] absolute top-0 left-[26px]"></div>
                      <div className="metric-label">TOTAL STUDENTS</div>
                      <div className="metric-value">{stats.total_students}</div>
                      <div className="metric-sub text-[var(--text-3)]">300 dataset cohort + registered student accounts</div>
                    </div>
                    <div className="card metric-card">
                      <div className="h-[2px] w-6 bg-teal-400 absolute top-0 left-[26px]"></div>
                      <div className="metric-label">AVG WELLBEING SCORE</div>
                      <div className="metric-value">{stats.avg_wellbeing_score} <span className="opacity-50 text-xl font-normal">/100</span></div>
                      <div className={`metric-sub ${stats.avg_wellbeing_delta >= 0 ? 'up text-[var(--ok)]' : 'down text-[var(--bad)]'}`}>
                        {stats.avg_wellbeing_delta >= 0 ? '↑' : '↓'} {Math.abs(stats.avg_wellbeing_delta)} pts vs last week
                      </div>
                    </div>
                    <div className="card metric-card">
                      <div className="h-[2px] w-6 bg-[var(--bad)] absolute top-0 left-[26px]"></div>
                      <div className="metric-label">HIGH-RISK STUDENTS</div>
                      <div className="metric-value">{stats.high_risk_count}</div>
                      <div className="metric-sub warn text-[var(--warn)]">⚠ {stats.high_risk_new_this_week} newly HIGH this week</div>
                    </div>
                    <div className="card metric-card">
                      <div className="h-[2px] w-6 bg-[var(--ok)] absolute top-0 left-[26px]"></div>
                      <div className="metric-label">ASSESSMENTS RUN</div>
                      <div className="metric-value">{stats.assessments_run}</div>
                      <div className="metric-sub text-[var(--text-3)]">Real predictions made in this app</div>
                    </div>
                    <div className="card metric-card">
                      <div className="h-[2px] w-6 bg-[var(--violet)] absolute top-0 left-[26px]"></div>
                      <div className="metric-label">REGISTERED USERS</div>
                      <div className="metric-value">{stats.registered_users}</div>
                      <div className="metric-sub text-[var(--text-3)]">
                        {stats.registered_by_role.map(r => `${r.count} ${r.role}`).join(' · ')}
                      </div>
                    </div>
                  </div>

                  {/* Charts row */}
                  <div className="grid-2">
                    <div className="card">
                      <div className="card-title">Wellbeing trend — real 8-week cohort average</div>
                      <div style={{ position: 'relative', width: '100%', height: '190px' }}>
                        <Line data={trendData} options={trendOptions} />
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-title">Risk distribution</div>
                      <div style={{ position: 'relative', width: '100%', height: '170px' }}>
                        <Doughnut data={riskData} options={riskOptions} plugins={[centerTextPlugin]} />
                      </div>
                      <div className="legend justify-center mt-6">
                        {stats.risk_distribution.map(r => (
                          <div className="legend-item ml-4 first:ml-0" key={r.label}>
                            <span className="legend-dot" style={{ background: RISK_COLORS[r.label] }}></span>
                            {r.label[0]}{r.label.slice(1).toLowerCase()} ({r.pct}%)
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Table + Bars row */}
                  <div className="grid-3">
                    <div className="card">
                      <div className="card-title">Students needing attention</div>
                      <p style={{ fontSize: 14, color: 'var(--text-3)', marginTop: -4, marginBottom: 10 }}>Lowest wellbeing scores, real student IDs, week {stats.current_week}</p>
                      <div className="table-scroll">
                      <table className="d-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Grade</th>
                            <th>Score</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.students_needing_attention.map(s => {
                            const scoreCls = s.risk_label === 'HIGH' ? 'score-low' : s.risk_label === 'MEDIUM' ? 'score-mid' : 'score-high';
                            const tagCls = s.risk_label === 'HIGH' ? 'tag-red' : s.risk_label === 'MEDIUM' ? 'tag-amber' : 'tag-green';
                            return (
                              <tr key={s.student_id}>
                                <td><div className="student-name">{s.student_id}</div></td>
                                <td>Grade {s.grade}</td>
                                <td><span className={`score ${scoreCls}`}>{s.score}</span></td>
                                <td><span className={`tag ${tagCls}`}>{s.risk_label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-title">Avg wellbeing score by grade</div>
                      <div id="bars" className="mt-8 flex flex-col gap-[20px]">
                        {stats.avg_score_by_class.map((c, idx) => (
                          <div className="bar-row" key={c.grade}>
                            <span className="font-sans font-bold text-[15px] text-[var(--text)] w-14 flex-shrink-0 tracking-widest">Grade {c.grade}</span>
                            <div className="bar-track bg-[var(--surface)] h-2 rounded-full flex-1 overflow-hidden ml-4">
                              <div className="bar-fill h-full rounded-full transition-all duration-[1200ms] shadow-sm shadow-blue-500/20" style={{ background: CLASS_BAR_COLORS[idx % CLASS_BAR_COLORS.length], width: animateBars ? `${c.avg_score}%` : '0%' }}></div>
                            </div>
                            <span className="font-sans text-[15px] text-[var(--text-3)] w-8 text-right ml-4">{c.avg_score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {quickActions.length > 0 && (
                <div className="card quick-actions-card">
                  <div className="card-title">Quick Actions</div>
                  <div className="quick-actions-row">
                    {quickActions.map(a => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={a.go}
                        title={`Shortcut: ${a.key.toUpperCase()}`}
                        className="quick-action-btn"
                      >
                        <span className="material-symbols-outlined">{a.icon}</span>
                        <span>{a.label}</span>
                        <span className="quick-action-key">{a.key.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}