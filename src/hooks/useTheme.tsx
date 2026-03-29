import React, { createContext, useContext } from 'react';

const darkTheme = {
  background: '#0a0b10',
  surface: '#131825',
  surfaceAlt: '#1a1f2e',
  border: '#2a2d3e',
  text: '#e2e8f0',
  textSecondary: '#6b7280',
  accent: '#4f8eff',
  accentGreen: '#10b981',
  accentAmber: '#f59e0b',
  accentRed: '#ef4444',
  accentPurple: '#8b5cf6',
  userBubble: '#4f8eff',
  agentBubble: '#1e2738',
};

const ThemeContext = createContext({ colors: darkTheme });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ colors: darkTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
