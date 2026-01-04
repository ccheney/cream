/**
 * Success Feedback Components
 *
 * Inline success feedback with checkmark animation and state transitions.
 *
 * @see docs/plans/ui/28-states.md lines 110-114
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "./spinner";

// ============================================
// Types
// ============================================

/**
 * Button state machine states.
 */
export type ButtonState = "idle" | "loading" | "success" | "error";

/**
 * Checkmark props.
 */
export interface CheckmarkProps {
  /** Size in pixels */
  size?: number;
  /** Stroke color */
  color?: string;
  /** Animation duration in ms */
  duration?: number;
  /** Whether to animate */
  animated?: boolean;
  /** Test ID */
  testId?: string;
}

/**
 * Success button props.
 */
export interface SuccessButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Current button state */
  state?: ButtonState;
  /** Loading text (shown during loading state) */
  loadingText?: string;
  /** Success text (shown during success state) */
  successText?: string;
  /** Error text (shown during error state) */
  errorText?: string;
  /** Duration to show success state (ms) */
  successDuration?: number;
  /** Duration to show error state (ms) */
  errorDuration?: number;
  /** Called when state transitions to idle */
  onStateReset?: () => void;
  /** Spinner size */
  spinnerSize?: "xs" | "sm" | "md";
  /** Test ID */
  testId?: string;
}

/**
 * Hook options for async submission.
 */
export interface UseAsyncButtonOptions<T> {
  /** Success message */
  successMessage?: string;
  /** Success duration in ms */
  successDuration?: number;
  /** Error duration in ms */
  errorDuration?: number;
  /** Called after success state completes */
  onSuccess?: (result: T) => void;
  /** Called after error state completes */
  onError?: (error: Error) => void;
}

// ============================================
// Constants
// ============================================

/**
 * Default animation durations.
 */
export const CHECKMARK_ANIMATION_DURATION = 300;
export const SUCCESS_STATE_DURATION = 2000;
export const ERROR_STATE_DURATION = 3000;

// ============================================
// Keyframes
// ============================================

const checkmarkKeyframes = `
  @keyframes checkmark-draw {
    0% {
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes success-bg-flash {
    0% {
      background-color: rgba(34, 197, 94, 0.2);
    }
    100% {
      background-color: transparent;
    }
  }

  @keyframes fade-in-scale {
    0% {
      opacity: 0;
      transform: scale(0.8);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .checkmark-animated,
    .success-button {
      animation: none !important;
    }
  }
`;

// ============================================
// Checkmark Component
// ============================================

/**
 * Animated checkmark component.
 *
 * Uses SVG stroke-dashoffset animation for draw effect.
 *
 * @example
 * ```tsx
 * <Checkmark size={24} animated />
 * <Checkmark size={32} color="#22c55e" duration={500} />
 * ```
 */
export function Checkmark({
  size = 24,
  color = "#22c55e", // green-500
  duration = CHECKMARK_ANIMATION_DURATION,
  animated = true,
  testId = "checkmark",
}: CheckmarkProps) {
  const pathLength = 50; // Approximate path length

  const svgStyles: React.CSSProperties = {
    width: size,
    height: size,
  };

  const pathStyles: React.CSSProperties = {
    stroke: color,
    strokeWidth: 3,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
    strokeDasharray: pathLength,
    strokeDashoffset: animated ? 0 : 0,
    animation: animated
      ? `checkmark-draw ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
      : "none",
  };

  return (
    <>
      {animated && <style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />}
      <svg
        viewBox="0 0 24 24"
        style={svgStyles}
        className={animated ? "checkmark-animated" : ""}
        data-testid={testId}
        aria-hidden="true"
      >
        <path d="M5 12l5 5L19 7" style={pathStyles} />
      </svg>
    </>
  );
}

// ============================================
// Success Text Component
// ============================================

/**
 * Animated success text.
 */
export function SuccessText({
  children = "Saved!",
  testId = "success-text",
}: {
  children?: React.ReactNode;
  testId?: string;
}) {
  const styles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: "#22c55e",
    fontWeight: 500,
    animation: "fade-in-scale 200ms ease-out",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />
      <span role="status" aria-live="polite" data-testid={testId} style={styles}>
        <Checkmark size={16} />
        <span>{children}</span>
      </span>
    </>
  );
}

// ============================================
// Success Button Component
// ============================================

/**
 * Button with loading and success state feedback.
 *
 * State machine: idle → loading → success → idle
 *
 * @example
 * ```tsx
 * const [state, setState] = useState<ButtonState>("idle");
 *
 * const handleSubmit = async () => {
 *   setState("loading");
 *   try {
 *     await saveData();
 *     setState("success");
 *   } catch (e) {
 *     setState("error");
 *   }
 * };
 *
 * <SuccessButton
 *   state={state}
 *   onClick={handleSubmit}
 *   onStateReset={() => setState("idle")}
 * >
 *   Save Changes
 * </SuccessButton>
 * ```
 */
export function SuccessButton({
  state = "idle",
  children,
  loadingText,
  successText = "Saved!",
  errorText = "Error",
  successDuration = SUCCESS_STATE_DURATION,
  errorDuration = ERROR_STATE_DURATION,
  onStateReset,
  spinnerSize = "sm",
  testId = "success-button",
  disabled,
  style,
  ...props
}: SuccessButtonProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-transition from success/error to idle
  useEffect(() => {
    if (state === "success") {
      timeoutRef.current = setTimeout(() => {
        onStateReset?.();
      }, successDuration);
    } else if (state === "error") {
      timeoutRef.current = setTimeout(() => {
        onStateReset?.();
      }, errorDuration);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [state, successDuration, errorDuration, onStateReset]);

  const isDisabled = disabled || state === "loading" || state === "success";

  const buttonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    border: "none",
    cursor: isDisabled ? "not-allowed" : "pointer",
    transition: "background-color 0.15s, opacity 0.15s",
    opacity: isDisabled && state !== "success" ? 0.6 : 1,
    backgroundColor: state === "success" ? "#22c55e" : state === "error" ? "#ef4444" : "#1c1917",
    color: "#ffffff",
    ...style,
  };

  const renderContent = () => {
    switch (state) {
      case "loading":
        return (
          <>
            <Spinner size={spinnerSize} label="Processing" />
            <span>{loadingText ?? children}</span>
          </>
        );
      case "success":
        return (
          <>
            <Checkmark size={16} color="#ffffff" />
            <span>{successText}</span>
          </>
        );
      case "error":
        return (
          <>
            <span aria-hidden="true">✕</span>
            <span>{errorText}</span>
          </>
        );
      default:
        return children;
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />
      <button
        type="button"
        {...props}
        disabled={isDisabled}
        data-testid={testId}
        data-state={state}
        style={buttonStyles}
        aria-busy={state === "loading"}
        aria-disabled={isDisabled}
      >
        {renderContent()}

        {/* Screen reader announcement */}
        {state === "success" && (
          <span className="sr-only" role="status" aria-live="polite">
            Form submitted successfully
          </span>
        )}
      </button>
    </>
  );
}

// ============================================
// useAsyncButton Hook
// ============================================

/**
 * Hook for managing async button state.
 *
 * @example
 * ```tsx
 * const { state, execute, reset } = useAsyncButton(async () => {
 *   await saveData();
 * });
 *
 * <SuccessButton state={state} onClick={execute} onStateReset={reset}>
 *   Save
 * </SuccessButton>
 * ```
 */
export function useAsyncButton<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncButtonOptions<T> = {}
): {
  state: ButtonState;
  execute: () => Promise<void>;
  reset: () => void;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
} {
  const [state, setState] = useState<ButtonState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    successDuration = SUCCESS_STATE_DURATION,
    errorDuration = ERROR_STATE_DURATION,
    onSuccess,
    onError,
  } = options;

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const execute = useCallback(async () => {
    if (state === "loading") {
      return;
    }

    setState("loading");
    setError(null);

    try {
      const result = await asyncFn();
      setState("success");

      timeoutRef.current = setTimeout(() => {
        setState("idle");
        onSuccess?.(result);
      }, successDuration);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setState("error");

      timeoutRef.current = setTimeout(() => {
        setState("idle");
        onError?.(err);
      }, errorDuration);
    }
  }, [asyncFn, state, successDuration, errorDuration, onSuccess, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    execute,
    reset,
    isLoading: state === "loading",
    isSuccess: state === "success",
    isError: state === "error",
    error,
  };
}

// ============================================
// Inline Success Indicator
// ============================================

/**
 * Inline success indicator for forms.
 *
 * Shows checkmark with optional text that fades out.
 */
export function InlineSuccess({
  text = "Saved",
  duration = SUCCESS_STATE_DURATION,
  onComplete,
  testId = "inline-success",
}: {
  text?: string;
  duration?: number;
  onComplete?: () => void;
  testId?: string;
}) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      onComplete?.();
    }, duration);
    return () => clearTimeout(timeout);
  }, [duration, onComplete]);

  const styles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: "4px",
    color: "#22c55e",
    fontSize: "13px",
    fontWeight: 500,
    animation: "fade-in-scale 200ms ease-out",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />
      <span role="status" aria-live="polite" data-testid={testId} style={styles}>
        <Checkmark size={14} />
        <span>{text}</span>
      </span>
    </>
  );
}

// ============================================
// Exports
// ============================================

export default SuccessButton;
