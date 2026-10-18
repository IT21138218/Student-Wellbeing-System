/** Design tokens for inline style={{}} objects.
 *
 * Mirrors the CSS custom properties in src/styles/index.css — change both
 * together. Inline styles can't read var(--x) reliably for computed values
 * (SVG stroke, canvas, chart.js datasets), so the raw values live here too.
 *
 * Use these instead of typing a hex. The app previously had two competing
 * palettes — a muted one in .css and vivid Tailwind defaults inline — which
 * put two different greens on the same screen.
 */
export const T = {
  bgDeep: '#020617',
  bgPanel: '#0f172a',
  surface: 'rgba(255,255,255,0.03)',
  surface2: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.14)',

  text: '#e6e8ee',
  text2: '#a3adbf',
  text3: '#7d8899',

  accent: '#4d8df0',
  accent2: '#7fb0f5',        // links, badge text
  accentStrong: '#3a76d6',   // hover on filled buttons
  accentDim: 'rgba(77,141,240,0.12)',

  ok: '#46a97d',
  warn: '#d69a4c',
  bad: '#e0706a',
  okDim: 'rgba(70,169,125,0.12)',
  warnDim: 'rgba(214,154,76,0.12)',
  badDim: 'rgba(224,112,106,0.12)',

  rControl: 8,
  rCard: 12,
};

/** The LOW / MEDIUM / HIGH triple, used by every risk pill, chart point and
 * score readout. One definition — previously each component picked its own. */
export const RISK = { LOW: T.ok, MEDIUM: T.warn, HIGH: T.bad };

/** Series colors for charts where categories carry no good/bad meaning —
 * e.g. average score per grade. Distinct hues, but all held to the same
 * saturation and lightness band as the tokens above so they read as one
 * family; the previous list mixed in vivid #06b6d4 and #a855f7, which
 * jumped out against everything else on the page.
 *
 * Semantic color (RISK) is a separate system — never substitute one for
 * the other. */
export const CATEGORICAL = [
  T.accent,   // blue
  '#4aa8bd',  // teal
  T.ok,       // green
  T.warn,     // amber
  '#9b7fd4',  // violet
  T.bad,      // red
];

/** Score 0-100 -> semantic color, matching the risk bands. */
export function scoreColor(score) {
  return score >= 70 ? T.ok : score >= 50 ? T.warn : T.bad;
}

/** hex ('#rrggbb') -> 'rgba(r,g,b,alpha)'. Lets a component build its own
 * background/border tints (any opacity it needs) from the ONE canonical hex
 * above, instead of hand-typing a second, driftable copy of the same color. */
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
