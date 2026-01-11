/**
 * Button Component
 *
 * Button with variants, loading states, and confirmation feedback.
 *
 * @see docs/plans/ui/28-states.md lines 118-124
 */

import React, { forwardRef } from "react";
import { Spinner } from "./spinner";
import {
  type ButtonState,
  Checkmark,
  ERROR_STATE_DURATION,
  SUCCESS_STATE_DURATION,
} from "./success-feedback/index.js";

// ============================================
// Types
// ============================================

/**
 * Button variant.
 */
export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost" | "link";

/**
 * Button size.
 */
export type ButtonSize = "sm" | "md" | "lg" | "icon";

/**
 * Button props.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: ButtonSize;
  /** Current button state */
  state?: ButtonState;
  /** Loading text (optional, defaults to children) */
  loadingText?: string;
  /** Success text (shown during success state) */
  successText?: string;
  /** Error text (shown during error state) */
  errorText?: string;
  /** Called when state auto-resets to idle */
  onStateReset?: () => void;
  /** Full width button */
  fullWidth?: boolean;
  /** Icon before text */
  leftIcon?: React.ReactNode;
  /** Icon after text */
  rightIcon?: React.ReactNode;
  /** Test ID */
  testId?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Variant styles.
 */
const VARIANT_STYLES: Record<
  ButtonVariant,
  {
    bg: string;
    hoverBg: string;
    color: string;
    border: string;
  }
> = {
  primary: {
    bg: "#1c1917", // stone-900
    hoverBg: "#292524", // stone-800
    color: "#ffffff",
    border: "none",
  },
  secondary: {
    bg: "#ffffff",
    hoverBg: "#f5f5f4", // stone-100
    color: "#1c1917",
    border: "1px solid #d6d3d1", // stone-300
  },
  destructive: {
    bg: "#ef4444", // red-500
    hoverBg: "#dc2626", // red-600
    color: "#ffffff",
    border: "none",
  },
  ghost: {
    bg: "transparent",
    hoverBg: "#f5f5f4", // stone-100
    color: "#1c1917",
    border: "none",
  },
  link: {
    bg: "transparent",
    hoverBg: "transparent",
    color: "#3b82f6", // blue-500
    border: "none",
  },
};

/**
 * Size styles.
 */
const SIZE_STYLES: Record<
  ButtonSize,
  {
    padding: string;
    fontSize: string;
    height: string;
    minWidth: string;
    iconSize: number;
  }
> = {
  sm: {
    padding: "6px 12px",
    fontSize: "13px",
    height: "32px",
    minWidth: "64px",
    iconSize: 14,
  },
  md: {
    padding: "8px 16px",
    fontSize: "14px",
    height: "40px",
    minWidth: "80px",
    iconSize: 16,
  },
  lg: {
    padding: "12px 24px",
    fontSize: "16px",
    height: "48px",
    minWidth: "96px",
    iconSize: 18,
  },
  icon: {
    padding: "8px",
    fontSize: "14px",
    height: "40px",
    minWidth: "40px",
    iconSize: 18,
  },
};

/**
 * State background colors.
 */
const STATE_BG_COLORS: Record<ButtonState, string | undefined> = {
  idle: undefined, // Use variant color
  loading: undefined, // Use variant color
  success: "#22c55e", // green-500
  error: "#ef4444", // red-500
};

// ============================================
// Keyframes
// ============================================

const buttonKeyframes = `
  @keyframes button-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-4px); }
    40%, 80% { transform: translateX(4px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .button-shake {
      animation: none !important;
    }
  }
`;

// ============================================
// Component
// ============================================

/**
 * Button component with variants and loading states.
 *
 * @example
 * ```tsx
 * // Primary button
 * <Button variant="primary" onClick={handleClick}>
 *   Save Changes
 * </Button>
 *
 * // Button with loading state
 * <Button
 *   state={isLoading ? "loading" : "idle"}
 *   onClick={handleSubmit}
 * >
 *   Submit
 * </Button>
 *
 * // Button with full state machine
 * const { state, execute, reset } = useAsyncButton(async () => {
 *   await saveData();
 * });
 *
 * <Button state={state} onClick={execute} onStateReset={reset}>
 *   Save
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      state = "idle",
      children,
      loadingText,
      successText = "Done",
      errorText = "Error",
      onStateReset,
      fullWidth = false,
      leftIcon,
      rightIcon,
      testId = "button",
      disabled,
      style,
      ...props
    },
    ref
  ) => {
    const variantStyle = VARIANT_STYLES[variant];
    const sizeStyle = SIZE_STYLES[size];
    const stateBg = STATE_BG_COLORS[state];

    const isDisabled = disabled || state === "loading" || state === "success";
    const isIconButton = size === "icon";

    // Auto-reset timer
    React.useEffect(() => {
      if (state === "success") {
        const timeout = setTimeout(() => {
          onStateReset?.();
        }, SUCCESS_STATE_DURATION);
        return () => clearTimeout(timeout);
      } else if (state === "error") {
        const timeout = setTimeout(() => {
          onStateReset?.();
        }, ERROR_STATE_DURATION);
        return () => clearTimeout(timeout);
      }
      return undefined;
    }, [state, onStateReset]);

    const buttonStyles: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      padding: sizeStyle.padding,
      fontSize: sizeStyle.fontSize,
      fontWeight: 500,
      height: sizeStyle.height,
      minWidth: isIconButton ? sizeStyle.height : sizeStyle.minWidth,
      width: fullWidth ? "100%" : undefined,
      borderRadius: "6px",
      border: variantStyle.border,
      backgroundColor: stateBg ?? variantStyle.bg,
      color: state === "success" || state === "error" ? "#ffffff" : variantStyle.color,
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled && state !== "success" ? 0.6 : 1,
      transition: "background-color 0.15s, opacity 0.15s",
      textDecoration: variant === "link" ? "underline" : "none",
      animation: state === "error" ? "button-shake 0.4s ease-out" : undefined,
      ...style,
    };

    const renderContent = () => {
      switch (state) {
        case "loading":
          return (
            <>
              <Spinner size={sizeStyle.iconSize <= 14 ? "xs" : "sm"} label="Loading" />
              {!isIconButton && <span>{loadingText ?? children}</span>}
            </>
          );
        case "success":
          return (
            <>
              <Checkmark size={sizeStyle.iconSize} color="#ffffff" />
              {!isIconButton && <span>{successText}</span>}
            </>
          );
        case "error":
          return (
            <>
              <span aria-hidden="true">✕</span>
              {!isIconButton && <span>{errorText}</span>}
            </>
          );
        default:
          return (
            <>
              {leftIcon && <span aria-hidden="true">{leftIcon}</span>}
              {children}
              {rightIcon && <span aria-hidden="true">{rightIcon}</span>}
            </>
          );
      }
    };

    return (
      <>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
        <style dangerouslySetInnerHTML={{ __html: buttonKeyframes }} />
        <button
          ref={ref}
          type="button"
          {...props}
          disabled={isDisabled}
          data-testid={testId}
          data-variant={variant}
          data-size={size}
          data-state={state}
          style={buttonStyles}
          aria-busy={state === "loading"}
          aria-disabled={isDisabled}
          className={state === "error" ? "button-shake" : undefined}
        >
          {renderContent()}

          {/* Screen reader announcement */}
          {state === "success" && (
            // biome-ignore lint/a11y/useSemanticElements: span with role="status" is correct for live region
            <span className="sr-only" role="status" aria-live="polite">
              Action completed successfully
            </span>
          )}
          {state === "error" && (
            <span className="sr-only" role="alert" aria-live="assertive">
              Action failed
            </span>
          )}
        </button>
      </>
    );
  }
);

Button.displayName = "Button";

// ============================================
// Icon Button
// ============================================

/**
 * Convenience wrapper for icon-only buttons.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size" | "leftIcon" | "rightIcon">
>(({ children, ...props }, ref) => (
  <Button ref={ref} size="icon" {...props}>
    {children}
  </Button>
));

IconButton.displayName = "IconButton";

// ============================================
// Exports
// ============================================

export type { ButtonState } from "./success-feedback/index.js";
export default Button;
