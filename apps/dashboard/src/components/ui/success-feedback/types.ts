/**
 * Success Feedback Types
 *
 * TypeScript interfaces and types for success feedback components.
 */

import type React from "react";

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

/**
 * Hook return type for useAsyncButton.
 */
export interface UseAsyncButtonReturn {
  state: ButtonState;
  execute: () => Promise<void>;
  reset: () => void;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Success text props.
 */
export interface SuccessTextProps {
  children?: React.ReactNode;
  testId?: string;
}

/**
 * Inline success props.
 */
export interface InlineSuccessProps {
  text?: string;
  duration?: number;
  onComplete?: () => void;
  testId?: string;
}
