/**
 * Theme Toggle Component
 *
 * Three-way toggle for light/dark/system theme preferences.
 *
 * @see docs/plans/ui/30-themes.md
 */

"use client";

import { type Theme, useTheme } from "../../hooks/useTheme";

// ============================================
// Types
// ============================================

export interface ThemeToggleProps {
  /** Compact mode shows only icons */
  compact?: boolean;
  /** Test ID for testing */
  testId?: string;
}

// ============================================
// Icons
// ============================================

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    padding: "4px",
    backgroundColor: "var(--bg-elevated)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border-default)",
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "var(--radius-md)",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
    transition: "all 0.15s ease",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
  },
  buttonActive: {
    backgroundColor: "var(--bg-card)",
    color: "var(--text-primary)",
    boxShadow: "var(--shadow-sm)",
  },
  buttonCompact: {
    padding: "6px",
  },
};

// ============================================
// Component
// ============================================

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
];

/**
 * Theme toggle with light/dark/system options.
 *
 * @example
 * ```tsx
 * <ThemeToggle />
 * <ThemeToggle compact />
 * ```
 */
export function ThemeToggle({ compact = false, testId = "theme-toggle" }: ThemeToggleProps) {
  const { theme, setTheme, mounted } = useTheme();

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div style={styles.container} data-testid={testId}>
        {THEMES.map(({ value, icon }) => (
          <button
            key={value}
            type="button"
            style={{
              ...styles.button,
              ...(compact ? styles.buttonCompact : {}),
            }}
            disabled
          >
            {icon}
            {!compact && <span>{value}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      style={styles.container}
      role="radiogroup"
      aria-label="Theme selection"
      data-testid={testId}
    >
      {THEMES.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={`${label} theme`}
          onClick={() => setTheme(value)}
          style={{
            ...styles.button,
            ...(compact ? styles.buttonCompact : {}),
            ...(theme === value ? styles.buttonActive : {}),
          }}
        >
          {icon}
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}

export default ThemeToggle;
