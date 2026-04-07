'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored !== 'light';
    setDark(isDark);
    document.documentElement.classList.toggle('theme-light', !isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('theme-light', !next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        border: dark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.15)',
        color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
      }}
    >
      <span style={{ fontSize: 14 }}>{dark ? '☀️' : '🌙'}</span>
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}
