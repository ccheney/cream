/**
 * SuccessButton Component
 *
 * Button with loading and success state feedback.
 */

import type React from "react";
import { useEffect, useRef } from "react";
import { Spinner } from "../spinner";
import { ERROR_STATE_DURATION, SUCCESS_STATE_DURATION } from "./animations";
import { Checkmark } from "./Checkmark";
import type { SuccessButtonProps } from "./types";

const SUCCESS_BUTTON_STYLES = {
	idleBg: "#1c1917",
	successBg: "#22c55e",
	errorBg: "#ef4444",
} as const;

type SuccessButtonState = NonNullable<SuccessButtonProps["state"]>;

function resolveButtonContent(
	state: SuccessButtonState,
	children: React.ReactNode,
	loadingText: string | undefined,
	successText: string,
	errorText: string,
	spinnerSize: SuccessButtonProps["spinnerSize"],
): React.ReactNode {
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

function resolveButtonStyles(
	isDisabled: boolean,
	state: SuccessButtonState,
	style?: React.CSSProperties,
): React.CSSProperties {
	return {
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
		backgroundColor:
			state === "success"
				? SUCCESS_BUTTON_STYLES.successBg
				: state === "error"
					? SUCCESS_BUTTON_STYLES.errorBg
					: SUCCESS_BUTTON_STYLES.idleBg,
		color: "#ffffff",
		...style,
	};
}

function useSuccessReset(
	state: SuccessButtonState,
	successDuration: number,
	errorDuration: number,
	onStateReset?: () => void,
) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (state === "success" && onStateReset) {
			timeoutRef.current = setTimeout(onStateReset, successDuration);
		} else if (state === "error" && onStateReset) {
			timeoutRef.current = setTimeout(onStateReset, errorDuration);
		}

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [state, successDuration, errorDuration, onStateReset]);
}

/**
 * Button with loading and success state feedback.
 *
 * State machine: idle -> loading -> success -> idle
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
	useSuccessReset(state, successDuration, errorDuration, onStateReset);

	const isDisabled = disabled || state === "loading" || state === "success";
	const buttonStyles = resolveButtonStyles(isDisabled, state, style);
	const content = resolveButtonContent(
		state,
		children,
		loadingText,
		successText,
		errorText,
		spinnerSize,
	);

	return (
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
			{content}
			{state === "success" && <span className="sr-only">Form submitted successfully</span>}
		</button>
	);
}
