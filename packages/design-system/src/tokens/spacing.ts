/**
 * Spacing Tokens
 *
 * 8px base spacing system for consistent layouts.
 * Based on docs/plans/ui/32-design-appendix.md
 */

/**
 * Base unit for spacing calculations (in pixels).
 */
export const SPACING_BASE = 8;

/**
 * Spacing scale based on 8px base unit.
 *
 * Usage:
 * - spacing[0] = 0px (none)
 * - spacing[1] = 4px (0.5 * base)
 * - spacing[2] = 8px (1 * base)
 * - spacing[3] = 12px (1.5 * base)
 * - spacing[4] = 16px (2 * base)
 * - spacing[6] = 24px (3 * base)
 * - spacing[8] = 32px (4 * base)
 * - spacing[12] = 48px (6 * base)
 * - spacing[16] = 64px (8 * base)
 * - spacing[24] = 96px (12 * base)
 * - spacing[32] = 128px (16 * base)
 */
export const spacing = {
  0: "0px",
  px: "1px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  2.5: "10px",
  3: "12px",
  3.5: "14px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "28px",
  8: "32px",
  9: "36px",
  10: "40px",
  11: "44px",
  12: "48px",
  14: "56px",
  16: "64px",
  20: "80px",
  24: "96px",
  28: "112px",
  32: "128px",
  36: "144px",
  40: "160px",
  44: "176px",
  48: "192px",
  52: "208px",
  56: "224px",
  60: "240px",
  64: "256px",
  72: "288px",
  80: "320px",
  96: "384px",
} as const;

/**
 * Semantic spacing tokens for common use cases.
 */
export const spacingTokens = {
  /** Minimal spacing between related elements */
  xs: spacing[1], // 4px
  /** Small spacing for tight layouts */
  sm: spacing[2], // 8px
  /** Medium spacing for standard gaps */
  md: spacing[4], // 16px
  /** Large spacing for section separation */
  lg: spacing[6], // 24px
  /** Extra large spacing for major sections */
  xl: spacing[8], // 32px
  /** 2x extra large for page-level spacing */
  "2xl": spacing[12], // 48px
  /** 3x extra large for hero sections */
  "3xl": spacing[16], // 64px
} as const;

/**
 * Component-specific spacing.
 */
export const componentSpacing = {
  /** Button internal padding */
  buttonPadding: {
    x: spacing[4], // 16px horizontal
    y: spacing[2], // 8px vertical
  },
  /** Card internal padding */
  cardPadding: spacing[4], // 16px
  /** Input field padding */
  inputPadding: {
    x: spacing[3], // 12px horizontal
    y: spacing[2], // 8px vertical
  },
  /** Stack gap between items */
  stackGap: spacing[3], // 12px
  /** Grid gap between cells */
  gridGap: spacing[4], // 16px
} as const;

export type Spacing = typeof spacing;
export type SpacingTokens = typeof spacingTokens;
