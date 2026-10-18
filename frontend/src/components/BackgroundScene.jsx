import React from 'react';
import { useThemeSettings } from '../contexts/ThemeSettingsContext';

/** The one cinematic backdrop used on every full-screen shell (Dashboard,
 * the public homepage, Login, FeaturePage) — same photo, same blue-tinted
 * overlay and glow, so the app reads as one consistent place rather than a
 * different background per screen. Sits behind everything as a fixed,
 * pointer-events-none layer; cards/panels float on top with their own
 * (translucent, blurred) surfaces.
 *
 * Only shown for dark-leaning themes (see themePresets.js's `showPhoto`).
 * A light-leaning theme's cards are a near-opaque light "glass"
 * (--panel-glass) meant to sit on a plain surface — over the dark photo
 * they'd blend toward a washed-out gray instead of reading as clean and
 * light, so those themes get a flat var(--bg-deep) fill instead. */
export default function BackgroundScene() {
  const { showPhoto } = useThemeSettings();

  if (!showPhoto) {
    return <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: 'var(--bg-deep)' }} />;
  }

  return (
    <div className="bg-scene fixed inset-0 z-0 pointer-events-none" style={{ background: 'var(--bg-deep)' }}>
      <img
        alt=""
        aria-hidden="true"
        className="w-full h-full object-cover opacity-30 blur-[2px] grayscale-[0.5]"
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDEWILRykNmHUpQucQP5JNacRYS2CiwfCY56B7fZbBw4FCmci4JmVWGESTjUw1zdOEZf8DGAK59wIw69U9YKoMS7q8UCZ6no8ZCuu90woEojIzenwyL8N7wtPfrWKzuXusHU0B6OUNcn4UY66VlDHgJK6VWeCU_tb3-bfzyvfs_ju0u7_Qh6AhdKhS4WmET38jTpvmB6BomDTxV-brtg6h7fw8tMZtxhJkKSSLYTAczqAjx1iVt3IlOpcJn7K1CVYu7RQWeof0rQFCj"
      />
      {/* Blue-tinted vignette (not a plain black one) so the photo reads as
          part of this app's brand, not a generic dark backdrop. */}
      <div className="absolute inset-0 mix-blend-multiply" style={{ background: 'radial-gradient(circle at center, rgba(15, 40, 90, 0.45) 0%, rgba(2, 6, 23, 0.98) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(2, 6, 23, 1) 0%, transparent 40%, transparent 100%)' }} />
      <div className="absolute top-1/4 -left-20 w-96 h-96 opacity-[0.18] rounded-full blur-[120px]" style={{ background: 'var(--accent)' }} />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 opacity-[0.14] rounded-full blur-[120px]" style={{ background: 'var(--accent-2)' }} />
    </div>
  );
}
