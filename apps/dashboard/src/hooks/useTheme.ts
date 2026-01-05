/**
 * Theme Hook
 *
 * Manages light/dark/system theme preferences with localStorage persistence.
 *
 * @see docs/plans/ui/30-themes.md
 */

"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

/**
 * Get the resolved theme (accounting for system preference)
 */
function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  return theme;
}

/**
 * Apply theme to document
 */
function applyTheme(resolvedTheme: "light" | "dark"): void {
  if (typeof document === "undefined") {
    return;
  }

  // Add transition class for smooth theme change
  document.documentElement.classList.add("transitioning");

  document.documentElement.setAttribute("data-theme", resolvedTheme);

  if (resolvedTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  // Remove transition class after animation
  setTimeout(() => {
    document.documentElement.classList.remove("transitioning");
  }, 200);
}

/**
 * Hook for managing theme state
 *
 * @example
 * ```tsx
 * const { theme, resolvedTheme, setTheme } = useTheme();
 *
 * return (
 *   <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
 *     Toggle ({resolvedTheme})
 *   </button>
 * );
 * ```
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    setMounted(true);

    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initialTheme = stored || "system";

    setThemeState(initialTheme);
    const resolved = getResolvedTheme(initialTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);

    const resolved = getResolvedTheme(newTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme,
    mounted,
  };
}

export default useTheme;
