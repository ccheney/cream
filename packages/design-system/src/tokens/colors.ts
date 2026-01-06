/**
 * Color Tokens
 *
 * Semantic color mappings for light and dark modes.
 * Based on docs/plans/ui/21-color-system.md
 */

/**
 * Base color palette (raw values).
 */
export const palette = {
  // Neutral grays
  gray: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  // Trading greens (profit/long)
  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },
  // Trading reds (loss/short)
  red: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },
  // Accent blue (primary actions)
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
  },
  // Warning yellow
  yellow: {
    50: "#fefce8",
    100: "#fef9c3",
    200: "#fef08a",
    300: "#fde047",
    400: "#facc15",
    500: "#eab308",
    600: "#ca8a04",
    700: "#a16207",
    800: "#854d0e",
    900: "#713f12",
  },
} as const;

/**
 * Semantic color tokens for light mode.
 */
export const lightColors = {
  // Backgrounds
  bg: {
    primary: palette.gray[50],
    secondary: palette.gray[100],
    tertiary: palette.gray[200],
    inverse: palette.gray[900],
  },
  // Text
  text: {
    primary: palette.gray[900],
    secondary: palette.gray[600],
    tertiary: palette.gray[400],
    inverse: palette.gray[50],
  },
  // Borders
  border: {
    default: palette.gray[200],
    subtle: palette.gray[100],
    strong: palette.gray[300],
  },
  // Trading
  trading: {
    profit: palette.green[600],
    profitBg: palette.green[50],
    loss: palette.red[600],
    lossBg: palette.red[50],
    neutral: palette.gray[500],
    neutralBg: palette.gray[100],
  },
  // Accent
  accent: {
    primary: palette.blue[600],
    primaryHover: palette.blue[700],
    primaryBg: palette.blue[50],
  },
  // Status
  status: {
    success: palette.green[600],
    warning: palette.yellow[600],
    error: palette.red[600],
    info: palette.blue[600],
  },
} as const;

/**
 * Semantic color tokens for dark mode.
 */
export const darkColors = {
  // Backgrounds
  bg: {
    primary: palette.gray[950],
    secondary: palette.gray[900],
    tertiary: palette.gray[800],
    inverse: palette.gray[100],
  },
  // Text
  text: {
    primary: palette.gray[50],
    secondary: palette.gray[400],
    tertiary: palette.gray[500],
    inverse: palette.gray[900],
  },
  // Borders
  border: {
    default: palette.gray[800],
    subtle: palette.gray[900],
    strong: palette.gray[700],
  },
  // Trading
  trading: {
    profit: palette.green[400],
    profitBg: palette.green[900],
    loss: palette.red[400],
    lossBg: palette.red[900],
    neutral: palette.gray[400],
    neutralBg: palette.gray[800],
  },
  // Accent
  accent: {
    primary: palette.blue[400],
    primaryHover: palette.blue[300],
    primaryBg: palette.blue[900],
  },
  // Status
  status: {
    success: palette.green[400],
    warning: palette.yellow[400],
    error: palette.red[400],
    info: palette.blue[400],
  },
} as const;

export type ColorPalette = typeof palette;
export type SemanticColors = typeof lightColors;
