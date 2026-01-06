/**
 * Skip Link Component
 *
 * Accessibility feature that allows keyboard users to skip navigation
 * and jump directly to the main content.
 *
 * @see docs/plans/ui/29-accessibility.md keyboard navigation
 */

"use client";

// ============================================
// Types
// ============================================

export interface SkipLinkProps {
  /** Target element ID to skip to (default: "main-content") */
  href?: string;
  /** Link text (default: "Skip to content") */
  children?: React.ReactNode;
}

// ============================================
// Component
// ============================================

/**
 * Skip link for keyboard accessibility.
 *
 * Hidden by default, becomes visible when focused.
 * Allows screen reader and keyboard users to skip
 * navigation and jump to main content.
 *
 * @example
 * ```tsx
 * <SkipLink />
 * <Navigation />
 * <main id="main-content">
 *   ...
 * </main>
 * ```
 */
export function SkipLink({ href = "#main-content", children = "Skip to content" }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="
        sr-only
        focus:not-sr-only
        focus:fixed
        focus:top-4
        focus:left-4
        focus:z-50
        focus:px-4
        focus:py-2
        focus:text-sm
        focus:font-medium
        focus:text-white
        focus:bg-blue-600
        focus:rounded-md
        focus:shadow-lg
        focus:outline-none
        focus:ring-2
        focus:ring-blue-500
        focus:ring-offset-2
        focus:ring-offset-white
        dark:focus:ring-offset-night-900
      "
    >
      {children}
    </a>
  );
}

// ============================================
// Exports
// ============================================

export default SkipLink;
