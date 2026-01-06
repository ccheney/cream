/**
 * Motion Tokens
 *
 * Animation timing, durations, and easing functions.
 * Based on docs/plans/ui/32-design-appendix.md
 */

/**
 * Animation durations (in milliseconds).
 */
export const duration = {
  /** Instant feedback (hover states) */
  instant: "75ms",
  /** Fast transitions (buttons, toggles) */
  fast: "150ms",
  /** Normal transitions (modals, dropdowns) */
  normal: "200ms",
  /** Slow transitions (page transitions, complex animations) */
  slow: "300ms",
  /** Very slow (skeleton loaders, progress) */
  slower: "500ms",
} as const;

/**
 * Easing functions for different animation types.
 */
export const easing = {
  /** Linear - constant speed */
  linear: "linear",
  /** Default ease - natural feel */
  default: "ease",
  /** Ease in - slow start */
  in: "ease-in",
  /** Ease out - slow end (recommended for most UI) */
  out: "ease-out",
  /** Ease in-out - slow start and end */
  inOut: "ease-in-out",
  /** Custom cubic-bezier for snappy interactions */
  snappy: "cubic-bezier(0.2, 0, 0, 1)",
  /** Bounce effect for playful animations */
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Smooth deceleration */
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * Pre-composed transition values.
 */
export const transition = {
  /** Default transition for most elements */
  default: `all ${duration.normal} ${easing.out}`,
  /** Fast transition for hover effects */
  fast: `all ${duration.fast} ${easing.out}`,
  /** Color transitions (background, border, text) */
  colors: `color ${duration.fast} ${easing.out}, background-color ${duration.fast} ${easing.out}, border-color ${duration.fast} ${easing.out}`,
  /** Transform transitions (scale, rotate, translate) */
  transform: `transform ${duration.normal} ${easing.snappy}`,
  /** Opacity transitions (fade in/out) */
  opacity: `opacity ${duration.normal} ${easing.out}`,
  /** None - disable transitions */
  none: "none",
} as const;

/**
 * Animation keyframe definitions.
 */
export const keyframes = {
  /** Fade in animation */
  fadeIn: {
    from: { opacity: "0" },
    to: { opacity: "1" },
  },
  /** Fade out animation */
  fadeOut: {
    from: { opacity: "1" },
    to: { opacity: "0" },
  },
  /** Slide in from right */
  slideInRight: {
    from: { transform: "translateX(100%)", opacity: "0" },
    to: { transform: "translateX(0)", opacity: "1" },
  },
  /** Slide in from bottom */
  slideInBottom: {
    from: { transform: "translateY(100%)", opacity: "0" },
    to: { transform: "translateY(0)", opacity: "1" },
  },
  /** Scale up (for modals) */
  scaleIn: {
    from: { transform: "scale(0.95)", opacity: "0" },
    to: { transform: "scale(1)", opacity: "1" },
  },
  /** Shimmer effect for skeleton loaders */
  shimmer: {
    "0%": { backgroundPosition: "-200% 0" },
    "100%": { backgroundPosition: "200% 0" },
  },
  /** Pulse animation */
  pulse: {
    "0%, 100%": { opacity: "1" },
    "50%": { opacity: "0.5" },
  },
  /** Spin animation */
  spin: {
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
  },
} as const;

/**
 * Pre-defined animations using keyframes.
 */
export const animation = {
  fadeIn: `fadeIn ${duration.normal} ${easing.out}`,
  fadeOut: `fadeOut ${duration.normal} ${easing.out}`,
  slideInRight: `slideInRight ${duration.slow} ${easing.snappy}`,
  slideInBottom: `slideInBottom ${duration.slow} ${easing.snappy}`,
  scaleIn: `scaleIn ${duration.normal} ${easing.snappy}`,
  shimmer: `shimmer 1.5s ${easing.linear} infinite`,
  pulse: `pulse 2s ${easing.inOut} infinite`,
  spin: `spin 1s ${easing.linear} infinite`,
} as const;

export type Duration = typeof duration;
export type Easing = typeof easing;
export type Transition = typeof transition;
export type Animation = typeof animation;
