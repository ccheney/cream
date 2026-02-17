/**
 * Toast Notification Components
 *
 * Toast UI components with variants, animations, and accessibility.
 *
 * @see docs/plans/ui/28-states.md lines 102-108
 */

import type React from "react";
import {
	EXIT_ANIMATION_DURATION,
	type Toast,
	type ToastPosition,
	type ToastVariant,
	useToastStore,
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
const VARIANT_STYLES: Record<
	ToastVariant,
	{
		borderColor: string;
		iconColor: string;
		icon: string;
		role: "status" | "alert";
		ariaLive: "polite" | "assertive";
	}
> = {
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

interface ToastColorPalette {
	borderColor: string;
	iconColor: string;
	icon: string;
	role: "status" | "alert";
	ariaLive: "polite" | "assertive";
}

interface ToastRenderStyles {
	toastStyles: React.CSSProperties;
}

interface ToastHandlers {
	onDismiss: () => void;
	onClickDismiss: () => void;
}

function buildToastStyles(
	variantStyle: ToastColorPalette,
	isDismissing: boolean,
): ToastRenderStyles {
	return {
		toastStyles: {
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
			animation: isDismissing
				? `toast-exit ${EXIT_ANIMATION_DURATION}ms ease-in forwards`
				: "toast-enter 200ms ease-out",
			pointerEvents: "auto",
		},
	};
}

function getToastHandlers(onDismiss: (id: string) => void, toastId: string): ToastHandlers {
	const onClose = () => onDismiss(toastId);
	return {
		onDismiss: onClose,
		onClickDismiss: onClose,
	};
}

function ToastIcon({ variantStyle }: { variantStyle: ToastColorPalette }) {
	return (
		<span
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: "24px",
				height: "24px",
				color: variantStyle.iconColor,
				fontWeight: "bold",
				fontSize: "14px",
			}}
			aria-hidden="true"
		>
			{variantStyle.icon}
		</span>
	);
}

function ToastContent({ toast: { title, message } }: { toast: Pick<Toast, "title" | "message"> }) {
	const titleStyles = {
		fontWeight: 600,
		fontSize: "14px",
		color: "#1c1917",
		margin: 0,
	};

	const messageStyles = {
		fontSize: "14px",
		color: "#44403c",
		margin: 0,
		lineHeight: 1.4,
	};

	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
			{title && <h4 style={titleStyles}>{title}</h4>}
			<p style={messageStyles}>{message}</p>
		</div>
	);
}

function ToastDismissButton({
	onClickDismiss,
	toastId,
}: {
	onClickDismiss: () => void;
	toastId: string;
}) {
	return (
		<button
			type="button"
			onClick={onClickDismiss}
			style={{
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
			}}
			aria-label="Dismiss notification"
			data-testid={`toast-close-${toastId}`}
		>
			×
		</button>
	);
}

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
	const handlers = getToastHandlers(onDismiss, toast.id);
	const styles = buildToastStyles(variantStyle, toast.dismissing);

	return (
		<div
			className="toast-item"
			role={variantStyle.role}
			aria-live={variantStyle.ariaLive}
			data-testid={`toast-${toast.id}`}
			style={styles.toastStyles}
		>
			{/* Icon */}
			<ToastIcon variantStyle={variantStyle} />

			{/* Content */}
			<ToastContent toast={toast} />

			{/* Close button */}
			<ToastDismissButton onClickDismiss={handlers.onDismiss} toastId={toast.id} />
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
			<style>{toastKeyframes}</style>
			<aside data-testid="toast-container" style={containerStyles} aria-label="Notifications">
				{toasts.map((toast) => (
					<ToastItem key={toast.id} toast={toast} onDismiss={handleDismiss} />
				))}
			</aside>
		</>
	);
}

// ============================================
// Exports
// ============================================

export type { Toast, ToastPosition, ToastVariant } from "../../stores/toast-store";
export { useToast } from "../../stores/toast-store";
