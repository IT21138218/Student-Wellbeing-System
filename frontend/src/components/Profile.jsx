import React, { useRef, useState } from 'react';
import { changePassword, deleteAvatar, updateProfile, uploadAvatar } from '../api/auth';
import AppearanceSettings from './AppearanceSettings.jsx';

const ROLE_LABELS = {
  admin: 'School Admin', teacher: 'Teacher', counselor: 'Counselor',
  student: 'Student', parent: 'Parent',
};

// Which extra field applies to which role — matches the backend's
// UpdateProfileIn shape (all optional, stored regardless of role, but
// only the relevant one is shown to keep the form from feeling generic).
const ROLE_FIELD = {
  student: { key: 'grade', label: 'Grade / Class', placeholder: 'e.g. Grade 10-B' },
  teacher: { key: 'subject', label: 'Subject Taught', placeholder: 'e.g. Physics' },
  counselor: { key: 'department', label: 'Department', placeholder: 'e.g. Student Counseling' },
  admin: { key: 'department', label: 'Department', placeholder: 'e.g. Administration' },
  parent: null,
};

const MAX_AVATAR_MB = 2;
const inputClass = "w-full min-w-0 box-border bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm focus:outline-none focus:border-[var(--border)] placeholder:text-[var(--text-3)]";

function Tab({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-colors ${active ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'}`}
    >
      <span className="material-symbols-outlined text-[19px]">{icon}</span>
      {children}
    </button>
  );
}

export default function Profile({ user, onClose, onLogout, onUserUpdated }) {
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState('details'); // details | security | appearance
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const roleField = ROLE_FIELD[user.role];
  const [form, setForm] = useState({
    fullName: user.full_name || '',
    phone: user.phone || '',
    bio: user.bio || '',
    [roleField?.key || '_unused']: user[roleField?.key] || '',
  });
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState('idle');
  const [pwError, setPwError] = useState('');

  const initials = (user.full_name || user.email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const handleAvatarPick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setAvatarError(`Image must be under ${MAX_AVATAR_MB}MB.`);
      return;
    }
    setAvatarUploading(true); setAvatarError('');
    try {
      const updated = await uploadAvatar(file);
      localStorage.setItem('user', JSON.stringify(updated));
      onUserUpdated?.(updated);
    } catch (err) {
      setAvatarError(err.message.replace(/^API \d+: /, ''));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true); setAvatarError('');
    try {
      const updated = await deleteAvatar();
      localStorage.setItem('user', JSON.stringify(updated));
      onUserUpdated?.(updated);
    } catch (err) {
      setAvatarError(err.message.replace(/^API \d+: /, ''));
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!form.fullName.trim()) { setSaveError('Name cannot be empty.'); return; }
    setSaveStatus('saving'); setSaveError('');
    try {
      const updated = await updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        [roleField?.key]: roleField ? form[roleField.key].trim() : undefined,
      });
      localStorage.setItem('user', JSON.stringify(updated));
      onUserUpdated?.(updated);
      setSaveStatus('saved');
      setTimeout(onClose, 700); // brief moment to see "✓ Saved" before closing
    } catch (err) {
      setSaveError(err.message.replace(/^API \d+: /, ''));
      setSaveStatus('error');
    }
  };

  const savePassword = async () => {
    setPwError('');
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    setPwStatus('saving');
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      setPwStatus('saved');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwStatus('idle'), 1500);
    } catch (err) {
      setPwError(err.message.replace(/^API \d+: /, ''));
      setPwStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans p-4 overflow-hidden" style={{ background: 'var(--bg-panel)' }}>
      <div className="relative w-full max-w-[420px] max-h-[85vh] flex flex-col rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer">
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        {/* Header — avatar + identity, fixed (doesn't scroll) */}
        <div className="flex items-center gap-4 p-6 pb-4 shrink-0">
          <div className="relative shrink-0">
            <div
              className="w-16 h-16 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-lg font-bold shadow-sm overflow-hidden cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title="Click to change photo"
            >
              {user.avatar_data_url ? (
                <img src={user.avatar_data_url} alt="Profile" className="w-full h-full object-cover" />
              ) : avatarUploading ? (
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              ) : initials}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center cursor-pointer"
              title="Upload photo"
            >
              <span className="material-symbols-outlined text-[var(--text)] text-[16px]">photo_camera</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarPick} />
          </div>
          <div className="min-w-0">
            <div className="text-[var(--text)] font-semibold text-base truncate">{user.full_name}</div>
            <div className="text-[var(--text-3)] text-xs truncate">{user.email}</div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="inline-block text-[13px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5" style={{ color: 'var(--accent-2)', background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)' }}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              {user.avatar_data_url && (
                <button onClick={handleAvatarRemove} disabled={avatarUploading} className="text-[13px] text-[var(--text-3)] hover:text-[var(--bad)] cursor-pointer disabled:opacity-40">
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
        {avatarError && <p className="text-[var(--bad)] text-xs px-6 -mt-2 mb-2">{avatarError}</p>}

        {/* Tabs — fixed */}
        <div className="flex border-b border-t border-[var(--border)] shrink-0">
          <Tab active={tab === 'details'} onClick={() => setTab('details')} icon="person">Details</Tab>
          <Tab active={tab === 'security'} onClick={() => setTab('security')} icon="lock">Security</Tab>
          <Tab active={tab === 'appearance'} onClick={() => setTab('appearance')} icon="palette">Appearance</Tab>
        </div>

        {/* Scrollable body — vertical only, never horizontal */}
        <div className="overflow-y-auto overflow-x-hidden px-6 py-5">
          {tab === 'details' && (
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] mb-1.5 font-medium">Full Name</label>
                <input type="text" value={form.fullName} onChange={e => setField('fullName', e.target.value)} className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] mb-1.5 font-medium">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+94 77 123 4567" className={inputClass} />
                </div>
                {roleField ? (
                  <div>
                    <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] mb-1.5 font-medium">{roleField.label}</label>
                    <input type="text" value={form[roleField.key]} onChange={e => setField(roleField.key, e.target.value)} placeholder={roleField.placeholder} className={inputClass} />
                  </div>
                ) : <div />}
              </div>

              <div>
                <label className="block text-[13px] uppercase tracking-[0.15em] text-[var(--accent-2)] mb-1.5 font-medium">Bio</label>
                <textarea value={form.bio} onChange={e => setField('bio', e.target.value)} rows={3} maxLength={280} placeholder="A short note about yourself…" className={`${inputClass} resize-none`} />
                <div className="text-[13px] text-[var(--text-3)] text-right mt-0.5">{form.bio.length}/280</div>
              </div>

              <button onClick={saveProfile} disabled={saveStatus === 'saving'}
                className="px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer">
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save Profile'}
              </button>
              {saveError && <p className="text-[var(--bad)] text-xs">{saveError}</p>}

              <p className="text-[13px] text-[var(--text-3)] pt-1 border-t border-[var(--border)]">
                Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          )}

          {tab === 'security' && (
            <div className="flex flex-col gap-3">
              <p className="text-[14px] text-[var(--text-3)] -mt-1 mb-1">Choose a new password of at least 8 characters.</p>
              <input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} />
              <input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} />
              <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} />
              <button onClick={savePassword} disabled={pwStatus === 'saving' || !currentPw || !newPw}
                className="px-4 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--border)] text-[var(--text)] text-xs font-medium cursor-pointer">
                {pwStatus === 'saving' ? 'Updating…' : pwStatus === 'saved' ? '✓ Password Updated' : 'Update Password'}
              </button>
              {pwError && <p className="text-[var(--bad)] text-xs">{pwError}</p>}
            </div>
          )}

          {tab === 'appearance' && <AppearanceSettings />}
        </div>

        {/* Footer — fixed */}
        <div className="p-4 pt-3 border-t border-[var(--border)] shrink-0">
          <button onClick={onLogout}
            className="w-full py-2.5 rounded-lg text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
            style={{ background: 'var(--bad-dim)', border: '1px solid var(--bad-dim)', color: 'var(--bad)' }}>
            <span className="material-symbols-outlined text-base">logout</span>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
