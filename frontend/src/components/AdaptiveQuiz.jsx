import React, { useState, useEffect } from 'react';
import '../styles/AdaptiveQuiz.css';
import { generateQuiz, extractPdfText, saveQuizAttempt, getQuizHistory } from '../api/quiz';

const DIFF_MAP = [
  { risk:'HIGH',   perf:'Low',  diff:'VERY_EASY',  bloom:'Remember',       icon:'🔴', goal:'Build confidence with foundational recall',   dc:'aq-chip-ve',  bc:'aq-chip-remember'  },
  { risk:'HIGH',   perf:'Mid',  diff:'EASY',        bloom:'Understand',     icon:'🟠', goal:'Gentle comprehension to reduce stress',        dc:'aq-chip-e',   bc:'aq-chip-understand'},
  { risk:'HIGH',   perf:'High', diff:'MEDIUM',      bloom:'Apply',          icon:'🟡', goal:'Structured application despite high risk',     dc:'aq-chip-m',   bc:'aq-chip-apply'     },
  { risk:'MEDIUM', perf:'Low',  diff:'EASY',        bloom:'Understand',     icon:'🟠', goal:'Comprehension to solidify understanding',      dc:'aq-chip-e',   bc:'aq-chip-understand'},
  { risk:'MEDIUM', perf:'Mid',  diff:'MEDIUM',      bloom:'Apply',          icon:'🟡', goal:'Balanced application challenges',              dc:'aq-chip-m',   bc:'aq-chip-apply'     },
  { risk:'MEDIUM', perf:'High', diff:'MEDIUM_HARD', bloom:'Analyze',        icon:'🔵', goal:'Push toward higher-order analysis skills',     dc:'aq-chip-mh',  bc:'aq-chip-analyze'   },
  { risk:'LOW',    perf:'Low',  diff:'MEDIUM',      bloom:'Apply',          icon:'🟡', goal:'Application practice despite low performance', dc:'aq-chip-m',   bc:'aq-chip-apply'     },
  { risk:'LOW',    perf:'Mid',  diff:'MEDIUM_HARD', bloom:'Analyze',        icon:'🔵', goal:'Deeper analytical thinking encouraged',        dc:'aq-chip-mh',  bc:'aq-chip-analyze'   },
  { risk:'LOW',    perf:'High', diff:'HARD',        bloom:'Evaluate/Create',icon:'🟢', goal:'Maximum challenge for high achievers',         dc:'aq-chip-h',   bc:'aq-chip-evaluate'  },
];

const getMapping = (r, p) => DIFF_MAP.find(d => d.risk === r && d.perf === p) || DIFF_MAP[4];

const STEPS = [
  { label:'Lecture Content', icon:'📄' },
  { label:'Student Profile', icon:'🎓' },
  { label:'Take Quiz',       icon:'🎯' },
];

const LOAD_STEPS = ['Analysing lecture content…','Identifying key concepts…',"Mapping to Bloom's taxonomy…",'Generating questions…','Finalising quiz…'];

export default function AdaptiveQuiz() {
  const [step, setStep]           = useState(0);
  const [text, setText]           = useState('');
  const [pdfLabel, setPdfLabel]   = useState('');
  const [grade, setGrade]         = useState('Grade 11');
  const [numQ, setNumQ]           = useState(5);
  const [risk, setRisk]           = useState('MEDIUM');
  const [perf, setPerf]           = useState('Mid');
  const [phase, setPhase]         = useState('idle');
  const [loadStep, setLoadStep]   = useState('');
  const [questions, setQuestions] = useState([]);
  const [revealed, setRevealed]   = useState({});
  const [answers, setAnswers]     = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [error, setError]         = useState('');
  const [pdfBusy, setPdfBusy]     = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | failed
  const [history, setHistory]     = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const map = getMapping(risk, perf);

  useEffect(() => {
    if (phase !== 'loading') return;
    let i = 0; setLoadStep(LOAD_STEPS[0]);
    const id = setInterval(() => { i = (i+1) % LOAD_STEPS.length; setLoadStep(LOAD_STEPS[i]); }, 700);
    return () => clearInterval(id);
  }, [phase]);

  const handlePDF = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setPdfLabel(`📄 ${file.name} — extracting text…`);
    setPdfBusy(true); setError('');
    try {
      const { text: extracted, num_pages, truncated } = await extractPdfText(file);
      setText(extracted);
      setPdfLabel(`✓ ${file.name} — ${num_pages} page${num_pages === 1 ? '' : 's'} extracted${truncated ? ' (truncated to fit)' : ''}`);
    } catch (err) {
      setPdfLabel('');
      setError(err.message || 'Could not extract text from that PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const loadSample = () => setText(`Photosynthesis and Cellular Respiration\n\nPhotosynthesis converts light energy into chemical energy: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂.\n\nLight-dependent reactions occur in thylakoid membranes, producing ATP and NADPH via photolysis of water.\nThe Calvin Cycle in the stroma fixes CO₂ into G3P using ATP and NADPH.\nChlorophyll absorbs red and blue light, reflecting green.\n\nCellular respiration: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP (~36–38 ATP/glucose).\nStages: Glycolysis (cytoplasm) → Krebs Cycle (matrix) → ETC (inner membrane).\nLimiting factors: light intensity, CO₂, temperature, water.`);

  const goNext = () => {
    if (step === 0) {
      if (text.trim().length < 80) { setError('Please add more content (at least a paragraph).'); return; }
      setError(''); setStep(1);
    } else if (step === 1) {
      setError(''); setStep(2); startQuiz();
    }
  };

  const goBack = () => { setError(''); setStep(s => s - 1); };

  const startQuiz = async () => {
    setPhase('loading'); setQuestions([]); setRevealed({}); setAnswers({}); setSubmitted(false); setShowReview(false); setError('');
    try {
      const result = await generateQuiz({
        content: text,
        grade,
        num_questions: numQ,
        risk_label: risk,
        performance_level: perf,
      });
      setQuestions(result.questions);
      setPhase('ready');
    } catch (err) {
      setError(err.message || 'Quiz generation failed.');
      setPhase('idle');
      setStep(1);
    }
  };

  const pick = (qi, lt) => {
    if (revealed[qi]) return;
    const correct = questions[qi].correct;
    setAnswers(a => ({ ...a, [qi]: lt }));
    setRevealed(r => ({ ...r, [qi]: { chosen: lt, correct } }));
  };

  const submit = () => {
    const newR = { ...revealed };
    questions.forEach((q, i) => { if (!newR[i]) newR[i] = { chosen: null, correct: q.correct }; });
    setRevealed(newR); setSubmitted(true); setPhase('result');
    setTimeout(() => document.getElementById('aq-results')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);

    setSaveState('saving');
    saveQuizAttempt({
      grade, difficulty: map.diff, bloom_level: map.bloom,
      risk_label: risk, performance_level: perf,
      questions, answers,
    })
      .then(() => { setSaveState('saved'); return loadHistory(); })
      .catch(() => setSaveState('failed'));
  };

  const loadHistory = async () => {
    try { setHistory(await getQuizHistory()); } catch { /* history is a nice-to-have — stay quiet on failure */ }
  };

  useEffect(() => { loadHistory(); }, []);

  const correctCount = questions.filter((q, i) => answers[i] === q.correct).length;
  const pct = questions.length ? Math.round(correctCount / questions.length * 100) : 0;
  const scoreColor = pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--bad)';
  const answeredCount = Object.keys(revealed).length;
  const liveCorrect = questions.filter((q, i) => answers[i] === q.correct).length;

  return (
    <div className="aq-root">

      {/* HEADER */}
      <div className="aq-header">
        <h2>Adaptive Quiz Generation</h2>
        <p>Paste your lecture content, set your student profile, and get AI-calibrated questions at exactly the right difficulty and Bloom's level.</p>
      </div>

      {/* TABS */}
      <div className="aq-tabs">
        {STEPS.map((s, i) => (
          <button key={i}
            className={`aq-tab${step===i?' aq-tab-active':i<step?' aq-tab-done':''}`}
            onClick={() => i < step ? (setStep(i), setError('')) : null}
          >
            <span className="aq-tab-num">{i < step ? '✓' : i+1}</span>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {error && <div style={{background:'var(--bad-dim)',border:'1px solid var(--bad-dim)',borderRadius:'8px',padding:'10px 14px',fontSize:'16px',color:'var(--bad)',marginBottom:'1rem'}}>⚠ {error}</div>}

      {/* ── STEP 0: Lecture Content ── */}
      {step === 0 && (
        <div className="aq-card aq-fade">
          <div className="aq-card-title"><span className="aq-card-icon">📄</span> Lecture Content</div>

          <div className="aq-section-label">Option A — Paste Text</div>
          <div className="aq-field">
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder={"Paste your lecture notes, slides, or reading material here…\n\nExample: 'Photosynthesis converts light energy into glucose using CO₂ and H₂O…'"} />
          </div>

          <div className="aq-section-label" style={{marginTop:'1.25rem'}}>Option B — Upload PDF</div>
          <label className={`aq-upload${pdfLabel.startsWith('✓')?' done':''}`} htmlFor="aq-pdf" style={pdfBusy?{opacity:0.6,pointerEvents:'none'}:undefined}>
            <input id="aq-pdf" type="file" accept=".pdf" style={{display:'none'}} onChange={handlePDF} disabled={pdfBusy}/>
            <div className="aq-upload-icon">📁</div>
            <div className="aq-upload-text">{pdfLabel || 'Click to upload a PDF'}</div>
            <div className="aq-upload-sub">PDF lecture slides — content will be extracted</div>
          </label>

          <div className="aq-btn-row">
            <button className="aq-btn aq-btn-outline" onClick={loadSample}>Load Sample Content</button>
            <button className="aq-btn aq-btn-primary" onClick={goNext}>Next: Student Profile →</button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Student Profile ── */}
      {step === 1 && (
        <div className="aq-card aq-fade">
          <div className="aq-card-title"><span className="aq-card-icon">🎓</span> Student Profile</div>

          <div className="aq-section-label">Academic Context</div>
          <div className="aq-grid-2">
            <div className="aq-field">
              <label>Grade Level</label>
              <select value={grade} onChange={e => setGrade(e.target.value)}>
                {['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','Undergraduate Year 1','Undergraduate Year 2'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="aq-field">
              <label>Number of Questions</label>
              <select value={numQ} onChange={e => setNumQ(+e.target.value)}>
                <option value={3}>3 questions</option>
                <option value={5}>5 questions</option>
                <option value={8}>8 questions</option>
              </select>
            </div>
          </div>

          <div className="aq-section-label">Risk &amp; Performance</div>
          <div className="aq-grid-2">
            <div className="aq-field">
              <label>Wellbeing Risk Label</label>
              <select value={risk} onChange={e => setRisk(e.target.value)}>
                <option value="LOW">LOW Risk</option>
                <option value="MEDIUM">MEDIUM Risk</option>
                <option value="HIGH">HIGH Risk</option>
              </select>
              <span className="aq-field-hint">From the Wellbeing Indicator Model</span>
            </div>
            <div className="aq-field">
              <label>Performance Level</label>
              <select value={perf} onChange={e => setPerf(e.target.value)}>
                <option value="Low">Low Performance</option>
                <option value="Mid">Mid Performance</option>
                <option value="High">High Performance</option>
              </select>
              <span className="aq-field-hint">Derived from exam score quartile</span>
            </div>
          </div>

          <div className="aq-section-label">Difficulty &amp; Bloom's Mapping</div>
          <p style={{fontSize:'15px',color:'var(--text-3)',marginBottom:'10px'}}>Your risk × performance combination maps to the cognitive level below.</p>
          <div className="aq-table-wrap">
            <table className="aq-diff-table">
              <thead><tr><th>Risk</th><th>Performance</th><th>Difficulty</th><th>Bloom's Level</th><th>Goal</th></tr></thead>
              <tbody>
                {DIFF_MAP.map((d, i) => (
                  <tr key={i} className={d.risk===risk&&d.perf===perf ? 'aq-row-active' : ''}>
                    <td><span style={{fontWeight:700,color:d.risk==='HIGH'?'var(--bad)':d.risk==='MEDIUM'?'var(--warn)':'var(--ok)'}}>{d.risk}</span></td>
                    <td>{d.perf}</td>
                    <td><span className={`aq-chip ${d.dc}`}>{d.diff.replace(/_/g,' ')}</span></td>
                    <td><span className={`aq-chip ${d.bc}`}>{d.bloom}</span></td>
                    <td className="aq-goal-cell">{d.goal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="aq-banner">
            <span className="aq-banner-icon">{map.icon}</span>
            <div>
              <div className="aq-banner-sub">Your Assigned Level</div>
              <div className="aq-banner-val">{map.diff.replace(/_/g,' ')} · {map.bloom}</div>
              <div className="aq-banner-goal">{map.goal}</div>
            </div>
          </div>

          <div className="aq-btn-row">
            <button className="aq-btn aq-btn-outline" onClick={goBack}>← Back</button>
            <button className="aq-btn aq-btn-gold" style={{fontSize:'17px',padding:'12px 28px'}} onClick={goNext}>✦ Generate Adaptive Quiz</button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Quiz ── */}
      {step === 2 && (
        <div className="aq-fade">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="aq-card">
              <div className="aq-loading">
                <div className="aq-spinner"/>
                <p>Generating adaptive questions…</p>
                <div className="aq-loading-step">{loadStep}</div>
              </div>
            </div>
          )}

          {/* Quiz */}
          {(phase === 'ready' || phase === 'result') && questions.length > 0 && (
            <>
              {/* Header */}
              <div className="aq-card">
                <div className="aq-quiz-meta">
                  <div>
                    <div className="aq-card-title" style={{marginBottom:'6px'}}><span className="aq-card-icon">🎯</span> Adaptive Quiz</div>
                    <div className="aq-quiz-pills">
                      <span className="aq-chip aq-chip-blue">{grade}</span>
                      <span className={`aq-chip ${map.dc}`}>{map.diff.replace(/_/g,' ')}</span>
                      <span className={`aq-chip ${map.bc}`}>{map.bloom}</span>
                      <span className="aq-chip aq-chip-gold">{questions.length} Qs</span>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="aq-live-score">{submitted ? `${correctCount} / ${questions.length}` : `${liveCorrect} / ${answeredCount}`}</div>
                    <div className="aq-live-label">Score (live)</div>
                  </div>
                </div>
                <div className="aq-quiz-tip">💡 {map.goal} — take your time with each question.</div>
              </div>

              {/* Questions */}
              {questions.map((q, qi) => {
                const rev = revealed[qi];
                return (
                  <div className="aq-qcard" key={qi}>
                    <div className="aq-qheader">
                      <span className="aq-qnum">Q{qi+1} / {questions.length}</span>
                      <span className={`aq-chip ${map.bc}`} style={{fontSize:'13px'}}>{map.bloom}</span>
                    </div>
                    <div className="aq-qtext">{q.question}</div>
                    <div className="aq-opts">
                      {['A','B','C','D'].map(lt => {
                        let cls = 'aq-opt';
                        if (rev) {
                          if (lt === rev.correct) cls += ' correct';
                          else if (lt === rev.chosen && lt !== rev.correct) cls += ' wrong';
                        }
                        return (
                          <button key={lt} className={cls} onClick={() => pick(qi, lt)} disabled={!!rev}>
                            <span className="aq-opt-key">{lt}</span>
                            <span>{q.options[lt]}</span>
                          </button>
                        );
                      })}
                    </div>
                    {rev && <div className="aq-exp"><strong>Explanation:</strong> {q.explanation}</div>}
                  </div>
                );
              })}

              {phase === 'ready' && (
                <div style={{textAlign:'center',margin:'1rem 0'}}>
                  <button className="aq-btn aq-btn-primary" onClick={submit}>Submit Quiz</button>
                </div>
              )}

              {/* Results */}
              {phase === 'result' && (
                <div className="aq-card aq-fade" id="aq-results">
                  <div className="aq-card-title"><span className="aq-card-icon">📊</span> Results</div>
                  <div className="aq-result-row">
                    <div style={{textAlign:'center'}}>
                      <div className="aq-score-circle" style={{borderColor:scoreColor}}>
                        <div className="snum" style={{color:scoreColor}}>{correctCount}</div>
                        <div className="sof">/ {questions.length}</div>
                      </div>
                    </div>
                    <div className="aq-result-divider"/>
                    <div>
                      {pct>=80 ? <span className="aq-pill aq-pill-low" style={{fontSize:'16px'}}>🏆 Excellent</span>
                       : pct>=60 ? <span className="aq-chip aq-chip-m" style={{fontSize:'16px'}}>👍 Good</span>
                       : pct>=40 ? <span className="aq-chip aq-chip-e" style={{fontSize:'16px'}}>📖 Keep Going</span>
                       : <span className="aq-chip aq-chip-ve" style={{fontSize:'16px'}}>💪 Keep Trying</span>}
                      <div className="aq-result-comment" style={{marginTop:'8px'}}>
                        {pct>=80 ? 'Outstanding! Ready for harder questions.'
                         : pct>=60 ? 'Solid effort — review explanations above.'
                         : pct>=40 ? 'Keep revising — focus on the explanations.'
                         : 'Review the lecture content and try again.'}
                      </div>
                    </div>
                  </div>

                  <div style={{textAlign:'center',fontSize:'15px',color:'var(--text-3)',marginBottom:'10px'}}>
                    {saveState === 'saving' && '⏳ Saving attempt…'}
                    {saveState === 'saved' && '✓ Attempt saved to your history'}
                    {saveState === 'failed' && '⚠ Could not save this attempt — your score above is still valid.'}
                  </div>

                  <div style={{display:'flex',gap:'10px',justifyContent:'center',flexWrap:'wrap',marginBottom:'1rem'}}>
                    <button className="aq-btn aq-btn-outline" onClick={() => setShowReview(r=>!r)}>{showReview?'Hide Review':'Review Answers'}</button>
                    <button className="aq-btn aq-btn-outline" onClick={() => setShowHistory(h=>!h)}>{showHistory?'Hide History':`Past Attempts (${history.length})`}</button>
                    <button className="aq-btn aq-btn-outline" onClick={() => setStep(1)}>← Adjust Profile</button>
                    <button className="aq-btn aq-btn-gold" onClick={() => { setStep(2); startQuiz(); }}>↻ New Quiz</button>
                  </div>

                  {showHistory && (
                    <div className="aq-table-wrap" style={{marginBottom:'1rem'}}>
                      {history.length === 0 ? (
                        <p style={{fontSize:'16px',color:'var(--text-3)'}}>No past attempts yet.</p>
                      ) : (
                        <table className="aq-diff-table">
                          <thead><tr><th>Date</th><th>Grade</th><th>Difficulty</th><th>Score</th></tr></thead>
                          <tbody>
                            {history.map(h => (
                              <tr key={h.id}>
                                <td>{new Date(h.created_at).toLocaleDateString()}</td>
                                <td>{h.grade}</td>
                                <td><span className="aq-chip">{h.difficulty.replace(/_/g,' ')}</span></td>
                                <td>{h.correct_count}/{h.total} · {h.score}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {showReview && questions.map((q, qi) => {
                    const rev = revealed[qi]; const ok = answers[qi] === q.correct;
                    return (
                      <div className="aq-review-item" key={qi}>
                        <div className="aq-review-q">Q{qi+1}. {q.question}</div>
                        <div className="aq-review-ans">
                          Your answer: <strong style={{color:ok?'var(--ok)':'var(--bad)'}}>{rev?.chosen ? `${rev.chosen}. ${q.options[rev.chosen]}` : 'Not answered'}</strong>
                          {!ok && rev?.chosen && <> · Correct: <strong style={{color:'var(--ok)'}}>{q.correct}. {q.options[q.correct]}</strong></>}
                        </div>
                        <div className="aq-review-exp">{q.explanation}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
