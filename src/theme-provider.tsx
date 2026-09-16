import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Theme context for future multi-theme support.
 * Currently hardcoded to "warm-modern" theme (the existing amber-based palette).
 *
 * To extend for multiple themes:
 * 1. Define additional theme palettes in src/index.css using CSS custom properties
 * 2. Add theme switching logic to update document.documentElement.dataset.theme
 * 3. Expand ThemeMapType with new theme identifiers
 * 4. Create corresponding theme switching UI components
 */
interface ThemeContextProps {
  /** Current theme identifier (e.g., "warm-modern", "dark", "light") */
  theme: string;
  /** Function to switch themes (persists selection to localStorage) */
  setTheme: (theme: string) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

/** Available themes (expandable for future themes) */
const THEMES = {
  WARM_MODERN: 'warm-modern',
  // DARK: 'dark',
  // LIGHT: 'light',
} as const;

type ThemeMapType = typeof THEMES;

/** Storage key for theme persistence */
const STORAGE_KEY = 'theme-preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(() => {
    // 1. Check localStorage for saved preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;

    // 2. Check system preference (future use)
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return THEMES.WARM_MODERN; // Fallback to current theme for now
    }

    // 3. Default to warm-modern (current theme)
    return THEMES.WARM_MODERN;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);

    // Future: Apply theme switching logic here
    // Example: document.documentElement.dataset.theme = theme;
    // This would work with CSS like: [data-theme="dark"] { --color-brand-500: #...; }

    console.log(`Theme set to: ${theme}`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * @throws Error if used outside ThemeProvider
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { THEMES };