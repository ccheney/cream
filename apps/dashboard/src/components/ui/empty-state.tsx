/**
 * Empty State Component
 *
 * Reusable empty state with icon, title, description, and optional action.
 *
 * @see docs/plans/ui/28-states.md lines 47-71
 */

import type React from "react";

// ============================================
// Types
// ============================================

/**
 * Action button configuration.
 */
export interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button variant */
  variant?: "primary" | "secondary";
}

/**
 * Empty state props.
 */
export interface EmptyStateProps {
  /** Icon (emoji string, SVG, or React component) */
  icon?: React.ReactNode;
  /** Headline text */
  title: string;
  /** Explanation text */
  description?: string;
  /** Primary action button */
  action?: EmptyStateAction;
  /** Secondary action button */
  secondaryAction?: EmptyStateAction;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
  /** Test ID for testing */
  testId?: string;
}

// ============================================
// Styles
// ============================================

const baseStyles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    padding: "32px 24px",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  icon: {
    color: "#a8a29e", // stone-400
    marginBottom: "16px",
  },
  title: {
    fontWeight: 600,
    color: "#44403c", // stone-700
    marginBottom: "8px",
    lineHeight: 1.3,
  },
  description: {
    color: "#78716c", // stone-500
    maxWidth: "320px",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "12px",
    marginTop: "20px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  primaryButton: {
    padding: "10px 20px",
    fontWeight: 500,
    backgroundColor: "#292524", // stone-800
    color: "#fafaf9", // stone-50
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
    fontSize: "14px",
  },
  secondaryButton: {
    padding: "10px 20px",
    fontWeight: 500,
    backgroundColor: "transparent",
    color: "#44403c", // stone-700
    border: "1px solid #d6d3d1", // stone-300
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s, border-color 0.2s",
    fontSize: "14px",
  },
};

const sizeStyles = {
  sm: {
    icon: { fontSize: "36px" },
    title: { fontSize: "16px" },
    description: { fontSize: "13px" },
    container: { padding: "20px 16px" },
  },
  md: {
    icon: { fontSize: "48px" },
    title: { fontSize: "18px" },
    description: { fontSize: "14px" },
    container: { padding: "32px 24px" },
  },
  lg: {
    icon: { fontSize: "64px" },
    title: { fontSize: "20px" },
    description: { fontSize: "15px" },
    container: { padding: "48px 32px" },
  },
};

// ============================================
// Component
// ============================================

/**
 * Empty state component for displaying when no data is available.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="📊"
 *   title="No positions yet"
 *   description="Positions will appear here once the system executes its first trade."
 *   action={{ label: "View Decision History", onClick: () => navigate("/decisions") }}
 * />
 * ```
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className,
  testId = "empty-state",
}: EmptyStateProps) {
  const sizeStyle = sizeStyles[size];

  return (
    <output
      aria-label={title}
      className={className}
      data-testid={testId}
      style={{ ...baseStyles.container, ...sizeStyle.container }}
    >
      {/* Icon */}
      {icon && (
        <div style={{ ...baseStyles.icon, ...sizeStyle.icon }} aria-hidden="true">
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 style={{ ...baseStyles.title, ...sizeStyle.title }}>{title}</h3>

      {/* Description */}
      {description && (
        <p style={{ ...baseStyles.description, ...sizeStyle.description }}>{description}</p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div style={baseStyles.actions}>
          {action && (
            // biome-ignore lint/a11y/useKeyWithMouseEvents: Button is keyboard accessible via native behavior
            <button
              type="button"
              onClick={action.onClick}
              style={
                action.variant === "secondary"
                  ? baseStyles.secondaryButton
                  : baseStyles.primaryButton
              }
              onMouseOver={(e) => {
                if (action.variant !== "secondary") {
                  e.currentTarget.style.backgroundColor = "#1c1917";
                } else {
                  e.currentTarget.style.backgroundColor = "#f5f5f4";
                }
              }}
              onMouseOut={(e) => {
                if (action.variant !== "secondary") {
                  e.currentTarget.style.backgroundColor = "#292524";
                } else {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            // biome-ignore lint/a11y/useKeyWithMouseEvents: Button is keyboard accessible via native behavior
            <button
              type="button"
              onClick={secondaryAction.onClick}
              style={baseStyles.secondaryButton}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#f5f5f4";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </output>
  );
}

// ============================================
// Preset Empty States
// ============================================

/**
 * No positions empty state.
 */
export function NoPositionsEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="📈"
      title={props.title ?? "No positions yet"}
      description="Positions will appear here once the system executes its first trade."
      {...props}
    />
  );
}

/**
 * No decisions empty state.
 */
export function NoDecisionsEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="🎯"
      title={props.title ?? "No decisions yet"}
      description="Decisions will appear here as the trading cycle runs."
      {...props}
    />
  );
}

/**
 * No data empty state.
 */
export function NoDataEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="📊"
      title={props.title ?? "No data available"}
      description="There's no data to display at this time."
      {...props}
    />
  );
}

/**
 * Search no results empty state.
 */
export function NoResultsEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="🔍"
      title={props.title ?? "No results found"}
      description="Try adjusting your search or filter criteria."
      {...props}
    />
  );
}

/**
 * No alerts empty state.
 */
export function NoAlertsEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="🔔"
      title={props.title ?? "No alerts"}
      description="You're all caught up! New alerts will appear here."
      {...props}
    />
  );
}

/**
 * Error empty state (for when an error results in no content).
 */
export function ErrorEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="⚠️"
      title={props.title ?? "Something went wrong"}
      description="We couldn't load this content. Please try again."
      {...props}
    />
  );
}

/**
 * Offline empty state.
 */
export function OfflineEmptyState(
  props: Omit<EmptyStateProps, "icon" | "title"> & { title?: string }
) {
  return (
    <EmptyState
      icon="📡"
      title={props.title ?? "You're offline"}
      description="Check your internet connection and try again."
      {...props}
    />
  );
}

export default EmptyState;
