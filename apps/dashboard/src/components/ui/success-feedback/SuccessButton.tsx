/**
 * SuccessButton Component
 *
 * Button with loading and success state feedback.
 */

import type React from "react";
import { useEffect, useRef } from "react";
import { Spinner } from "../spinner";
import { checkmarkKeyframes, ERROR_STATE_DURATION, SUCCESS_STATE_DURATION } from "./animations";
import { Checkmark } from "./Checkmark";
import type { SuccessButtonProps } from "./types";

/**
 * Button with loading and success state feedback.
 *
 * State machine: idle -> loading -> success -> idle
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
}: SuccessButtonProps): React.ReactElement {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function renderContent(): React.ReactNode {
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
  }

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
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

        {state === "success" && (
          // biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for feedback
          <span className="sr-only" role="status" aria-live="polite">
            Form submitted successfully
          </span>
        )}
      </button>
    </>
  );
}
