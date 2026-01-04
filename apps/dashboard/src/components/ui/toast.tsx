/**
 * Toast Notification Components
 *
 * Toast UI components with variants, animations, and accessibility.
 *
 * @see docs/plans/ui/28-states.md lines 102-108
 */

import React from "react";
import {
  useToastStore,
  type Toast,
  type ToastVariant,
  type ToastPosition,
  EXIT_ANIMATION_DURATION,
} from "../../stores/toast-store";

// ============================================
// Types
// ============================================

/**
 * Toast component props.
 */
export interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * Toast container props.
 */
export interface ToastContainerProps {
  position?: ToastPosition;
}

// ============================================
// Constants
// ============================================

/**
 * Variant styles.
 */
const VARIANT_STYLES: Record<ToastVariant, {
  borderColor: string;
  iconColor: string;
  icon: string;
  role: "status" | "alert";
  ariaLive: "polite" | "assertive";
}> = {
  success: {
    borderColor: "#22c55e", // green-500
    iconColor: "#22c55e",
    icon: "✓",
    role: "status",
    ariaLive: "polite",
  },
  error: {
    borderColor: "#ef4444", // red-500
    iconColor: "#ef4444",
    icon: "✕",
    role: "alert",
    ariaLive: "assertive",
  },
  warning: {
    borderColor: "#f59e0b", // amber-500
    iconColor: "#f59e0b",
    icon: "⚠",
    role: "alert",
    ariaLive: "assertive",
  },
  info: {
    borderColor: "#3b82f6", // blue-500
    iconColor: "#3b82f6",
    icon: "ℹ",
    role: "status",
    ariaLive: "polite",
  },
};

/**
 * Position styles.
 */
const POSITION_STYLES: Record<ToastPosition, React.CSSProperties> = {
  "top-right": {
    top: "16px",
    right: "16px",
    flexDirection: "column",
  },
  "top-left": {
    top: "16px",
    left: "16px",
    flexDirection: "column",
  },
  "bottom-right": {
    bottom: "16px",
    right: "16px",
    flexDirection: "column-reverse",
  },
  "bottom-left": {
    bottom: "16px",
    left: "16px",
    flexDirection: "column-reverse",
  },
};

// ============================================
// Keyframes
// ============================================

const toastKeyframes = `
  @keyframes toast-enter {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes toast-exit {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast-item {
      animation: none !important;
    }
  }
`;

// ============================================
// Components
// ============================================

/**
 * Individual toast component.
 */
export function ToastItem({ toast, onDismiss }: ToastProps) {
  const variantStyle = VARIANT_STYLES[toast.variant];

  const toastStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderLeft: `4px solid ${variantStyle.borderColor}`,
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    minWidth: "300px",
    maxWidth: "400px",
    animation: toast.dismissing
      ? `toast-exit ${EXIT_ANIMATION_DURATION}ms ease-in forwards`
      : "toast-enter 200ms ease-out",
    pointerEvents: "auto",
  };

  const iconStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    color: variantStyle.iconColor,
    fontWeight: "bold",
    fontSize: "14px",
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const titleStyles: React.CSSProperties = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#1c1917",
    margin: 0,
  };

  const messageStyles: React.CSSProperties = {
    fontSize: "14px",
    color: "#44403c",
    margin: 0,
    lineHeight: 1.4,
  };

  const closeButtonStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#78716c",
    fontSize: "16px",
    padding: 0,
    borderRadius: "4px",
    transition: "color 0.15s, background-color 0.15s",
  };

  return (
    <div
      className="toast-item"
      role={variantStyle.role}
      aria-live={variantStyle.ariaLive}
      data-testid={`toast-${toast.id}`}
      style={toastStyles}
    >
      {/* Icon */}
      <span style={iconStyles} aria-hidden="true">
        {variantStyle.icon}
      </span>

      {/* Content */}
      <div style={contentStyles}>
        {toast.title && <h4 style={titleStyles}>{toast.title}</h4>}
        <p style={messageStyles}>{toast.message}</p>
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        style={closeButtonStyles}
        aria-label="Dismiss notification"
        data-testid={`toast-close-${toast.id}`}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Toast container component.
 *
 * Renders all active toasts in the specified position.
 *
 * @example
 * ```tsx
 * // In your app layout
 * <ToastContainer position="bottom-right" />
 * ```
 */
export function ToastContainer({ position: propPosition }: ToastContainerProps) {
  const { toasts, position: storePosition, removeToast, startDismiss } = useToastStore();

  const position = propPosition ?? storePosition;
  const positionStyle = POSITION_STYLES[position];

  const containerStyles: React.CSSProperties = {
    position: "fixed",
    display: "flex",
    gap: "8px",
    zIndex: 100,
    pointerEvents: "none",
    ...positionStyle,
  };

  const handleDismiss = (id: string) => {
    startDismiss(id);
    setTimeout(() => {
      removeToast(id);
    }, EXIT_ANIMATION_DURATION);
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: toastKeyframes }} />
      <div
        data-testid="toast-container"
        style={containerStyles}
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </>
  );
}

// ============================================
// Exports
// ============================================

export { useToast } from "../../stores/toast-store";
export type { Toast, ToastVariant, ToastPosition } from "../../stores/toast-store";
