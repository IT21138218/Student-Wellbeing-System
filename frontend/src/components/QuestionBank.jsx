import React, { useEffect, useMemo, useState, useCallback } from 'react';
import '../styles/AdaptiveQuiz.css';
import '../styles/QuestionBank.css';
import { getQuestionBank, getStudentMarks, saveQuestionNote } from '../api/quiz';
import { listRegisteredStudents } from '../api/students';
import { getCurrentUser } from '../constants/permissions';
import { cssVar } from '../utils/color';
import Pagination from './Pagination';

const PAGE_SIZE = 10;
const PAGINATION_THEME = { blue: 'var(--accent)', blueBg: 'var(--accent-dim)', border: 'var(--border)', text3: 'var(--text-3)' };

// Still used by Admin Review's card (its own mockup keeps color-coded
// difficulty chips) — the plain Question Bank list below uses neutral pills.
const DIFF_CHIP = {
  VERY_EASY: 'aq-chip-ve', EASY: 'aq-chip-e', MEDIUM: 'aq-chip-m',
  MEDIUM_HARD: 'aq-chip-mh', HARD: 'aq-chip-h',
};

const DIFFICULTIES = ['VERY_EASY', 'EASY', 'MEDIUM', 'MEDIUM_HARD', 'HARD'];
const BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate/Create'];

// Real resolved hex, not var() — line 343 concatenates a hex alpha suffix
// (`${...}22`) onto this, which only works with an actual color value.
function scoreColorOf(pct) {
  return pct >= 80 ? cssVar('--ok') : pct >= 60 ? cssVar('--warn') : cssVar('--bad');
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
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

// Debounce note saves per-question so every keystroke doesn't fire a request.
function useDebouncedNoteSaver(delay = 700) {
  const timers = React.useRef({});
  return useCallback((key, attemptId, questionIndex, note, onSaved) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      try { await saveQuestionNote(attemptId, questionIndex, note); onSaved?.('saved'); }
      catch { onSaved?.('error'); }
    }, delay);
  }, [delay]);
}

export default function QuestionBank({ mode = 'questions' }) {
  const isReview = mode === 'review';
  const isAdmin = getCurrentUser()?.role === 'admin';
  const isAdminReview = isReview && isAdmin; // the "Admin Review" monitoring dashboard

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [bloom, setBloom] = useState('');
  const [correct, setCorrect] = useState(''); // '', 'true', 'false'
  const [studentId, setStudentId] = useState(''); // admin-only: '' = every student

  const [reviewFocus, setReviewFocus] = useState('incorrect'); // student review: 'all' | 'incorrect' | 'unattempted'
  const [reviewIndex, setReviewIndex] = useState(0);
  const [bankPage, setBankPage] = useState(1);   // Question Bank list, 10 per page
  const [arPage, setArPage] = useState(1);       // Admin Review grid, 10 per page
  const [arFocus, setArFocus] = useState('needs-review'); // admin review: 'needs-review' | 'flagged'
  const [arSearch, setArSearch] = useState('');
  const [marksExpanded, setMarksExpanded] = useState(false);

  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState([]);

  const [notes, setNotes] = useState({});       // key -> current textarea value
  const [noteStatus, setNoteStatus] = useState({}); // key -> 'saving'|'saved'|'error'
  const debounceSave = useDebouncedNoteSaver();

  const keyOf = (it) => `${it.attempt_id}:${it.question_index}`;

  // `override` lets a caller (clearFilters, below) force a value that
  // hasn't landed in state yet — setQ('') etc are async, so a `load()`
  // called right after them would otherwise still close over the OLD `q`
  // and silently re-fetch with the stale filter still applied.
  const load = useCallback(async (override = {}) => {
    const eff = { q, grade, difficulty, bloom, correct, studentId, ...override };
    setLoading(true); setError('');
    try {
      const result = await getQuestionBank({
        q: eff.q.trim() || undefined,
        grade: eff.grade || undefined,
        difficulty: eff.difficulty || undefined,
        bloom_level: eff.bloom || undefined,
        correct: eff.correct || undefined,
        student_id: isAdmin && !isAdminReview ? (eff.studentId || undefined) : undefined,
      });
      setItems(result);
      const initNotes = {};
      result.forEach((it) => { initNotes[keyOf(it)] = it.note || ''; });
      setNotes(initNotes);
    } catch (err) {
      setError(err.message || 'Could not load the question bank.');
    } finally {
      setLoading(false);
    }
  }, [q, grade, difficulty, bloom, correct, studentId, isAdmin, isAdminReview]);

  // Every filter auto-applies — simplest mental model, no separate Apply button.
  useEffect(() => { load(); }, [grade, difficulty, bloom, correct, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The student Review flashcard has no filter UI of its own (just the
  // Incorrect/Unattempted/All toggle) — but this is the same component
  // instance as Question Bank, so a grade/difficulty/etc filter left over
  // from browsing there would otherwise keep silently narrowing the review
  // queue with no visible indicator on this screen. Reset on entry so
  // Review always starts from the complete bank.
  useEffect(() => {
    if (!isReview || isAdminReview) return;
    setQ(''); setGrade(''); setDifficulty(''); setBloom(''); setCorrect(''); setStudentId('');
    load({ q: '', grade: '', difficulty: '', bloom: '', correct: '', studentId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately fires only on mode transitions, not on every load()/isAdminReview identity change
  }, [isReview, isAdminReview]);

  // Admin-only: the roster for the student filter, and the marks overview table.
  useEffect(() => {
    if (!isAdmin) return;
    listRegisteredStudents().then(setStudents).catch(() => {});
    getStudentMarks().then(setMarks).catch(() => {});
  }, [isAdmin]);

  const grades = useMemo(() => [...new Set(items.map((i) => i.grade).filter(Boolean))].sort(), [items]);

  const answered = items.filter((i) => i.is_correct !== null);
  const correctCount = answered.filter((i) => i.is_correct).length;
  const pct = answered.length ? Math.round((correctCount / answered.length) * 100) : 0;

  // Student review mode: a focused, one-at-a-time queue — defaults to what
  // needs revisiting (wrong answers) rather than dumping the whole bank.
  const reviewQueue = useMemo(() => {
    if (reviewFocus === 'incorrect') return items.filter((i) => i.is_correct === false);
    if (reviewFocus === 'unattempted') return items.filter((i) => i.is_correct === null);
    return items;
  }, [items, reviewFocus]);
  useEffect(() => { setReviewIndex(0); }, [reviewFocus, items]);
  const current = reviewQueue[reviewIndex];

  // Admin review: "flagged" = a student missing >=2 questions at the same
  // difficulty+Bloom's level — a real repeated-struggle signal computed from
  // what's already loaded, not a fabricated stat.
  const missCounts = useMemo(() => {
    const counts = {};
    items.forEach((it) => {
      if (it.is_correct === false) {
        const k = `${it.student_id}:${it.difficulty}:${it.bloom_level}`;
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [items]);
  const isFlagged = (it) => it.is_correct === false && missCounts[`${it.student_id}:${it.difficulty}:${it.bloom_level}`] >= 2;

  const arQueue = useMemo(() => {
    const needle = arSearch.trim().toLowerCase();
    return items
      .filter((it) => {
        if (arFocus === 'flagged') return isFlagged(it);
        if (arFocus === 'all-for-student') return true; // "View" from Students' Marks — every attempt, not just misses
        return it.is_correct === false; // 'needs-review'
      })
      .filter((it) => !needle || it.question.toLowerCase().includes(needle) || (it.student_name || '').toLowerCase().includes(needle));
  }, [items, arFocus, arSearch, missCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to page 1 whenever the underlying list changes (new filter/search/focus).
  useEffect(() => { setBankPage(1); }, [items]);
  useEffect(() => { setArPage(1); }, [arQueue]);
  const pagedBank = items.slice((bankPage - 1) * PAGE_SIZE, bankPage * PAGE_SIZE);
  const pagedAr = arQueue.slice((arPage - 1) * PAGE_SIZE, arPage * PAGE_SIZE);

  const cohortAvg = marks.length ? Math.round((marks.reduce((s, m) => s + m.avg_score, 0) / marks.length) * 10) / 10 : 0;
  const visibleMarks = marksExpanded ? marks : marks.slice(0, 3);
  // Real emails, joined from the /students roster by id — the marks
  // endpoint itself only carries id + name, not the full student record.
  const emailById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.email])), [students]);
  const viewStudentAttempts = (name) => {
    setArSearch(name);
    setArFocus('all-for-student');
  };

  const handleNoteChange = (it, value) => {
    const key = keyOf(it);
    setNotes((n) => ({ ...n, [key]: value }));
    setNoteStatus((s) => ({ ...s, [key]: 'saving' }));
    debounceSave(key, it.attempt_id, it.question_index, value, (status) =>
      setNoteStatus((s) => ({ ...s, [key]: status })));
  };

  const clearFilters = () => {
    setQ(''); setGrade(''); setDifficulty(''); setBloom(''); setCorrect(''); setStudentId('');
    load({ q: '', grade: '', difficulty: '', bloom: '', correct: '', studentId: '' });
  };

  // Shared between the browse list and the review flashcard — same card, two
  // contexts. `index` (1-based) is only passed in the browse list, where
  // each question is numbered; the review flashcard has its own X/N counter.
  const renderCard = (it, index) => {
    const key = keyOf(it);
    const status = noteStatus[key];
    return (
      <div className="aq-qcard qb-item" key={key}>
        <div className="aq-qheader">
          <div style={{ display: 'flex', gap: 6 }}>
            {isAdmin && it.student_name && <span className="aq-chip aq-chip-gold">{it.student_name}</span>}
            <span className="qb-neutral-chip">{it.grade || '—'}</span>
            <span className="qb-neutral-chip">{it.difficulty.replace(/_/g, ' ')}</span>
            <span className="qb-neutral-chip">{it.bloom_level}</span>
          </div>
          {it.is_correct === true && <span className="qb-status qb-status-ok">✓ Correct</span>}
          {it.is_correct === false && <span className="qb-status qb-status-bad">⊗ Incorrect</span>}
          {it.is_correct === null && <span className="qb-status qb-status-neutral">○ Unattempted</span>}
        </div>
        <div className="aq-qtext qb-qtext-numbered">
          {index != null && <span className="qb-qindex">{index}.</span>}
          {it.question}
        </div>
        <div className="aq-opts">
          {Object.entries(it.options).map(([lt, text]) => {
            let cls = 'aq-opt';
            if (lt === it.correct) cls += ' correct';
            else if (lt === it.chosen) cls += ' wrong';
            return (
              <div className={cls} key={lt}>
                <span className="aq-opt-key">{lt}</span><span>{text}</span>
              </div>
            );
          })}
        </div>
        {it.explanation && <div className="aq-exp qb-exp"><strong>Explanation:</strong> {it.explanation}</div>}

        {/* Notes are private to whoever generated the quiz — an admin
            browsing someone else's questions can't write into them here
            (see the Instructor Note card in Admin Review for that). */}
        {!isAdmin && (
          <div className="qb-note">
            <label className="qb-note-label">
              📝 Note
              {status === 'saving' && <span className="qb-note-status">saving…</span>}
              {status === 'saved' && <span className="qb-note-status qb-note-saved">saved ✓</span>}
              {status === 'error' && <span className="qb-note-status qb-note-error">couldn't save</span>}
            </label>
            <textarea
              placeholder="Add your notes here…"
              value={notes[key] ?? ''}
              onChange={(e) => handleNoteChange(it, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  // Admin Review's attempt card — folder/date chip, fraction result chip,
  // check/cross badges on the options, a System Note (the model's own
  // explanation) and, for anything wrong, an Instructor Note the admin can
  // actually write (persisted via the same note API, scoped to the admin's
  // own account so it never collides with the student's private note).
  const renderAdminReviewCard = (it) => {
    const key = keyOf(it);
    const status = noteStatus[key];
    return (
      <div className="qb-ar-card" key={key}>
        <div className="qb-ar-card-head">
          <span className="qb-ar-date-chip">🗓️ {new Date(it.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          {it.is_correct
            ? <span className="aq-chip aq-chip-h">✓ Correct (1/1)</span>
            : <span className="aq-chip aq-chip-ve">✗ Incorrect (0/1)</span>}
          <span className={`aq-chip ${DIFF_CHIP[it.difficulty] || 'aq-chip-m'}`}>{it.difficulty.replace(/_/g, ' ')}</span>
        </div>
        <div>
          <span className="aq-chip aq-chip-gold">{it.student_name || 'Unknown student'}</span>
        </div>
        <div className="aq-qtext" style={{ marginTop: 8 }}>{it.question}</div>
        <div className="aq-opts qb-ar-opts">
          {Object.entries(it.options).map(([lt, text]) => {
            const isCorrectOpt = lt === it.correct;
            const isChosenWrong = lt === it.chosen && lt !== it.correct;
            let cls = 'aq-opt';
            if (isCorrectOpt) cls += ' correct';
            else if (isChosenWrong) cls += ' wrong';
            return (
              <div className={cls} key={lt} style={{ justifyContent: 'space-between' }}>
                <span>{lt}) {text}</span>
                {isCorrectOpt && <span className="qb-ar-opt-badge qb-ar-opt-badge-ok">✓ Correct Answer</span>}
                {isChosenWrong && <span className="qb-ar-opt-badge qb-ar-opt-badge-bad">✗</span>}
              </div>
            );
          })}
        </div>

        {it.explanation && (
          <div className="qb-ar-note qb-ar-system-note">
            <div className="qb-ar-note-label">🖥️ System Note</div>
            {it.explanation}
          </div>
        )}

        {it.is_correct === false && (
          <div className="qb-ar-note qb-ar-instructor-note">
            <div className="qb-ar-note-label">
              ⚑ Instructor Note {isFlagged(it) && <span className="qb-ar-flagged-tag">Flagged — repeated miss</span>}
              {status === 'saving' && <span className="qb-note-status">saving…</span>}
              {status === 'saved' && <span className="qb-note-status qb-note-saved">saved ✓</span>}
              {status === 'error' && <span className="qb-note-status qb-note-error">couldn't save</span>}
            </div>
            <textarea
              placeholder="e.g. Student has missed similar questions this week — consider flagging for intervention."
              value={notes[key] ?? ''}
              onChange={(e) => handleNoteChange(it, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  if (isAdminReview) {
    return (
      <div className="aq-root qb-root">
        <div className="qb-ar-header">
          <div>
            <h2>Admin Review: Question Bank</h2>
            <p className="aq-header-sub">Monitor student performance and manage assessment items.</p>
          </div>
          <input className="qb-ar-search" type="text" placeholder="🔍 Search questions or students…"
            value={arSearch} onChange={(e) => setArSearch(e.target.value)} />
        </div>

        {/* Students' Marks */}
        <div className="aq-card">
          <div className="qb-ar-card-title-row">
            <div className="aq-card-title" style={{ marginBottom: 0 }}><span className="aq-card-icon">📊</span> Students' Marks</div>
            {marks.length > 3 && (
              <button className="qb-ar-link-btn" onClick={() => setMarksExpanded((e) => !e)}>
                {marksExpanded ? 'Show less' : 'View All'} →
              </button>
            )}
          </div>
          {marks.length === 0 ? (
            <p style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 10 }}>No scored quiz attempts yet.</p>
          ) : (
            <div className="qb-marks-wrap">
              <table className="qb-marks-table qb-ar-marks-table">
                <thead><tr><th>Student</th><th>Attempts</th><th>Avg</th><th>Best</th><th>Latest</th><th>Action</th></tr></thead>
                <tbody>
                  {visibleMarks.map((m) => (
                    <tr key={m.student_id}>
                      <td>
                        <div className="qb-ar-student-cell">
                          <span className="qb-ar-avatar">{initials(m.student_name)}</span>
                          <span>
                            <div className="qb-ar-student-name">{m.student_name}</div>
                            {emailById[m.student_id] && <div className="qb-ar-student-email">{emailById[m.student_id]}</div>}
                          </span>
                        </div>
                      </td>
                      <td>{m.attempt_count}</td>
                      <td><span className="qb-ar-score-pill" style={{ color: scoreColorOf(m.avg_score), background: `${scoreColorOf(m.avg_score)}22` }}>{m.avg_score}%</span></td>
                      <td>{m.best_score}%</td>
                      <td>{timeAgo(m.latest_created_at)}</td>
                      <td><button className="qb-ar-link-btn" onClick={() => viewStudentAttempts(m.student_name)}>View →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stat tiles */}
        <div className="qb-ar-stats">
          <div className="qb-ar-stat">
            <div className="qb-ar-stat-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent-2)' }}>📘</div>
            <div>
              <div className="qb-ar-stat-label">Total Questions</div>
              <div className="qb-ar-stat-value">{items.length.toLocaleString()}</div>
            </div>
          </div>
          <div className="qb-ar-stat">
            <div className="qb-ar-stat-icon" style={{ background: 'var(--ok-dim)', color: 'var(--ok)' }}>📈</div>
            <div>
              <div className="qb-ar-stat-label">Cohort Avg Score</div>
              <div className="qb-ar-stat-value" style={{ color: 'var(--ok)' }}>{cohortAvg}%</div>
            </div>
          </div>
          <div className="qb-ar-stat">
            <div className="qb-ar-stat-icon" style={{ background: 'var(--warn-dim)', color: 'var(--warn)' }}>🧑‍🎓</div>
            <div>
              <div className="qb-ar-stat-label">Active Students</div>
              <div className="qb-ar-stat-value" style={{ color: 'var(--warn)' }}>{marks.length}</div>
            </div>
          </div>
        </div>

        {/* Recent Student Attempts */}
        <div className="qb-ar-section-head">
          <div className="aq-card-title" style={{ marginBottom: 0 }}>
            Recent Student Attempts
            {arFocus === 'all-for-student' && (
              <span className="qb-ar-viewing-tag">
                Viewing: {arSearch} <button onClick={() => { setArSearch(''); setArFocus('needs-review'); }}>✕</button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`aq-btn qb-btn-sm ${arFocus === 'needs-review' ? 'aq-btn-primary' : 'aq-btn-outline'}`} onClick={() => { setArFocus('needs-review'); setArSearch(''); }}>Needs Review</button>
            <button className={`aq-btn qb-btn-sm ${arFocus === 'flagged' ? 'aq-btn-primary' : 'aq-btn-outline'}`} onClick={() => { setArFocus('flagged'); setArSearch(''); }}>Flagged</button>
          </div>
        </div>

        {error && <div className="qb-error">⚠ {error}</div>}
        {loading && <div className="aq-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>}

        {!loading && arQueue.length === 0 && (
          <div className="aq-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>
            {arFocus === 'flagged' ? 'No flagged attempts right now.' : 'Nothing needs review right now.'}
          </div>
        )}

        {!loading && arQueue.length > 0 && (
          <>
            <div className="qb-ar-grid">{pagedAr.map(renderAdminReviewCard)}</div>
            <Pagination page={arPage} pageSize={PAGE_SIZE} total={arQueue.length} onPageChange={setArPage} theme={PAGINATION_THEME} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="aq-root qb-root">
      <div className={`aq-header${!isReview ? ' qb-hero-header' : ''}`}>
        <h2>{isReview ? 'Review' : 'Question Bank'}</h2>
        <p>{isReview
          ? 'Go through your questions one at a time — starting with what you got wrong.'
          : 'Searchable archive of every quiz question you have generated.'}</p>
      </div>

      {/* Admin: students' marks (Question Bank tab only) */}
      {isAdmin && !isReview && marks.length > 0 && (
        <div className="aq-card">
          <div className="aq-card-title"><span className="aq-card-icon">🏅</span> Students' Marks</div>
          <div className="qb-marks-wrap">
            <table className="qb-marks-table">
              <thead><tr><th>Student</th><th>Attempts</th><th>Avg</th><th>Best</th><th>Latest</th><th></th></tr></thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.student_id} className={m.student_id === studentId ? 'qb-row-active' : ''}>
                    <td>{m.student_name}</td>
                    <td>{m.attempt_count}</td>
                    <td>{m.avg_score}%</td>
                    <td>{m.best_score}%</td>
                    <td>{m.latest_score}%</td>
                    <td>
                      <button className="aq-btn aq-btn-outline qb-btn-sm"
                        onClick={() => setStudentId(m.student_id === studentId ? '' : m.student_id)}>
                        {m.student_id === studentId ? 'Clear' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student review mode: a lean toolbar — focus only */}
      {isReview && (
        <div className="aq-card">
          <div className="qb-review-toolbar">
            <div className="qb-review-focus">
              {[['incorrect', '✗ Incorrect'], ['unattempted', '○ Unattempted'], ['all', 'All']].map(([val, label]) => (
                <button key={val} type="button"
                  className={`aq-btn qb-btn-sm ${reviewFocus === val ? 'aq-btn-primary' : 'aq-btn-outline'}`}
                  onClick={() => setReviewFocus(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary + filters, one card */}
      {!isReview && <div className="aq-card qb-summary-card">
        <div className="aq-score-circle qb-summary-ring" style={{ borderColor: scoreColorOf(pct) }}>
          <div className="snum" style={{ color: scoreColorOf(pct) }}>{pct}%</div>
        </div>
        <div className="qb-summary-text">
          <div className="qb-summary-title">{items.length} question{items.length === 1 ? '' : 's'}</div>
          <div className="qb-summary-sub">{answered.length} answered · {items.length - answered.length} unattempted</div>
        </div>

        <div className="qb-summary-divider" />

        <div className="qb-summary-right">
          <div className="qb-search-wrap">
            <span className="qb-search-icon">🔍</span>
            <input className="qb-search" type="text" placeholder="Search questions…" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} onBlur={load} />
          </div>

          <div className="qb-filters">
            {isAdmin && (
              <span className="qb-pillwrap">
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Student</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </span>
            )}
            <span className="qb-pillwrap">
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">Grade</option>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </span>
            <span className="qb-pillwrap">
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">Difficulty</option>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
              </select>
            </span>
            <span className="qb-pillwrap">
              <select value={bloom} onChange={(e) => setBloom(e.target.value)}>
                <option value="">Bloom's Level</option>
                {BLOOMS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </span>
            <span className="qb-pillwrap">
              <select value={correct} onChange={(e) => setCorrect(e.target.value)}>
                <option value="">Status</option>
                <option value="true">Correct</option>
                <option value="false">Incorrect</option>
              </select>
            </span>
            <button className="qb-clear-link" onClick={clearFilters}>Clear</button>
          </div>
        </div>
      </div>}

      {error && <div className="qb-error">⚠ {error}</div>}
      {loading && <div className="aq-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>}

      {!loading && !error && items.length === 0 && (
        <div className="aq-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          No questions match these filters — generate and submit a quiz to start building the bank.
        </div>
      )}

      {/* Browse: full list, numbered */}
      {!loading && !isReview && pagedBank.map((it, i) => renderCard(it, (bankPage - 1) * PAGE_SIZE + i + 1))}
      {!loading && !isReview && (
        <Pagination page={bankPage} pageSize={PAGE_SIZE} total={items.length} onPageChange={setBankPage} theme={PAGINATION_THEME} />
      )}

      {/* Student review: one flashcard at a time */}
      {!loading && isReview && items.length > 0 && (
        reviewQueue.length === 0 ? (
          <div className="aq-card" style={{ textAlign: 'center', color: 'var(--text-3)' }}>
            🎉 Nothing to review here — try a different focus above.
          </div>
        ) : (
          <>
            <div className="qb-review-progress">
              <button className="aq-btn aq-btn-outline" disabled={reviewIndex === 0} onClick={() => setReviewIndex((i) => i - 1)}>← Prev</button>
              <span>{reviewIndex + 1} / {reviewQueue.length}</span>
              <button className="aq-btn aq-btn-outline" disabled={reviewIndex >= reviewQueue.length - 1} onClick={() => setReviewIndex((i) => i + 1)}>Next →</button>
            </div>
            {current && renderCard(current)}
          </>
        )
      )}
    </div>
  );
}
