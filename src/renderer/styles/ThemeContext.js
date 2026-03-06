import React, { createContext, useContext, useState, useCallback } from 'react';
import { setTheme, colors } from './tokens';

const ThemeContext = createContext({ mode: 'light', toggle: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('ll-theme') || 'light'; } catch { return 'light'; }
  });

  // Apply theme tokens + body styles synchronously during render
  setTheme(mode);
  document.body.style.background = colors.bg;
  document.body.style.color = colors.textPrimary;

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('ll-theme', next); } catch {}
      return next;
    });
  }, []);

  return React.createElement(ThemeContext.Provider, { value: { mode, toggle } }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
