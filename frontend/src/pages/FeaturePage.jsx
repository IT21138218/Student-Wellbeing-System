import React from 'react';
import BackgroundScene from '../components/BackgroundScene.jsx';

const featureData = {
  risk: {
    title: 'RISK ANALYSIS',
    subtitle: 'Predictive analytics to identify students at risk',
    icon: 'warning',
    color: 'var(--bad)',
    description: 'Our Risk Analysis engine uses advanced machine learning to detect early warning signs of student struggle. By analyzing historical performance, attendance patterns, and behavioral indicators, the system can flag potential issues before they escalate, allowing educators to take proactive measures.',
    features: [
      'Early Warning System',
      'Historical Data Trends',
      'Custom Risk Thresholds'
    ]
  },
  monitoring: {
    title: 'MONITORING',
    subtitle: 'Real-time tracking of student wellbeing and progress',
    icon: 'show_chart',
    color: 'var(--accent)',
    description: 'The Monitoring module provides a comprehensive, real-time view of student wellbeing across the entire institution. Track academic, social, and emotional metrics in one unified dashboard, enabling a holistic approach to student support.',
    features: [
      'Live Wellbeing Dashboards',
      'Class & Cohort Comparisons',
      'Automated Weekly Summaries'
    ]
  },
  reports: {
    title: 'REPORTS',
    subtitle: 'Detailed insights and analytics for school leadership',
    icon: 'description',
    color: 'var(--warn)',
    description: 'Generate comprehensive reports that provide high-level insights for school leadership and administrators. Export data to standard formats and use our beautiful, pre-built templates to present findings to stakeholders.',
    features: [
      'Custom Report Builder',
      'Export to PDF & CSV',
      'Stakeholder Dashboards'
    ]
  }
};

export default function FeaturePage({ featureKey, onBack, onTryIt }) {
  const data = featureData[featureKey] || featureData.risk;

  return (
    <>
      <BackgroundScene />
      
      <nav className="relative z-50 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 md:px-16 border-b border-[var(--border)]" style={{ background: 'var(--panel-glass)' }}>
        <div className="flex items-center cursor-pointer" onClick={onBack}>
          <span className="brand-plate"><img src="/logo.png" alt="Student Wellbeing AI Monitoring System" className="h-8 sm:h-10 w-auto" /></span>
        </div>
        <button onClick={onBack} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors flex items-center gap-2 text-[13px] sm:text-xs tracking-widest uppercase font-semibold">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          <span className="hidden sm:inline">Return Home</span>
        </button>
      </nav>

      <main className="relative z-10 min-h-[calc(100vh-80px)] flex items-center justify-center py-10 sm:py-16 px-5 sm:px-6">
        <div className="max-w-5xl w-full grid md:grid-cols-2 gap-10 md:gap-16 items-center">

          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-4xl" style={{ color: data.color }}>{data.icon}</span>
              <span className="text-xs tracking-[0.3em] uppercase font-semibold text-[var(--text-3)]">Feature Overview</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif text-[var(--text)] mb-6 tracking-tight leading-tight">
              {data.title}
            </h1>
            <p className="text-xl text-[var(--text-2)] font-light leading-relaxed mb-8">
              {data.subtitle}
            </p>
            <p className="text-sm text-[var(--text-3)] leading-loose mb-10">
              {data.description}
            </p>
            
            <button onClick={onTryIt} className="bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white px-8 py-4 rounded-xl text-sm font-medium tracking-wide transition-all duration-300 flex items-center gap-3 shadow-sm hover:scale-105 active:scale-95">
              Access {data.title}
              <span className="material-symbols-outlined text-base">open_in_new</span>
            </button>
          </div>

          <div className="relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(to top right, var(--accent-dim), rgba(34,211,238,0.2))' }}></div>
            <div className="relative border border-[var(--border)] rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden" style={{ background: 'var(--panel-glass)' }}>
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <span className="material-symbols-outlined text-[120px]" style={{ color: data.color }}>{data.icon}</span>
              </div>
              
              <h3 className="text-lg font-semibold text-[var(--text)] mb-6 tracking-wider uppercase text-sm border-b border-[var(--border)] pb-4">Key Capabilities</h3>
              <ul className="space-y-6">
                {data.features.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-[var(--surface)] flex items-center justify-center flex-shrink-0 border border-[var(--border)]">
                      <span className="material-symbols-outlined text-sm" style={{ color: data.color }}>check</span>
                    </div>
                    <div>
                      <h4 className="text-[var(--text)] font-medium mb-1">{item}</h4>
                      <p className="text-[var(--text-3)] text-xs">Integrated directly into the wellbeing dashboard workflow.</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
