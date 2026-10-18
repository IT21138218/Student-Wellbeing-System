import React, { useState } from 'react';
import { loginUser, registerUser } from '../api/auth';
import BackgroundScene from '../components/BackgroundScene.jsx';

export default function Login({ onLogin, onBack }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetFormState = () => { setPassword(''); setConfirmPassword(''); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      setLoading(true);
      try {
        const result = await loginUser({ email, password });
        localStorage.setItem('access_token', result.access_token);
        localStorage.setItem('user', JSON.stringify(result.user));
        onLogin(result.user);
      } catch (err) {
        setError(err.message.replace(/^API \d+: /, ''));
      } finally {
        setLoading(false);
      }
    } else {
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      setLoading(true);
      try {
        const result = await registerUser({ email, fullName, password, role });
        localStorage.setItem('access_token', result.access_token);
        localStorage.setItem('user', JSON.stringify(result.user));
        onLogin(result.user);
      } catch (err) {
        setError(err.message.replace(/^API \d+: /, ''));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
      {/* Background — fixed so it fills the viewport even while the modal scrolls */}
      <BackgroundScene />

      {/* Centering wrapper — min-h-full + grid keeps a tall register form fully
          reachable (the outer div scrolls) instead of clipping at top/bottom */}
      <div className="relative z-10 grid min-h-full place-items-center py-8 px-4">
      {/* Login Modal */}
      <div className="fade-in relative w-full max-w-[420px] p-8 border border-[var(--border)] rounded-2xl shadow-[0_8px_32px_rgba(16,24,40,0.08)]" style={{ background: 'var(--surface-2)' }}>
        <button
          onClick={onBack}
          className="absolute top-4 right-4 text-[var(--text-3)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        <div className="text-center mb-6 flex flex-col items-center">
          <div className="flex items-center justify-center mb-3">
            <span className="brand-plate"><img src="/logo.png" alt="Student Wellbeing AI Monitoring System" className="h-9 w-auto" /></span>
          </div>
          <h2 className="text-xl font-serif text-[var(--text)] tracking-[0.15em] uppercase mb-1">{isLogin ? 'SYSTEM LOGIN' : 'REGISTRATION'}</h2>
          <p className="text-[var(--accent-2)] opacity-60 text-[13px] uppercase tracking-[0.2em] font-medium">{isLogin ? 'Student & Admin Portal' : 'Create New Account'}</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-2.5 rounded-lg border text-xs text-center" style={{ borderColor: 'var(--bad-dim)', background: 'var(--bad-dim)', color: 'var(--bad)' }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] opacity-80 mb-2 font-medium">Email</label>
            <div className="flex items-center px-4 py-3 rounded-lg border border-[var(--border)] transition-colors bg-[var(--surface)] focus-within:border-[var(--border)]">
              <span className="material-symbols-outlined text-[var(--text-3)] mr-3 text-lg">person</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] placeholder:text-[var(--text-3)] font-light text-sm"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {!isLogin && (
            <div className="animate-fade-in">
              <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] opacity-80 mb-2 font-medium">Full Name</label>
              <div className="flex items-center px-4 py-3 rounded-lg border border-[var(--border)] transition-colors bg-[var(--surface)] focus-within:border-[var(--border)]">
                <span className="material-symbols-outlined text-[var(--text-3)] mr-3 text-lg">badge</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] placeholder:text-[var(--text-3)] font-light text-sm"
                  placeholder="Your full name"
                />
              </div>
            </div>
          )}

          {!isLogin && (
            <div className="animate-fade-in">
              <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] opacity-80 mb-2 font-medium">Role</label>
              <div className="flex items-center px-4 py-3 rounded-lg border border-[var(--border)] transition-colors bg-[var(--surface)] focus-within:border-[var(--border)]">
                <span className="material-symbols-outlined text-[var(--text-3)] mr-3 text-lg">badge</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] font-light text-sm [&>option]:bg-[var(--bg-panel)] [&>option]:text-[var(--text)]"
                >
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="teacher">Teacher</option>
                  <option value="counselor">Counselor</option>
                </select>
              </div>
              <p className="text-[13px] text-[var(--text-3)] mt-1.5">Determines which dashboard tools you can access.</p>
            </div>
          )}

          <div>
            <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] opacity-80 mb-2 font-medium">Password</label>
            <div className="flex items-center px-4 py-3 rounded-lg border border-[var(--border)] transition-colors bg-[var(--surface)] focus-within:border-[var(--border)]">
              <span className="material-symbols-outlined text-[var(--text-3)] mr-3 text-lg">lock</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] placeholder:text-[var(--text-3)] font-light text-sm tracking-widest"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {!isLogin && (
            <div className="animate-fade-in">
              <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] opacity-80 mb-2 font-medium">Confirm Password</label>
              <div className="flex items-center px-4 py-3 rounded-lg border border-[var(--border)] transition-colors bg-[var(--surface)] focus-within:border-[var(--border)]">
                <span className="material-symbols-outlined text-[var(--text-3)] mr-3 text-lg">lock</span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[var(--text)] placeholder:text-[var(--text-3)] font-light text-sm tracking-widest"
                  placeholder="••••••••••••"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-60 disabled:cursor-not-allowed text-white py-3.5 rounded-lg font-medium tracking-wide transition-all duration-300 flex items-center justify-center gap-2 mt-4 text-sm cursor-pointer shadow-[0_4px_14px_rgba(77,141,240,0.12)]"
          >
            {loading ? 'Please wait…' : (isLogin ? 'Authenticate' : 'Register')}
            {!loading && <span className="material-symbols-outlined text-base">{isLogin ? 'login' : 'person_add'}</span>}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); resetFormState(); }}
            className="text-[13px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors uppercase tracking-[0.1em] font-medium"
          >
            {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
