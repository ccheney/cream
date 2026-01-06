/**
 * Tailwind CSS Configuration
 *
 * Shared Tailwind configuration with design tokens.
 * Import this in your tailwind.config.ts.
 */

import { darkColors, lightColors, palette } from "../tokens/colors";
import { animation, duration, easing, keyframes } from "../tokens/motion";
import { spacing, spacingTokens } from "../tokens/spacing";
import { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight } from "../tokens/typography";

/**
 * Tailwind theme configuration using design tokens.
 */
export const tailwindConfig = {
  theme: {
    // Color palette
    colors: {
      ...palette,
      // Semantic colors available via CSS variables
      // Use: text-[var(--color-text-primary)]
    },

    // Spacing scale
    spacing,

    // Typography
    fontFamily: {
      sans: fontFamily.sans.split(", "),
      mono: fontFamily.mono.split(", "),
    },
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,

    // Motion
    transitionDuration: {
      0: "0ms",
      75: duration.instant,
      150: duration.fast,
      200: duration.normal,
      300: duration.slow,
      500: duration.slower,
    },
    transitionTimingFunction: {
      linear: easing.linear,
      DEFAULT: easing.default,
      in: easing.in,
      out: easing.out,
      "in-out": easing.inOut,
      snappy: easing.snappy,
      bounce: easing.bounce,
      smooth: easing.smooth,
    },

    // Animations
    animation: {
      none: "none",
      "fade-in": animation.fadeIn,
      "fade-out": animation.fadeOut,
      "slide-in-right": animation.slideInRight,
      "slide-in-bottom": animation.slideInBottom,
      "scale-in": animation.scaleIn,
      shimmer: animation.shimmer,
      pulse: animation.pulse,
      spin: animation.spin,
    },
    keyframes: {
      fadeIn: keyframes.fadeIn,
      fadeOut: keyframes.fadeOut,
      slideInRight: keyframes.slideInRight,
      slideInBottom: keyframes.slideInBottom,
      scaleIn: keyframes.scaleIn,
      shimmer: keyframes.shimmer,
      pulse: keyframes.pulse,
      spin: keyframes.spin,
    },

    // Extend default theme
    extend: {
      // Semantic spacing tokens as custom values
      spacing: spacingTokens,
    },
  },
} as const;

export type TailwindConfig = typeof tailwindConfig;

/**
 * CSS variables to add to :root and .dark
 */
export const cssVariables = {
  light: {
    // Backgrounds
    "--color-bg-primary": lightColors.bg.primary,
    "--color-bg-secondary": lightColors.bg.secondary,
    "--color-bg-tertiary": lightColors.bg.tertiary,
    "--color-bg-inverse": lightColors.bg.inverse,
    // Text
    "--color-text-primary": lightColors.text.primary,
    "--color-text-secondary": lightColors.text.secondary,
    "--color-text-tertiary": lightColors.text.tertiary,
    "--color-text-inverse": lightColors.text.inverse,
    // Borders
    "--color-border-default": lightColors.border.default,
    "--color-border-subtle": lightColors.border.subtle,
    "--color-border-strong": lightColors.border.strong,
    // Trading
    "--color-trading-profit": lightColors.trading.profit,
    "--color-trading-profit-bg": lightColors.trading.profitBg,
    "--color-trading-loss": lightColors.trading.loss,
    "--color-trading-loss-bg": lightColors.trading.lossBg,
    "--color-trading-neutral": lightColors.trading.neutral,
    "--color-trading-neutral-bg": lightColors.trading.neutralBg,
    // Accent
    "--color-accent-primary": lightColors.accent.primary,
    "--color-accent-primary-hover": lightColors.accent.primaryHover,
    "--color-accent-primary-bg": lightColors.accent.primaryBg,
    // Status
    "--color-status-success": lightColors.status.success,
    "--color-status-warning": lightColors.status.warning,
    "--color-status-error": lightColors.status.error,
    "--color-status-info": lightColors.status.info,
  },
  dark: {
    // Backgrounds
    "--color-bg-primary": darkColors.bg.primary,
    "--color-bg-secondary": darkColors.bg.secondary,
    "--color-bg-tertiary": darkColors.bg.tertiary,
    "--color-bg-inverse": darkColors.bg.inverse,
    // Text
    "--color-text-primary": darkColors.text.primary,
    "--color-text-secondary": darkColors.text.secondary,
    "--color-text-tertiary": darkColors.text.tertiary,
    "--color-text-inverse": darkColors.text.inverse,
    // Borders
    "--color-border-default": darkColors.border.default,
    "--color-border-subtle": darkColors.border.subtle,
    "--color-border-strong": darkColors.border.strong,
    // Trading
    "--color-trading-profit": darkColors.trading.profit,
    "--color-trading-profit-bg": darkColors.trading.profitBg,
    "--color-trading-loss": darkColors.trading.loss,
    "--color-trading-loss-bg": darkColors.trading.lossBg,
    "--color-trading-neutral": darkColors.trading.neutral,
    "--color-trading-neutral-bg": darkColors.trading.neutralBg,
    // Accent
    "--color-accent-primary": darkColors.accent.primary,
    "--color-accent-primary-hover": darkColors.accent.primaryHover,
    "--color-accent-primary-bg": darkColors.accent.primaryBg,
    // Status
    "--color-status-success": darkColors.status.success,
    "--color-status-warning": darkColors.status.warning,
    "--color-status-error": darkColors.status.error,
    "--color-status-info": darkColors.status.info,
  },
} as const;
