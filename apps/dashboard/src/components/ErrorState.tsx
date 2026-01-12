// biome-ignore-all lint/suspicious/noArrayIndexKey: Action buttons use stable static array
/**
 * Error State Component
 *
 * Reusable error display for data fetching failures and other errors.
 * Styled consistently with the dashboard design system.
 *
 * @see docs/plans/ui/28-states.md
 */

"use client";

import type { ReactNode } from "react";

// ============================================
// Types
// ============================================

export interface ErrorStateAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message */
  message?: string;
  /** Optional hint text */
  hint?: string;
  /** Error code for debugging */
  errorCode?: string;
  /** Retry callback (shows retry button if provided) */
  onRetry?: () => void;
  /** Additional action buttons */
  actions?: ErrorStateAction[];
  /** Size variant */
  size?: "compact" | "default" | "full";
  /** Custom icon (default: warning icon) */
  icon?: ReactNode;
  /** Test ID */
  testId?: string;
}

// ============================================
// Icons
// ============================================

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ============================================
// Component
// ============================================

/**
 * Error state component for displaying errors in the UI.
 *
 * @example Basic usage
 * ```tsx
 * <ErrorState
 *   title="Failed to load positions"
 *   message="Unable to connect to the server"
 *   onRetry={() => refetch()}
 * />
 * ```
 *
 * @example With custom actions
 * ```tsx
 * <ErrorState
 *   title="Data not found"
 *   message="The requested resource could not be found."
 *   actions={[
 *     { label: "Go Back", onClick: () => router.back(), variant: "primary" },
 *     { label: "Home", onClick: () => router.push("/"), variant: "secondary" },
 *   ]}
 * />
 * ```
 *
 * @example Compact variant
 * ```tsx
 * <ErrorState
 *   size="compact"
 *   message="Failed to load chart data"
 *   onRetry={refetch}
 * />
 * ```
 */
export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  hint,
  errorCode,
  onRetry,
  actions = [],
  size = "default",
  icon,
  testId = "error-state",
}: ErrorStateProps) {
  const isCompact = size === "compact";
  const isFull = size === "full";

  // Combine retry with custom actions
  const allActions: ErrorStateAction[] = [
    ...(onRetry ? [{ label: "Try Again", onClick: onRetry, variant: "primary" as const }] : []),
    ...actions,
  ];

  return (
    <div
      role="alert"
      data-testid={testId}
      className={`
        flex flex-col items-center justify-center text-center
        ${isCompact ? "py-6 px-4" : isFull ? "py-16 px-8 min-h-[400px]" : "py-12 px-6"}
        ${isFull ? "bg-cream-50 dark:bg-night-900 rounded-lg" : ""}
      `}
    >
      {/* Icon */}
      <div
        className={`
          text-red-500 dark:text-red-400
          ${isCompact ? "mb-3" : "mb-4"}
        `}
      >
        {icon ?? <WarningIcon className={isCompact ? "w-8 h-8" : "w-12 h-12"} />}
      </div>

      {/* Title */}
      {!isCompact && (
        <h3
          className={`
            font-semibold text-stone-900 dark:text-night-50
            ${isFull ? "text-xl" : "text-lg"}
            mb-2
          `}
        >
          {title}
        </h3>
      )}

      {/* Message */}
      <p
        className={`
          text-stone-600 dark:text-night-200
          ${isCompact ? "text-sm" : "text-base"}
          max-w-md
        `}
      >
        {isCompact ? message : message}
      </p>

      {/* Hint */}
      {hint && !isCompact && (
        <p className="text-sm text-stone-500 dark:text-night-300 dark:text-stone-500 dark:text-night-300 mt-2 max-w-md">
          {hint}
        </p>
      )}

      {/* Error Code */}
      {errorCode && (
        <p className="text-xs text-stone-400 dark:text-night-400 dark:text-stone-600 dark:text-night-200 mt-2 font-mono">
          Error: {errorCode}
        </p>
      )}

      {/* Actions */}
      {allActions.length > 0 && (
        <div className={`flex items-center gap-3 ${isCompact ? "mt-4" : "mt-6"}`}>
          {allActions.map((action, index) => (
            <button
              key={`action-${index}`}
              type="button"
              onClick={action.onClick}
              className={`
                inline-flex items-center gap-2
                ${isCompact ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm"}
                font-medium rounded-md transition-colors
                ${
                  action.variant === "secondary"
                    ? "text-stone-700 dark:text-night-100 bg-cream-100 dark:bg-night-700 hover:bg-cream-200 dark:hover:bg-night-600 border border-cream-200 dark:border-night-600"
                    : "text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                }
              `}
              data-testid={`${testId}-action-${index}`}
            >
              {action.label === "Try Again" && <RefreshIcon className="w-4 h-4" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Specialized Variants
// ============================================

/**
 * Error state for network/connection errors.
 */
export function ConnectionError({
  onRetry,
  testId = "connection-error",
}: {
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <ErrorState
      title="Connection Failed"
      message="Unable to connect to the server. Please check your internet connection."
      hint="If the problem persists, the server may be temporarily unavailable."
      onRetry={onRetry}
      testId={testId}
    />
  );
}

/**
 * Error state for not found errors (404).
 */
export function NotFoundError({
  resource = "resource",
  onBack,
  testId = "not-found-error",
}: {
  resource?: string;
  onBack?: () => void;
  testId?: string;
}) {
  return (
    <ErrorState
      title="Not Found"
      message={`The requested ${resource} could not be found.`}
      hint="It may have been moved or deleted."
      actions={onBack ? [{ label: "Go Back", onClick: onBack, variant: "secondary" }] : []}
      testId={testId}
    />
  );
}

/**
 * Error state for permission/authorization errors (403).
 */
export function PermissionError({
  onBack,
  testId = "permission-error",
}: {
  onBack?: () => void;
  testId?: string;
}) {
  return (
    <ErrorState
      title="Access Denied"
      message="You don't have permission to access this resource."
      hint="Contact your administrator if you believe this is a mistake."
      actions={onBack ? [{ label: "Go Back", onClick: onBack, variant: "secondary" }] : []}
      testId={testId}
    />
  );
}

/**
 * Error state for server errors (500).
 */
export function ServerError({
  onRetry,
  testId = "server-error",
}: {
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <ErrorState
      title="Server Error"
      message="Something went wrong on our end. Please try again later."
      hint="Our team has been notified and is working on the issue."
      onRetry={onRetry}
      testId={testId}
    />
  );
}

// ============================================
// Exports
// ============================================

export default ErrorState;
