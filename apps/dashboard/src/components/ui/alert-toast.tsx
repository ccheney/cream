/**
 * Alert Toast Component
 *
 * Toast container for warning and info alerts with auto-dismiss.
 * Positioned bottom-right, stacks up to 5 alerts.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 89-118
 */

"use client";

import type { ReactNode } from "react";
import type { Alert, AlertSeverity } from "@/stores/alert-store";
import { selectAlerts, useAlertStore } from "@/stores/alert-store";

// ============================================
// Toast Item Component
// ============================================

interface ToastItemProps {
  alert: Alert;
  onDismiss: (id: string) => void;
}

function ToastItem({ alert, onDismiss }: ToastItemProps) {
  const severityStyles: Record<AlertSeverity, string> = {
    critical: "border-loss bg-loss/10 text-loss",
    warning: "border-neutral bg-neutral/10 text-neutral",
    info: "border-primary bg-primary/10 text-primary",
  };

  const severityIcons: Record<AlertSeverity, ReactNode> = {
    critical: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
    ),
    warning: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    ),
    info: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      </svg>
    ),
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        relative
        w-80
        p-4
        rounded-lg
        border-l-4
        bg-bg-card
        shadow-lg
        ${severityStyles[alert.severity]}
        ${alert.dismissing ? "animate-fade-out" : "animate-slide-up"}
      `}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <span className="flex-shrink-0" aria-hidden="true">
          {severityIcons[alert.severity]}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-heading text-sm">{alert.title}</p>
          <p className="text-text-secondary text-xs mt-0.5">{alert.message}</p>

          {/* Action Button */}
          {alert.action && (
            <button
              type="button"
              onClick={alert.action.onClick}
              className="
                mt-2
                text-xs font-medium
                underline underline-offset-2
                hover:no-underline
                transition-all duration-150
              "
            >
              {alert.action.label}
            </button>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="
            flex-shrink-0
            p-1
            -m-1
            rounded
            text-text-muted
            hover:text-text-primary
            hover:bg-bg-muted
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-primary/50
          "
          aria-label="Dismiss alert"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================
// Toast Container Component
// ============================================

export function AlertToastContainer() {
  const alerts = useAlertStore(selectAlerts);
  const dismissAlert = useAlertStore((state) => state.dismissAlert);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Notifications"
      className="
        fixed bottom-4 right-4 z-40
        flex flex-col-reverse gap-2
        pointer-events-none
      "
    >
      {alerts.map((alert) => (
        <div key={alert.id} className="pointer-events-auto">
          <ToastItem alert={alert} onDismiss={dismissAlert} />
        </div>
      ))}
    </section>
  );
}

// ============================================
// Exports
// ============================================

export { ToastItem };
export default AlertToastContainer;
