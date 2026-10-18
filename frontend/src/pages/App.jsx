import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import Login from './Login';
import FeaturePage from './FeaturePage';
import InfoPage from './InfoPage';
import BackgroundScene from '../components/BackgroundScene.jsx';
import { listForecastStudents } from '../api/forecast';
import { getOverviewStats } from '../api/overview';
import { getCurrentUser } from '../constants/permissions';

// Free-text -> dashboard tool routing when the search bar's text isn't a
// known student ID. Order matters: first keyword match wins.
const KEYWORD_ROUTES = [
  { tool: 'social', keywords: ['isolat', 'social', 'peer', 'lonel'] },
  { tool: 'coping', keywords: ['coping', 'stress', 'strategy'] },
  { tool: 'risk', keywords: ['forecast', 'trend', 'next week', 'predict'] },
  { tool: 'classification', keywords: ['risk', 'at-risk', 'at risk', 'classif'] },
  { tool: 'quiz', keywords: ['quiz', 'question'] },
  { tool: 'wellbeing', keywords: ['wellbeing', 'well-being', 'sleep', 'mood'] },
];

function App() {
  const [view, setView] = useState('home');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialStudentId, setInitialStudentId] = useState(null);
  const [recIndex, setRecIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(getCurrentUser());
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);

  // Built from the real cohort, not invented. The previous list named a
  // "Class 12-B", a "Physics" course and a student "#10331" — none of which
  // exist anywhere in the dataset (real IDs are S001-S300, grades 6-11).
  const recommendations = stats
    ? [
        ...stats.students_needing_attention.slice(0, 3).map(
          s => `${s.student_id} (Grade ${s.grade}) scoring ${s.score} — ${s.risk_label.toLowerCase()} risk`
        ),
        `${stats.high_risk_count} students high-risk in week ${stats.current_week}`,
        `Cohort average ${stats.avg_wellbeing_score} (${stats.avg_wellbeing_delta >= 0 ? '+' : ''}${stats.avg_wellbeing_delta} vs last week)`,
      ]
    : ['Connecting to the wellbeing service…'];

  useEffect(() => {
    // Re-sync with localStorage whenever we land back on 'home' — covers
    // logging out from inside the Dashboard (which clears localStorage but
    // has no way to update this component's state directly).
    if (view === 'home') setUser(getCurrentUser());
  }, [view]);

  // client.js fires this the moment any API call comes back 401 (expired or
  // missing token). Without it the UI stayed "logged in" against a dead
  // token and every protected call failed silently in the background.
  useEffect(() => {
    const onExpired = () => { setUser(null); setView('login'); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // Real cohort figures for the hero chips and the recommendation ticker.
  // /overview/stats is deliberately unauthenticated, so this works logged out.
  useEffect(() => {
    getOverviewStats()
      .then(data => { setStats(data); setStatsError(false); })
      .catch(() => setStatsError(true));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRecIndex(prev => (prev + 1) % recommendations.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [recommendations.length]);

  const handleAnalyze = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setView('dashboard');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Priority 1: does this look like a real student ID? Jump straight
      // to that student's forecast — the single most useful thing this
      // bar can do, since it's a real data lookup, not a guess.
      const students = await listForecastStudents();
      const match = students.find(s => s.student_id.toLowerCase() === query.toLowerCase());
      if (match) {
        setInitialStudentId(match.student_id);
        setView('dashboard-risk');
        return;
      }

      // Priority 2: keyword routing to the relevant tool.
      const lower = query.toLowerCase();
      const routed = KEYWORD_ROUTES.find(r => r.keywords.some(k => lower.includes(k)));
      setInitialStudentId(null);
      setView(routed ? `dashboard-${routed.tool}` : 'dashboard');
    } catch {
      // Student lookup failed (e.g. backend down) — still let keyword
      // routing work, or fall back to the plain dashboard.
      const lower = query.toLowerCase();
      const routed = KEYWORD_ROUTES.find(r => r.keywords.some(k => lower.includes(k)));
      setInitialStudentId(null);
      setView(routed ? `dashboard-${routed.tool}` : 'dashboard');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (view === 'dashboard') {
    return <Dashboard onBack={() => setView('home')} initialStudentId={initialStudentId} />;
  }

  if (view.startsWith('dashboard-')) {
    const tool = view.split('-')[1];
    return <Dashboard onBack={() => setView('home')} initialTool={tool} initialStudentId={initialStudentId} />;
  }

  if (view.startsWith('feature-')) {
    const featureKey = view.split('-')[1];
    // Map feature key to the tool name inside Dashboard (or null if it's just the main overview)
    const targetDashboardTool = featureKey === 'risk' ? 'risk' : featureKey === 'reports' ? 'reports' : null;
    return <FeaturePage featureKey={featureKey} onBack={() => setView('home')} onTryIt={() => targetDashboardTool ? setView(`dashboard-${targetDashboardTool}`) : setView('dashboard')} />;
  }



  if (view === 'login') {
    return <Login onLogin={(loggedInUser) => { setUser(loggedInUser); setView('dashboard'); }} onBack={() => setView('home')} />;
  }

  return (
    <>
      <BackgroundScene />

      <nav className="relative z-50 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 md:px-16">
        <div className="flex items-center">
          <span className="brand-plate"><img src="/logo.png" alt="Student Wellbeing AI Monitoring System" className="h-8 sm:h-10 w-auto" /></span>
        </div>
        <div className="hidden md:flex items-center gap-10 text-xs tracking-[0.15em] font-semibold opacity-70">
          <a onClick={() => setView('feature-risk')} className="nav-link text-[var(--text)] cursor-pointer transition-colors hover:text-[var(--accent)]">RISK ANALYSIS</a>
          <a onClick={() => setView('feature-monitoring')} className="nav-link text-[var(--text)] cursor-pointer transition-colors hover:text-[var(--accent)]">MONITORING</a>
          <a onClick={() => setView('feature-reports')} className="nav-link text-[var(--text)] cursor-pointer transition-colors hover:text-[var(--accent)]">REPORTS</a>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <button onClick={() => setView('dashboard')} className="flex items-center gap-2 pl-1.5 pr-4 sm:pr-5 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface)] transition-colors cursor-pointer text-[13px] font-semibold tracking-[0.15em] text-[var(--text)] uppercase">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-[13px] font-bold overflow-hidden shrink-0">
                {user.avatar_data_url
                  ? <img src={user.avatar_data_url} alt="" className="w-full h-full object-cover" />
                  : (user.full_name || user.email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="normal-case tracking-normal font-medium">{user.full_name?.split(' ')[0] || 'Dashboard'}</span>
            </button>
          ) : (
            <button onClick={() => setView('login')} className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface)] transition-colors cursor-pointer text-[13px] font-semibold tracking-[0.15em] text-[var(--text)] uppercase">
              <span>Login</span>
              <span className="material-symbols-outlined text-base text-[var(--text-2)]">login</span>
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Toggle menu"
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface)] transition-colors cursor-pointer text-[var(--text)]"
          >
            <span className="material-symbols-outlined text-xl">{mobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="relative z-50 md:hidden mx-5 -mt-2 mb-2 rounded-2xl border border-[var(--border)] flex flex-col overflow-hidden text-xs tracking-[0.15em] font-semibold" style={{ background: 'var(--bg-panel)' }}>
          {[
            { label: 'RISK ANALYSIS', view: 'feature-risk' },
            { label: 'MONITORING', view: 'feature-monitoring' },
            { label: 'REPORTS', view: 'feature-reports' },
          ].map((item, idx) => (
            <a
              key={item.view}
              onClick={() => { setView(item.view); setMobileMenuOpen(false); }}
              className={`text-[var(--text)] cursor-pointer transition-colors hover:text-[var(--accent)] hover:bg-[var(--surface)] px-6 py-4 ${idx !== 0 ? 'border-t border-[var(--border)]' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}

      <main className="relative z-10 flex-grow flex flex-col items-center justify-center px-5 sm:px-6">
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="font-serif text-5xl sm:text-7xl md:text-9xl tracking-tighter animate-pulse duration-[3000ms] opacity-90 select-none pb-2" style={{ background: 'linear-gradient(to bottom, var(--text) 30%, var(--accent-2) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            WELLBEING AI
          </h1>
          <p className="mt-6 text-[var(--text-3)] tracking-[0.3em] sm:tracking-[0.4em] text-[13px] sm:text-[14px] md:text-xs uppercase font-medium px-2">
            Intelligent Student Support <span className="opacity-50 mx-2">&</span> Predictive Analytics
          </p>
        </div>

        <div className={`w-full max-w-2xl p-1.5 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 shadow-2xl border transition-all duration-500 ${isAnalyzing ? 'shadow-sm' : ''}`} style={{ background: 'var(--bg-panel)', borderColor: isAnalyzing ? 'var(--accent)' : 'var(--border)' }}>
          <div className="flex-grow flex items-center px-4 py-1">
            <span className={`material-symbols-outlined mr-3 text-lg transition-colors duration-500 ${isAnalyzing ? 'text-[var(--accent)] animate-pulse' : 'text-[var(--text-3)]'}`}>auto_awesome</span>
            <input
              className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] placeholder:text-[var(--text-3)] py-2.5 text-sm font-light tracking-wide"
              placeholder="Search student ID, analyze class trends, or check wellbeing status..."
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              disabled={isAnalyzing}
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={`bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--text)] px-6 py-3 rounded-xl text-sm font-medium tracking-wide transition-all duration-300 flex items-center justify-center gap-2 shadow-sm ${isAnalyzing ? 'opacity-80 cursor-wait' : ''}`}
          >
            {isAnalyzing ? (
              <>
                Analyzing...
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              </>
            ) : (
              <>
                Analyze
                <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-10 sm:mt-14 flex flex-wrap justify-center gap-3 sm:gap-6 opacity-80 px-2">
          {/* Real figures from /overview/stats — these three chips previously
              read "1,240 Students Active" and "12 Alerts Pending", numbers that
              existed nowhere in the data. Until the fetch resolves they show a
              dash rather than a placeholder that might be mistaken for real. */}
          <div className="flex items-center gap-3 text-[13px] tracking-[0.15em] font-medium uppercase border border-[var(--border)] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full" style={{ background: 'var(--bg-panel)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${statsError ? '' : 'animate-pulse'}`} style={{ background: statsError ? 'var(--bad)' : 'var(--ok)', boxShadow: `0 0 8px ${statsError ? 'var(--bad-dim)' : 'var(--ok-dim)'}` }}></span>
            <span className="text-[var(--text-3)]">{statsError ? 'System Offline' : 'System Online'}</span>
          </div>
          <div className="flex items-center gap-3 text-[13px] tracking-[0.15em] font-medium uppercase border border-[var(--border)] px-5 py-2.5 rounded-full" style={{ background: 'var(--bg-panel)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-dim)' }}></span>
            <span className="text-[var(--text-3)]">{stats ? `${stats.total_students} Students Monitored` : '— Students Monitored'}</span>
          </div>
          <div className="flex items-center gap-3 text-[13px] tracking-[0.15em] font-medium uppercase border border-[var(--border)] px-5 py-2.5 rounded-full" style={{ background: 'var(--bg-panel)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warn)', boxShadow: '0 0 8px var(--warn-dim)' }}></span>
            <span className="text-[var(--text-3)]">{stats ? `${stats.high_risk_count} High-Risk This Week` : '— High-Risk This Week'}</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-5 py-6 sm:px-8 sm:py-8 md:px-16 flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-4 text-[13px] tracking-[0.15em] font-medium uppercase text-[var(--text-3)] text-center">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          <span>© 2026 Wellbeing AI Systems</span>
          <span className="h-1 w-1 bg-[var(--surface-2)] rounded-full hidden sm:block"></span>
          <span>Data Privacy Encrypted (AES-256)</span>
        </div>
        <div className="flex flex-wrap justify-center gap-5 sm:gap-10">
          <a onClick={() => setView('info-docs')} className="hover:text-[var(--text)] transition-colors cursor-pointer">Documentation</a>
          <a onClick={() => setView('info-privacy')} className="hover:text-[var(--text)] transition-colors cursor-pointer">Privacy Policy</a>
          <a onClick={() => setView('info-support')} className="hover:text-[var(--text)] transition-colors cursor-pointer">Support</a>
        </div>
      </footer>

      {/* AI Recommendation Chip */}
      <div className="fixed bottom-28 left-10 z-20 hidden lg:block cursor-pointer group">
        <div className="p-4 rounded-xl flex items-center gap-4 border border-[var(--border)] transition-all duration-300 group-hover:border-[var(--accent)] shadow-[0_8px_32px_rgba(16,24,40,0.08)]" style={{ background: 'var(--bg-panel)' }}>
          <div className="w-10 h-10 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-[0_2px_10px_rgba(77,141,240,0.12)]">
            <span className="material-symbols-outlined text-[var(--text)] text-[21px]">psychology</span>
          </div>
          <div className="pr-2">
            <p className="text-[13px] text-[var(--text-3)] uppercase font-semibold tracking-[0.15em] leading-none mb-1.5">AI Recommendation</p>
            <p key={recIndex} className="text-xs font-semibold text-[var(--text)] animate-fade-in">
              {recommendations[recIndex]}
            </p>
          </div>
        </div>
      </div>

      {/* Info Modal Popup */}
      {view.startsWith('info-') && (
        <InfoPage infoKey={view.split('-')[1]} onBack={() => setView('home')} />
      )}
    </>
  );
}

export default App;
