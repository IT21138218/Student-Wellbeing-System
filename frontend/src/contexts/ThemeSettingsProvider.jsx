import React, { useEffect, useState } from 'react';
import { ThemeSettingsContext } from './ThemeSettingsContext';
import { THEME_PRESETS, DEFAULT_PRESET_ID, FONT_SCALE } from '../constants/themePresets';
import { deriveSurfaceTiers, deriveTextTiers, deriveAccentTiers } from '../utils/color';

const STORAGE_KEY = 'wai-theme-settings';

// tokenKey (camelCase, matches themePresets.js) -> CSS custom property name
// (kebab-case, matches src/styles/index.css's :root tokens). showPhoto is
// NOT here — it's a plain boolean read by BackgroundScene via context, not
// a color, so it never becomes a CSS var.
const CSS_VAR_NAME = {
  bgDeep: '--bg-deep', bgPanel: '--bg-panel',
  surface: '--surface', surface2: '--surface-2',
  border: '--border', border2: '--border-2',
  text: '--text', text2: '--text-2', text3: '--text-3',
  accent: '--accent', accent2: '--accent-2', accentStrong: '--accent-strong', accentDim: '--accent-dim',
  ok: '--ok', warn: '--warn', bad: '--bad',
  okDim: '--ok-dim', warnDim: '--warn-dim', badDim: '--bad-dim',
  panelGlass: '--panel-glass',
};

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && THEME_PRESETS[parsed.presetId]) return parsed;
    }
  } catch {
    // corrupt/unavailable storage — fall through to defaults
  }
  return { presetId: DEFAULT_PRESET_ID, customColors: null, fontSize: 'default' };
}

/** Merge the active preset with any custom bg/text/accent overrides into
 * one flat token map ready to write onto document.documentElement. Risk
 * colors (ok/warn/bad) are deliberately left as the preset's own — those
 * carry real meaning (LOW/MEDIUM/HIGH) across the whole app, so they're not
 * part of the free-form customization surface. `showPhoto`/`panelGlass`
 * follow the effective background's own lightness (via deriveSurfaceTiers)
 * when a custom bg is picked, not the original preset's — a light custom
 * background should hide the dark cinematic photo just like the Light
 * preset does, even if the user started from Dark. */
function computeTokens(presetId, customColors) {
  const preset = THEME_PRESETS[presetId] || THEME_PRESETS[DEFAULT_PRESET_ID];
  if (!customColors) return preset;

  const surfaceTiers = customColors.bg ? deriveSurfaceTiers(customColors.bg) : {};
  const textTiers = customColors.text ? deriveTextTiers(customColors.text) : {};
  const accentTiers = customColors.accent ? deriveAccentTiers(customColors.accent) : {};

  return { ...preset, ...surfaceTiers, ...textTiers, ...accentTiers };
}

export function ThemeSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadInitial);
  const tokens = computeTokens(settings.presetId, settings.customColors);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(CSS_VAR_NAME).forEach(([key, cssVar]) => {
      if (tokens[key]) root.style.setProperty(cssVar, tokens[key]);
    });
    // Was `root.style.fontSize = ...` (only rescales rem-based text) — but
    // the overwhelming majority of this app's own text is sized via
    // unitless inline `fontSize: 16`-style numbers (hundreds of call sites
    // across every module component), which React renders as literal px and
    // which a root rem change never touches. That made "Text Size" visibly
    // do almost nothing anywhere except the sidebar/topbar. `zoom` is a true
    // page-level visual scale applied after layout, so it uniformly grows
    // BOTH px and rem content together. Every scroll region this touches
    // already has its own overflow-y: auto (see Dashboard.css's .main-wrap,
    // Profile.jsx's modal body), so bigger text just means more scrolling,
    // not clipping.
    root.style.zoom = FONT_SCALE[settings.fontSize] || 1;
    // Native form control chrome (select popups, scrollbars, checkboxes) —
    // applied at the root so it cascades everywhere, not just the one
    // <select> that used to hardcode colorScheme: 'dark' regardless of theme.
    root.style.colorScheme = tokens.colorScheme || 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // persistence is a nice-to-have, not a requirement
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tokens` is derived fresh from `settings` every render, re-running on it too would just be a redundant second pass
  }, [settings]);

  const setPresetId = (presetId) => setSettings(s => ({ ...s, presetId }));
  const setFontSize = (fontSize) => setSettings(s => ({ ...s, fontSize }));
  const setCustomColor = (key, value) =>
    setSettings(s => ({ ...s, customColors: { ...(s.customColors || {}), [key]: value } }));
  const clearCustomColors = () => setSettings(s => ({ ...s, customColors: null }));
  const resetAll = () => setSettings({ presetId: DEFAULT_PRESET_ID, customColors: null, fontSize: 'default' });

  return (
    <ThemeSettingsContext.Provider
      value={{
        presetId: settings.presetId,
        customColors: settings.customColors,
        fontSize: settings.fontSize,
        showPhoto: tokens.showPhoto,
        // The fully-resolved real color values (hex/rgba, NOT CSS var()
        // strings) — for the few places that draw on a <canvas> (Chart.js
        // datasets, the Overview donut's center-text plugin). Canvas 2D's
        // fillStyle/strokeStyle can't resolve var(--x) at all (it isn't part
        // of the DOM cascade), so those call sites need the real value and
        // must be components that call useThemeSettings() themselves so
        // they re-render (and redraw) when this changes. Everywhere else,
        // prefer plain 'var(--x)' strings in inline styles — they resolve
        // natively and repaint with zero extra code.
        tokens,
        setPresetId,
        setFontSize,
        setCustomColor,
        clearCustomColors,
        resetAll,
      }}
    >
      {children}
    </ThemeSettingsContext.Provider>
  );
}
