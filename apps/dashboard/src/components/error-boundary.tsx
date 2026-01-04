/**
 * Error Boundary Component
 *
 * Catches React render errors and displays a fallback UI.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

"use client";

import React, { Component, type ReactNode, type ErrorInfo } from "react";

// ============================================
// Types
// ============================================

/**
 * Error boundary props.
 */
export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Custom fallback UI (optional) */
  fallback?: ReactNode | ((props: ErrorFallbackProps) => ReactNode);
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Callback when reset is triggered */
  onReset?: () => void;
  /** Reset keys - when these change, the boundary resets */
  resetKeys?: unknown[];
}

/**
 * Error boundary state.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error fallback props.
 */
export interface ErrorFallbackProps {
  /** The error that was caught */
  error: Error;
  /** Error component stack */
  errorInfo: ErrorInfo | null;
  /** Reset the error boundary */
  reset: () => void;
}

// ============================================
// Default Fallback UI
// ============================================

const fallbackStyles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    minHeight: "200px",
    textAlign: "center" as const,
    backgroundColor: "#fef2f2", // red-50
    border: "1px solid #fecaca", // red-200
    borderRadius: "8px",
    margin: "16px",
  },
  icon: {
    fontSize: "48px",
    marginBottom: "16px",
  },
  title: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#991b1b", // red-800
    marginBottom: "8px",
  },
  message: {
    fontSize: "14px",
    color: "#b91c1c", // red-700
    marginBottom: "24px",
    maxWidth: "400px",
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  primaryButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#ffffff",
    backgroundColor: "#dc2626", // red-600
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  secondaryButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#b91c1c", // red-700
    backgroundColor: "transparent",
    border: "1px solid #fca5a5", // red-300
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  details: {
    marginTop: "24px",
    padding: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    maxWidth: "600px",
    overflow: "auto",
    textAlign: "left" as const,
  },
  errorName: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#991b1b",
    marginBottom: "8px",
  },
  errorMessage: {
    fontSize: "13px",
    color: "#dc2626",
    marginBottom: "12px",
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  stack: {
    fontSize: "12px",
    color: "#6b7280",
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "200px",
    overflow: "auto",
  },
};

/**
 * Default error fallback component.
 */
export function DefaultErrorFallback({
  error,
  errorInfo,
  reset,
}: ErrorFallbackProps) {
  const isDev = process.env.NODE_ENV === "development";
  const [showDetails, setShowDetails] = React.useState(isDev);

  return (
    <div
      role="alert"
      aria-label="An error occurred"
      data-testid="error-fallback"
      style={fallbackStyles.container}
    >
      <div style={fallbackStyles.icon} aria-hidden="true">

      </div>

      <h2 style={fallbackStyles.title}>Something went wrong</h2>

      <p style={fallbackStyles.message}>
        We encountered an unexpected error. Please try again or contact support
        if the problem persists.
      </p>

      <div style={fallbackStyles.actions}>
        <button
          type="button"
          onClick={reset}
          style={fallbackStyles.primaryButton}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#b91c1c";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#dc2626";
          }}
        >
          Try again
        </button>

        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          style={fallbackStyles.secondaryButton}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#fef2f2";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      {showDetails && (
        <div style={fallbackStyles.details}>
          <div style={fallbackStyles.errorName}>{error.name}</div>
          <div style={fallbackStyles.errorMessage}>{error.message}</div>
          {errorInfo?.componentStack && (
            <pre style={fallbackStyles.stack}>
              Component Stack:{"\n"}
              {errorInfo.componentStack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Error Boundary Component
// ============================================

/**
 * React Error Boundary component.
 *
 * Catches JavaScript errors in child component tree, logs them,
 * and displays a fallback UI.
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error) => logToService(error)}
 *   onReset={() => clearCache()}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Update state with error info
    this.setState({ errorInfo });

    // Log error to console
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Call onError callback if provided
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset when resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasChanged) {
        this.reset();
      }
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback function
      if (typeof fallback === "function") {
        return fallback({ error, errorInfo, reset: this.reset });
      }

      // Custom fallback node
      if (fallback) {
        return fallback;
      }

      // Default fallback
      return (
        <DefaultErrorFallback
          error={error}
          errorInfo={errorInfo}
          reset={this.reset}
        />
      );
    }

    return children;
  }
}

// ============================================
// Hook for Error Boundary
// ============================================

/**
 * Hook to throw an error from a render function.
 * Useful for testing error boundaries.
 */
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    throw error;
  }

  return {
    showBoundary: setError,
    resetBoundary: () => setError(null),
  };
}

// ============================================
// Exports
// ============================================

export default ErrorBoundary;
