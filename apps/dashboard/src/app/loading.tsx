/**
 * Full-page Loading Component
 *
 * Next.js App Router loading.tsx for route transitions.
 * Displays centered Cream logo with pulse animation.
 *
 * @see docs/plans/ui/28-states.md lines 42-44
 */

import { LoadingLogo } from "../components/ui/logo";

// ============================================
// Keyframes (inline for SSR)
// ============================================

const pulseKeyframes = `
  @keyframes logo-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-container * {
      animation: none !important;
    }
  }
`;

// ============================================
// Component
// ============================================

/**
 * Full-page loading component.
 *
 * Used by Next.js App Router during route transitions.
 * Shows centered Cream logo with subtle pulse animation.
 */
export default function Loading() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <div
        className="loading-container"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--background, #ffffff)",
          zIndex: 50,
        }}
        role="status"
        aria-live="polite"
        aria-label="Loading page..."
        data-testid="page-loading"
      >
        <LoadingLogo size="xl" variant="icon" label="Loading page..." testId="page-loading-logo" />
      </div>
    </>
  );
}
