// Small color-math helpers for the Appearance settings' custom-color
// pickers — derive a full set of CSS tokens (a "-2"/"-3" tier, a "-dim"
// tint) from ONE base hex the user picks, instead of asking them to pick
// 20 colors by hand.

/** Read a CSS custom property's CURRENT resolved value straight off
 * <html> — for the rare spot that needs a real color string rather than a
 * live 'var(--x)' reference (concatenating a hex alpha suffix like `${c}22`,
 * or anywhere outside a style prop/SVG attribute that can't resolve var()
 * itself). Re-run this on every render that needs it; it always reflects
 * whatever Settings -> Appearance last applied. */
export function cssVar(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function toHex({ r, g, b }) {
  const c = v => v.toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amt in [-1,1]: positive lightens toward white, negative darkens toward black. */
export function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newL = Math.min(1, Math.max(0, l + amt));
  return toHex(hslToRgb(h, s, newL));
}

/** Rough relative luminance -> is this color "light" (needs dark text on it)? */
export function isLight(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** Given one picked background hex and one picked text hex, derive the
 * secondary/tertiary text tiers by fading the text color toward middle gray
 * — keeps the three-tier hierarchy readable regardless of which two colors
 * were picked. Pivots on the TEXT color's own lightness (not the
 * background's): light text (typically on a dark bg) fades by dimming
 * further toward black; dark text (typically on a light bg) fades by
 * lightening further toward white. Using the background's lightness here
 * instead would push an already-near-white text color toward MORE white,
 * clamping text2/text3 to the same flat #ffffff and collapsing the
 * hierarchy — this way each tier stays visibly distinct. */
export function deriveTextTiers(textHex) {
  const step = isLight(textHex) ? -0.18 : 0.18;
  return {
    text: textHex,
    text2: shade(textHex, step),
    text3: shade(textHex, step * 2),
  };
}

/** Derive the panel/surface/border tiers from one picked background hex. */
export function deriveSurfaceTiers(bgHex) {
  const light = isLight(bgHex);
  const dir = light ? -1 : 1; // dark theme lightens surfaces slightly; light theme darkens them slightly
  return {
    bgDeep: bgHex,
    bgPanel: shade(bgHex, dir * 0.04),
    surface: light ? withAlpha('#0f172a', 0.03) : 'rgba(255,255,255,0.03)',
    surface2: light ? withAlpha('#0f172a', 0.05) : 'rgba(255,255,255,0.05)',
    border: light ? withAlpha('#0f172a', 0.1) : 'rgba(255,255,255,0.08)',
    border2: light ? withAlpha('#0f172a', 0.16) : 'rgba(255,255,255,0.14)',
    // Same reasoning as the built-in presets: a light custom background
    // gets a near-opaque light glass and no photo behind it; a dark one
    // keeps the translucent dark glass over the cinematic scene.
    panelGlass: light ? withAlpha('#ffffff', 0.9) : withAlpha('#232529', 0.45),
    showPhoto: !light,
    colorScheme: light ? 'light' : 'dark',
  };
}

/** Derive the accent family (hover/strong/dim) from one picked accent hex. */
export function deriveAccentTiers(accentHex) {
  return {
    accent: accentHex,
    accent2: shade(accentHex, 0.12),
    accentStrong: shade(accentHex, -0.12),
    accentDim: withAlpha(accentHex, 0.12),
  };
}
