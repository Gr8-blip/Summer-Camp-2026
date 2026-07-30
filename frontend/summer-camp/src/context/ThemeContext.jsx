import { createContext, useContext, useState, useCallback } from "react";

// One source of truth for the active theme key. Any page can call
// setTheme() (e.g. right after an equip action in the Marketplace) and
// the whole app re-skins instantly via the data-theme attribute — no
// per-page CSS work needed since every component already reads
// var(--color-*) custom properties. See themes.css for the palette map.

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem("equipped_theme") || "default_light"
  );


  const setTheme = useCallback((key) => {
    setThemeState(key);
    localStorage.setItem("equipped_theme", key); // cache so it applies instantly on next load, before the profile fetch resolves
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}