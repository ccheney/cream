/**
 * Query Error Boundary
 *
 * Integrates TanStack Query's error reset with React error boundaries.
 * Automatically resets queries when the boundary recovers.
 *
 * @see https://tanstack.com/query/latest/docs/react/reference/QueryErrorResetBoundary
 */

"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { ErrorBoundary } from "./error-boundary";

// ============================================
// Types
// ============================================

export interface QueryErrorBoundaryProps {
  /** Children to wrap */
  children: ReactNode;
  /** Optional title for the error state */
  title?: string;
  /** Optional custom fallback (overrides default ErrorState) */
  fallback?: ReactNode;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Whether to show retry button (default: true) */
  showRetry?: boolean;
  /** Additional action buttons */
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  }>;
}

// ============================================
// Component
// ============================================

/**
 * Error boundary that integrates with TanStack Query.
 *
 * When an error is caught and the user clicks retry,
 * all failed queries within the boundary will be refetched.
 *
 * @example
 * ```tsx
 * <QueryErrorBoundary title="Failed to load positions">
 *   <PositionsTable />
 * </QueryErrorBoundary>
 * ```
 *
 * @example With custom actions
 * ```tsx
 * <QueryErrorBoundary
 *   title="Failed to load data"
 *   actions={[
 *     { label: "Go to Dashboard", onClick: () => router.push("/dashboard") }
 *   ]}
 * >
 *   <DataComponent />
 * </QueryErrorBoundary>
 * ```
 */
export function QueryErrorBoundary({
  children,
  title = "Something went wrong",
  fallback,
  onError,
  showRetry = true,
  actions,
}: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onError={onError ? (error) => onError(error) : undefined}
          onReset={reset}
          fallback={({ error, reset: boundaryReset }) => {
            if (fallback) {
              return fallback;
            }

            return (
              <ErrorState
                title={title}
                message={error.message}
                onRetry={showRetry ? boundaryReset : undefined}
                actions={actions}
              />
            );
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

// ============================================
// Exports
// ============================================

export default QueryErrorBoundary;
