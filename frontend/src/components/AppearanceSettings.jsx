import React from 'react';
import { useThemeSettings } from '../contexts/ThemeSettingsContext';
import { THEME_PRESETS } from '../constants/themePresets';

const FONT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
];

function PresetSwatch({ id, preset, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className="flex flex-col items-center gap-1.5 p-2 rounded-xl cursor-pointer border transition-colors"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-dim)' : 'transparent',
      }}
    >
      <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)', width: 56, height: 32 }}>
        {preset.swatch.map((c, i) => <div key={i} style={{ background: c, flex: 1 }} />)}
      </div>
      <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: active ? 'var(--accent)' : 'var(--text-2)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{preset.icon}</span>
        {preset.label}
      </span>
    </button>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[11px] font-mono uppercase" style={{ color: 'var(--text-3)' }}>{value}</span>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: 0 }}
        />
      </span>
    </label>
  );
}

export default function AppearanceSettings() {
  const { presetId, customColors, fontSize, setPresetId, setFontSize, setCustomColor, clearCustomColors, resetAll } = useThemeSettings();
  const activePreset = THEME_PRESETS[presetId] || THEME_PRESETS.dark;
  const usingCustom = !!customColors;

  return (
    <div className="flex flex-col gap-5">
      {/* Preset themes */}
      <div>
        <div className="text-[13px] uppercase tracking-[0.15em] mb-2 font-medium" style={{ color: 'var(--accent-2)' }}>Theme</div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(THEME_PRESETS).map(([id, preset]) => (
            <PresetSwatch key={id} id={id} preset={preset} active={presetId === id} onClick={setPresetId} />
          ))}
        </div>
      </div>

      {/* Custom colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] uppercase tracking-[0.15em] font-medium" style={{ color: 'var(--accent-2)' }}>Custom Colors</div>
          <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={usingCustom}
              onChange={e => {
                if (e.target.checked) {
                  setCustomColor('bg', activePreset.bgDeep);
                  setCustomColor('text', activePreset.text);
                  setCustomColor('accent', activePreset.accent);
                } else {
                  clearCustomColors();
                }
              }}
            />
            Override
          </label>
        </div>
        {usingCustom ? (
          <div className="flex flex-col gap-2.5 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <ColorField label="Background" value={customColors.bg || activePreset.bgDeep} onChange={v => setCustomColor('bg', v)} />
            <ColorField label="Text" value={customColors.text || activePreset.text} onChange={v => setCustomColor('text', v)} />
            <ColorField label="Accent" value={customColors.accent || activePreset.accent} onChange={v => setCustomColor('accent', v)} />
            <p className="text-[11px] pt-1" style={{ color: 'var(--text-3)' }}>
              Status colors (LOW/MEDIUM/HIGH risk) stay fixed so they keep meaning the same thing everywhere.
            </p>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>Off — using the "{activePreset.label}" theme's own colors.</p>
        )}
      </div>

      {/* Font size */}
      <div>
        <div className="text-[13px] uppercase tracking-[0.15em] mb-2 font-medium" style={{ color: 'var(--accent-2)' }}>Text Size</div>
        <div className="flex gap-2">
          {FONT_SIZES.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFontSize(f.id)}
              className="flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer border transition-colors"
              style={{
                borderColor: fontSize === f.id ? 'var(--accent)' : 'var(--border)',
                background: fontSize === f.id ? 'var(--accent-dim)' : 'transparent',
                color: fontSize === f.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={resetAll}
        className="text-[12px] font-medium cursor-pointer self-start"
        style={{ color: 'var(--text-3)' }}
      >
        Reset to default (Dark)
      </button>
    </div>
  );
}
