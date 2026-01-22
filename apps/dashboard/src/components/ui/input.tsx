/**
 * Input Component
 *
 * Form input with error state support for validation.
 *
 * @see docs/plans/ui/28-states.md lines 76-81
 */

import React, { forwardRef } from "react";

// ============================================
// Types
// ============================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	/** Error state - shows critical border */
	error?: boolean;
	/** Test ID for testing */
	testId?: string;
}

// ============================================
// Styles
// ============================================

const baseStyles: React.CSSProperties = {
	display: "block",
	width: "100%",
	padding: "10px 12px",
	fontSize: "14px",
	lineHeight: "1.5",
	color: "#1c1917", // stone-900
	backgroundColor: "#ffffff",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "#d6d3d1", // stone-300
	borderRadius: "6px",
	outline: "none",
	transition: "border-color 0.2s, box-shadow 0.2s",
	boxSizing: "border-box" as const,
};

const focusStyles: React.CSSProperties = {
	borderColor: "#78716c", // stone-500
	boxShadow: "0 0 0 3px rgba(120, 113, 108, 0.15)",
};

const errorStyles: React.CSSProperties = {
	borderColor: "#dc2626", // red-600 (critical)
};

const errorFocusStyles: React.CSSProperties = {
	borderColor: "#dc2626", // red-600 (critical)
	boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.15)",
};

const disabledStyles: React.CSSProperties = {
	backgroundColor: "#f5f5f4", // stone-100
	color: "#a8a29e", // stone-400
	cursor: "not-allowed",
};

// ============================================
// Component
// ============================================

/**
 * Input component with error state support.
 *
 * @example
 * ```tsx
 * // Normal input
 * <Input placeholder="Enter email" />
 *
 * // With error state
 * <Input
 *   placeholder="Enter email"
 *   error
 *   aria-invalid="true"
 *   aria-describedby="email-error"
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ error = false, testId = "input", style, disabled, ...props }, ref) => {
		const [isFocused, setIsFocused] = React.useState(false);

		const computedStyles: React.CSSProperties = {
			...baseStyles,
			...(disabled && disabledStyles),
			...(error && errorStyles),
			...(isFocused && !error && focusStyles),
			...(isFocused && error && errorFocusStyles),
			...style,
		};

		return (
			<input
				ref={ref}
				data-testid={testId}
				disabled={disabled}
				aria-invalid={error || undefined}
				style={computedStyles}
				onFocus={(e) => {
					setIsFocused(true);
					props.onFocus?.(e);
				}}
				onBlur={(e) => {
					setIsFocused(false);
					props.onBlur?.(e);
				}}
				{...props}
			/>
		);
	},
);

Input.displayName = "Input";

export default Input;
