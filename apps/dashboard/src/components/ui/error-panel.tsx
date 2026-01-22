/**
 * Error Panel Component
 *
 * Inline error panels for persistent errors and error states.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import type React from "react";
import { useCallback, useEffect, useRef } from "react";

// ============================================
// Types
// ============================================

/**
 * Error panel variant.
 */
export type ErrorPanelVariant = "error" | "warning" | "info";

/**
 * Error action button.
 */
export interface ErrorAction {
	label: string;
	onClick: () => void;
	variant?: "primary" | "secondary";
}

/**
 * Error panel props.
 */
export interface ErrorPanelProps {
	/** Error title */
	title: string;
	/** Error message (what went wrong) */
	message: string;
	/** Optional hint (what to do next) */
	hint?: string;
	/** Error code or ID for debugging */
	errorCode?: string;
	/** Panel variant */
	variant?: ErrorPanelVariant;
	/** Action buttons */
	actions?: ErrorAction[];
	/** Whether panel is dismissible */
	dismissible?: boolean;
	/** Called when panel is dismissed */
	onDismiss?: () => void;
	/** Test ID */
	testId?: string;
	/** Auto-focus on mount */
	autoFocus?: boolean;
}

// ============================================
// Constants
// ============================================

const VARIANT_STYLES: Record<
	ErrorPanelVariant,
	{
		background: string;
		border: string;
		iconColor: string;
		icon: string;
	}
> = {
	error: {
		background: "rgba(239, 68, 68, 0.1)", // red-500/10
		border: "#ef4444", // red-500
		iconColor: "#dc2626", // red-600
		icon: "⚠",
	},
	warning: {
		background: "rgba(245, 158, 11, 0.1)", // amber-500/10
		border: "#f59e0b", // amber-500
		iconColor: "#d97706", // amber-600
		icon: "⚠",
	},
	info: {
		background: "rgba(59, 130, 246, 0.1)", // blue-500/10
		border: "#3b82f6", // blue-500
		iconColor: "#2563eb", // blue-600
		icon: "ℹ",
	},
};

// ============================================
// Component
// ============================================

/**
 * Error panel component for persistent errors.
 *
 * @example
 * ```tsx
 * <ErrorPanel
 *   title="Failed to load positions"
 *   message="Unable to connect to the trading server."
 *   hint="Check your internet connection and try again."
 *   actions={[
 *     { label: "Retry", onClick: handleRetry },
 *     { label: "Contact Support", onClick: handleSupport, variant: "secondary" },
 *   ]}
 * />
 * ```
 */
export function ErrorPanel({
	title,
	message,
	hint,
	errorCode,
	variant = "error",
	actions,
	dismissible = false,
	onDismiss,
	testId = "error-panel",
	autoFocus = false,
}: ErrorPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const variantStyle = VARIANT_STYLES[variant];

	// Handle keyboard dismiss
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape" && dismissible && onDismiss) {
				onDismiss();
			}
		},
		[dismissible, onDismiss],
	);

	useEffect(() => {
		if (dismissible) {
			document.addEventListener("keydown", handleKeyDown);
			return () => document.removeEventListener("keydown", handleKeyDown);
		}
		return undefined;
	}, [dismissible, handleKeyDown]);

	// Auto-focus on mount
	useEffect(() => {
		if (autoFocus && panelRef.current) {
			panelRef.current.focus();
		}
	}, [autoFocus]);

	const containerStyles: React.CSSProperties = {
		display: "flex",
		gap: "12px",
		padding: "16px",
		backgroundColor: variantStyle.background,
		border: `1px solid ${variantStyle.border}`,
		borderRadius: "8px",
		position: "relative",
	};

	const iconStyles: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: "24px",
		height: "24px",
		color: variantStyle.iconColor,
		fontSize: "18px",
		flexShrink: 0,
	};

	const contentStyles: React.CSSProperties = {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		gap: "8px",
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
		lineHeight: 1.5,
	};

	const hintStyles: React.CSSProperties = {
		fontSize: "13px",
		color: "#78716c",
		margin: 0,
		lineHeight: 1.4,
	};

	const errorCodeStyles: React.CSSProperties = {
		fontSize: "12px",
		color: "#a8a29e",
		fontFamily: "monospace",
		marginTop: "4px",
	};

	const actionsStyles: React.CSSProperties = {
		display: "flex",
		gap: "8px",
		marginTop: "8px",
	};

	const buttonBaseStyles: React.CSSProperties = {
		padding: "8px 16px",
		borderRadius: "6px",
		fontSize: "14px",
		fontWeight: 500,
		cursor: "pointer",
		border: "none",
		transition: "background-color 0.15s, opacity 0.15s",
	};

	const primaryButtonStyles: React.CSSProperties = {
		...buttonBaseStyles,
		backgroundColor: variantStyle.border,
		color: "#ffffff",
	};

	const secondaryButtonStyles: React.CSSProperties = {
		...buttonBaseStyles,
		backgroundColor: "transparent",
		color: "#44403c",
		border: "1px solid #d6d3d1",
	};

	const closeButtonStyles: React.CSSProperties = {
		position: "absolute",
		top: "12px",
		right: "12px",
		width: "24px",
		height: "24px",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		border: "none",
		background: "transparent",
		cursor: "pointer",
		color: "#78716c",
		fontSize: "18px",
		padding: 0,
		borderRadius: "4px",
	};

	return (
		<div
			ref={panelRef}
			role="alert"
			aria-live="assertive"
			data-testid={testId}
			style={containerStyles}
			tabIndex={autoFocus ? -1 : undefined}
		>
			{/* Icon */}
			<span style={iconStyles} aria-hidden="true">
				{variantStyle.icon}
			</span>

			{/* Content */}
			<div style={contentStyles}>
				<h4 style={titleStyles}>{title}</h4>
				<p style={messageStyles}>{message}</p>
				{hint && <p style={hintStyles}>{hint}</p>}
				{errorCode && <span style={errorCodeStyles}>Error code: {errorCode}</span>}

				{/* Actions */}
				{actions && actions.length > 0 && (
					<div style={actionsStyles}>
						{actions.map((action) => (
							<button
								key={action.label}
								type="button"
								onClick={action.onClick}
								style={action.variant === "secondary" ? secondaryButtonStyles : primaryButtonStyles}
								data-testid={`${testId}-action-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
							>
								{action.label}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Dismiss button */}
			{dismissible && onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					style={closeButtonStyles}
					aria-label="Dismiss error"
					data-testid={`${testId}-dismiss`}
				>
					×
				</button>
			)}
		</div>
	);
}

// ============================================
// Compact Error Panel
// ============================================

/**
 * Compact inline error for form fields.
 */
export function ErrorInline({
	message,
	testId = "error-inline",
}: {
	message: string;
	testId?: string;
}) {
	const styles: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		padding: "8px 12px",
		backgroundColor: "rgba(239, 68, 68, 0.1)",
		borderRadius: "6px",
		fontSize: "13px",
		color: "#dc2626",
	};

	return (
		<div role="alert" data-testid={testId} style={styles}>
			<span aria-hidden="true">⚠</span>
			<span>{message}</span>
		</div>
	);
}

// ============================================
// API Error Panel
// ============================================

/**
 * Pre-configured error panel for API errors.
 */
export function ApiErrorPanel({
	error,
	onRetry,
	onDismiss,
	testId = "api-error-panel",
}: {
	error: {
		message: string;
		code?: string;
		statusCode?: number;
	};
	onRetry?: () => void;
	onDismiss?: () => void;
	testId?: string;
}) {
	const actions: ErrorAction[] = [];

	if (onRetry) {
		actions.push({
			label: "Try Again",
			onClick: onRetry,
			variant: "primary",
		});
	}

	if (onDismiss) {
		actions.push({
			label: "Dismiss",
			onClick: onDismiss,
			variant: "secondary",
		});
	}

	return (
		<ErrorPanel
			title="Something went wrong"
			message={error.message}
			hint="If this problem persists, please contact support."
			errorCode={error.code ?? (error.statusCode ? `HTTP ${error.statusCode}` : undefined)}
			actions={actions}
			dismissible={!!onDismiss}
			onDismiss={onDismiss}
			testId={testId}
		/>
	);
}

// ============================================
// Connection Error Panel
// ============================================

/**
 * Pre-configured error panel for connection errors.
 */
export function ConnectionErrorPanel({
	onRetry,
	testId = "connection-error-panel",
}: {
	onRetry?: () => void;
	testId?: string;
}) {
	return (
		<ErrorPanel
			title="Connection Lost"
			message="Unable to connect to the server."
			hint="Check your internet connection and try again."
			actions={onRetry ? [{ label: "Reconnect", onClick: onRetry }] : []}
			testId={testId}
		/>
	);
}

// ============================================
// Exports
// ============================================

export default ErrorPanel;
