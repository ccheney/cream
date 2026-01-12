/**
 * Utility Functions
 *
 * Common utility functions used across the dashboard app.
 */

/**
 * Merges class names, filtering out falsy values.
 * Simple alternative to clsx/classnames without external dependencies.
 *
 * @param classes - Class names to merge (strings, booleans, null, undefined)
 * @returns Merged class string
 *
 * @example
 * cn("base", isActive && "active", undefined, "final")
 * // => "base active final"
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
