import React from 'react';

const infoData = {
  docs: {
    title: 'Documentation',
    subtitle: 'System guides, API references, and manuals.',
    icon: 'menu_book',
    content: [
      { heading: 'Getting Started', text: 'Learn how to navigate the dashboard, configure system settings, and set up your initial student database.' },
      { heading: 'Integration API', text: 'Comprehensive guides on connecting the Wellbeing AI system with your existing school management software and databases.' },
      { heading: 'User Roles & Permissions', text: 'Detailed breakdown of access levels for administrators, educators, and specialized school counselors.' }
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'Your data security and compliance is our top priority.',
    icon: 'shield_lock',
    content: [
      { heading: 'Data Encryption', text: 'All student and institutional data is encrypted both at rest and in transit using the AES-256 standard.' },
      { heading: 'Regulatory Compliance', text: 'We are fully compliant with major data protection frameworks including GDPR, FERPA, and local educational data regulations.' },
      { heading: 'Data Retention & Anonymization', text: 'Records are securely maintained according to your institutional policy. Predictive models are trained strictly on anonymized metadata.' }
    ]
  },
  support: {
    title: 'Support Center',
    subtitle: 'Get help from our dedicated technical team.',
    icon: 'support_agent',
    content: [
      { heading: 'Direct Contact', text: 'Reach our 24/7 technical support team via email at support@wellbeingai.example.com or call our toll-free line.' },
      { heading: 'Live Chat Assistance', text: 'Real-time chat support is available for enterprise partner institutions directly from the main dashboard.' },
      { heading: 'Community & Resources', text: 'Join our community forum to share best practices, intervention strategies, and tips with other educators.' }
    ]
  }
};

export default function InfoPage({ infoKey, onBack }) {
  const data = infoData[infoKey] || infoData.docs;

  return (
    <>
      <style>{`
        @keyframes popupSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      
      {/* Modal Container */}
      <div
        className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-8 sm:right-8 z-[100] w-auto sm:w-80 rounded-2xl shadow-[0_20px_60px_rgba(16,24,40,0.08)] overflow-hidden max-h-[70vh] flex flex-col font-sans"
        style={{ animation: 'popupSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards', background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel-glass)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-dim)' }}>
              <span className="material-symbols-outlined text-lg">{data.icon}</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text)] tracking-tight leading-tight">{data.title}</h2>
            </div>
          </div>
          <button onClick={onBack} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors p-1 cursor-pointer rounded-lg" style={{ background: 'transparent' }}>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-grow custom-scrollbar" style={{ background: 'var(--bg-deep)' }}>
          {data.content.map((section, idx) => (
            <div key={idx} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="text-xs font-semibold text-[var(--text)] mb-1.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                {section.heading}
              </h3>
              <p className="text-[13px] text-[var(--text-3)] leading-relaxed pl-3.5">
                {section.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
