import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const themes = {
  indigo: { name: "Classic PayWise", primary: "#4f46e5", bg: "#f9fafb", accent: "#6366f1" },
  ocean: { name: "Calm & Cool", primary: "#0891b2", bg: "#ecfeff", accent: "#06b6d4" },
  forest: { name: "Fresh Start", primary: "#16a34a", bg: "#f0fdf4", accent: "#22c55e" },
  sunset: { name: "Warm Energy", primary: "#ea580c", bg: "#fff7ed", accent: "#f97316" },
  midnight: { name: "Dark Mode", primary: "#818cf8", bg: "#1e1b4b", accent: "#a5b4fc" },
} as const;

export type ThemeName = keyof typeof themes;
interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: typeof themes;
}
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "paywise-theme";

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && value in themes;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return isThemeName(saved) ? saved : "indigo";
  });

  useEffect(() => {
    const root = document.documentElement;
    const colors = themes[theme];
    root.style.setProperty("--color-primary", colors.primary);
    root.style.setProperty("--color-bg", colors.bg);
    root.style.setProperty("--color-accent", colors.accent);
    root.style.setProperty("--color-text", theme === "midnight" ? "#e2e8f0" : "#111827");
    root.style.colorScheme = theme === "midnight" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "paywise-theme-overrides";
    style.textContent = `
      .bg-indigo-600 { background-color: var(--color-primary) !important; }
      .bg-indigo-600:hover, .hover\\:bg-indigo-700:hover { background-color: var(--color-accent) !important; }
      .text-indigo-600 { color: var(--color-primary) !important; }
      .text-indigo-700 { color: var(--color-primary) !important; }
      .border-indigo-500 { border-color: var(--color-primary) !important; }
      .border-indigo-300 { border-color: color-mix(in srgb, var(--color-primary) 35%, transparent) !important; }
      .bg-gray-50 { background-color: var(--color-bg) !important; }
      html[data-theme="midnight"] body { background: var(--color-bg) !important; color: var(--color-text) !important; }
      html[data-theme="midnight"] .bg-white { background-color: #312e81 !important; }
      html[data-theme="midnight"] .text-gray-900, html[data-theme="midnight"] .text-gray-800 { color: var(--color-text) !important; }
      html[data-theme="midnight"] .text-gray-500, html[data-theme="midnight"] .text-gray-600, html[data-theme="midnight"] .text-gray-700 { color: #cbd5e1 !important; }
      html[data-theme="midnight"] .border-gray-200, html[data-theme="midnight"] .border-gray-300 { border-color: #4338ca !important; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme, themes }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
