import { createContext, useContext } from 'react';

// Plain-JS file (not .jsx) so it can export the hook alongside the context
// object without tripping react-refresh's "only export components from a
// .jsx file" rule — see ThemeSettingsProvider.jsx for the actual component.
export const ThemeSettingsContext = createContext(null);

export function useThemeSettings() {
  const ctx = useContext(ThemeSettingsContext);
  if (!ctx) throw new Error('useThemeSettings must be used within a ThemeSettingsProvider');
  return ctx;
}
