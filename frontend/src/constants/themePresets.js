/** Four full CSS-token palettes a user can pick from in Settings ->
 * Appearance. Same key set as the :root tokens in src/styles/index.css —
 * ThemeSettingsContext writes whichever one is active (merged with any
 * custom color overrides) onto document.documentElement as inline CSS
 * custom properties, so every component styled with var(--x) picks it up
 * live, with no per-component code change needed. */

const dark = {
  label: 'Dark', icon: 'dark_mode',
  bgDeep: '#020617', bgPanel: '#0f172a',
  surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.08)', border2: 'rgba(255,255,255,0.14)',
  text: '#e6e8ee', text2: '#a3adbf', text3: '#7d8899',
  accent: '#4d8df0', accent2: '#7fb0f5', accentStrong: '#3a76d6', accentDim: 'rgba(77,141,240,0.12)',
  ok: '#46a97d', warn: '#d69a4c', bad: '#e0706a',
  okDim: 'rgba(70,169,125,0.12)', warnDim: 'rgba(214,154,76,0.12)', badDim: 'rgba(224,112,106,0.12)',
  // Glass card/sidebar backdrop — dark, translucent, meant to sit over the
  // cinematic photo scene (BackgroundScene only shows that photo for
  // dark-leaning themes; see its isLightTheme check).
  panelGlass: 'rgba(35, 37, 41, 0.45)',
  showPhoto: true,
  colorScheme: 'dark', // native <select>/scrollbar chrome
  swatch: ['#020617', '#0f172a', '#4d8df0'],
};

const light = {
  label: 'Light', icon: 'light_mode',
  bgDeep: '#f4f6fb', bgPanel: '#ffffff',
  surface: 'rgba(15,23,42,0.03)', surface2: 'rgba(15,23,42,0.05)',
  border: 'rgba(15,23,42,0.10)', border2: 'rgba(15,23,42,0.16)',
  text: '#0f172a', text2: '#45506b', text3: '#6b7690',
  accent: '#2f6fd6', accent2: '#1f5bb8', accentStrong: '#1a4a94', accentDim: 'rgba(47,111,214,0.10)',
  ok: '#1f8a5f', warn: '#b5750f', bad: '#c23b34',
  okDim: 'rgba(31,138,95,0.12)', warnDim: 'rgba(181,117,15,0.12)', badDim: 'rgba(194,59,52,0.12)',
  // Near-opaque white glass — no photo behind it (see showPhoto), so this
  // just needs to read as a clean white card, not fight a busy backdrop.
  panelGlass: 'rgba(255, 255, 255, 0.9)',
  showPhoto: false,
  colorScheme: 'light',
  swatch: ['#f4f6fb', '#ffffff', '#2f6fd6'],
};

const midnight = {
  label: 'Midnight Blue', icon: 'bedtime',
  bgDeep: '#050b1f', bgPanel: '#0c1730',
  surface: 'rgba(120,160,255,0.05)', surface2: 'rgba(120,160,255,0.08)',
  border: 'rgba(120,160,255,0.12)', border2: 'rgba(120,160,255,0.2)',
  text: '#e3e9fb', text2: '#a9b6da', text3: '#7b88ae',
  accent: '#6c8fff', accent2: '#93aeff', accentStrong: '#5675e0', accentDim: 'rgba(108,143,255,0.15)',
  ok: '#4fbf9a', warn: '#e0aa5c', bad: '#ec7f78',
  okDim: 'rgba(79,191,154,0.14)', warnDim: 'rgba(224,170,92,0.14)', badDim: 'rgba(236,127,120,0.14)',
  panelGlass: 'rgba(12, 23, 48, 0.55)',
  showPhoto: true,
  colorScheme: 'dark',
  swatch: ['#050b1f', '#0c1730', '#6c8fff'],
};

const highContrast = {
  label: 'High Contrast', icon: 'contrast',
  bgDeep: '#000000', bgPanel: '#0a0a0a',
  surface: 'rgba(255,255,255,0.08)', surface2: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.35)', border2: 'rgba(255,255,255,0.55)',
  text: '#ffffff', text2: '#e6e6e6', text3: '#cccccc',
  accent: '#66b3ff', accent2: '#99ccff', accentStrong: '#3399ff', accentDim: 'rgba(102,179,255,0.25)',
  ok: '#3ddc84', warn: '#ffcc33', bad: '#ff5c5c',
  okDim: 'rgba(61,220,132,0.2)', warnDim: 'rgba(255,204,51,0.2)', badDim: 'rgba(255,92,92,0.2)',
  // Max-contrast: no photo at all, and a near-opaque panel so text never
  // sits on anything but a flat, predictable surface.
  panelGlass: 'rgba(10, 10, 10, 0.95)',
  showPhoto: false,
  colorScheme: 'dark',
  swatch: ['#000000', '#0a0a0a', '#66b3ff'],
};

export const THEME_PRESETS = { dark, light, midnight, highContrast };
export const DEFAULT_PRESET_ID = 'dark';

export const FONT_SCALE = {
  small: 0.9,
  default: 1,
  large: 1.15,
};
