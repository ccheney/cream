/**
 * Type Exports
 *
 * TypeScript types for design system components.
 */

// Re-export types from config
export type { TailwindConfig } from "../config/tailwind";
// Re-export types from tokens
export type {
  ColorPalette,
  SemanticColors,
} from "../tokens/colors";
export type {
  Animation,
  Duration,
  Easing,
  Transition,
} from "../tokens/motion";
export type {
  BorderRadius,
  ComponentRadius,
} from "../tokens/radius";
export type {
  Spacing,
  SpacingTokens,
} from "../tokens/spacing";
export type {
  FontFamily,
  FontSize,
  FontWeight,
  TextStyles,
} from "../tokens/typography";

/**
 * Theme mode type.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * Trading status for color coding.
 */
export type TradingStatus = "profit" | "loss" | "neutral";

/**
 * Status variants for notifications and badges.
 */
export type StatusVariant = "success" | "warning" | "error" | "info";

/**
 * Size variants for components.
 */
export type SizeVariant = "xs" | "sm" | "md" | "lg" | "xl";
