/**
 * Border Radius Tokens
 *
 * Gentle curves system for consistent border radii.
 * Based on docs/plans/ui/23-layout.md
 */

/**
 * Border radius scale.
 *
 * Design philosophy: Gentle curves, never fully rounded.
 * Exception: avatars, indicators, pills use radius-full.
 *
 * Usage:
 * - radius.sm = 4px (buttons, badges)
 * - radius.md = 8px (cards, inputs)
 * - radius.lg = 12px (modals, larger containers)
 * - radius.xl = 16px (hero elements)
 * - radius.full = 9999px (pills, avatars, dots)
 */
export const borderRadius = {
  /** No border radius */
  none: "0px",
  /** Small radius for buttons, badges (4px) */
  sm: "4px",
  /** Medium radius for cards, inputs (8px) */
  md: "8px",
  /** Large radius for modals, containers (12px) */
  lg: "12px",
  /** Extra large radius for hero elements (16px) */
  xl: "16px",
  /** 2x extra large radius (24px) */
  "2xl": "24px",
  /** Full radius for pills, avatars, dots (9999px) */
  full: "9999px",
} as const;

/**
 * Component-specific border radius recommendations.
 */
export const componentRadius = {
  /** Button border radius */
  button: borderRadius.sm,
  /** Badge border radius */
  badge: borderRadius.sm,
  /** Card border radius */
  card: borderRadius.md,
  /** Input field border radius */
  input: borderRadius.md,
  /** Modal border radius */
  modal: borderRadius.lg,
  /** Dropdown menu border radius */
  dropdown: borderRadius.md,
  /** Tooltip border radius */
  tooltip: borderRadius.sm,
  /** Avatar border radius (circular) */
  avatar: borderRadius.full,
  /** Pill/tag border radius */
  pill: borderRadius.full,
  /** Indicator dot border radius */
  dot: borderRadius.full,
} as const;

export type BorderRadius = typeof borderRadius;
export type ComponentRadius = typeof componentRadius;
