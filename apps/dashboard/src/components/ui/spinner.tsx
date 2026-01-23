/**
 * Spinner Component
 *
 * Inline loading spinner for buttons and small UI areas.
 *
 * @see docs/plans/ui/28-states.md lines 35-40
 */

import type React from "react";

// ============================================
// Types
// ============================================

/**
 * Spinner size variants.
 */
export type SpinnerSize = "xs" | "sm" | "md" | "lg";

/**
 * Spinner props.
 */
export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
	/** Size variant */
	size?: SpinnerSize;
	/** Custom size in pixels (overrides size variant) */
	sizePx?: number;
	/** Disable animation */
	animated?: boolean;
	/** Accessibility label */
	label?: string;
	/** Test ID */
	testId?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Size mapping in em units (relative to parent font size).
 */
export const SIZE_MAP: Record<SpinnerSize, string> = {
	xs: "0.75em",
	sm: "1em",
	md: "1.5em",
	lg: "2em",
};

/**
 * Size mapping in pixels (for explicit sizing).
 */
export const SIZE_PX_MAP: Record<SpinnerSize, number> = {
	xs: 12,
	sm: 16,
	md: 24,
	lg: 32,
};

// ============================================
// Keyframes
// ============================================

const spinKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// ============================================
// Component
// ============================================

/**
 * Inline spinner component.
 *
 * Uses currentColor for color inheritance from parent element.
 *
 * @example
 * ```tsx
 * // In a button
 * <button>
 *   <Spinner size="sm" /> Loading...
 * </button>
 *
 * // Standalone with explicit size
 * <Spinner sizePx={48} label="Processing request" />
 * ```
 */
export function Spinner({
	size = "sm",
	sizePx,
	animated = true,
	label = "Loading",
	testId = "spinner",
	style,
	className,
	...props
}: SpinnerProps) {
	const computedSize = sizePx ? `${sizePx}px` : SIZE_MAP[size];

	const spinnerStyle: React.CSSProperties = {
		width: computedSize,
		height: computedSize,
		animation: animated ? "spin 1s linear infinite" : "none",
		opacity: animated ? 1 : 0.6,
		...style,
	};

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: spinKeyframes }} />
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				role="status"
				aria-label={label}
				data-testid={testId}
				className={className}
				style={spinnerStyle}
				{...props}
			>
				{/* Circle with gap for spinning effect */}
				<circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" fill="none" />
				<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" fill="none" />
			</svg>
		</>
	);
}

/**
 * Dots spinner variant (three bouncing dots).
 */
export function SpinnerDots({
	size = "sm",
	sizePx,
	animated = true,
	label = "Loading",
	testId = "spinner-dots",
	style,
	className,
	...props
}: SpinnerProps & React.HTMLAttributes<HTMLDivElement>) {
	const dotSize = sizePx ? sizePx / 4 : SIZE_PX_MAP[size] / 4;
	const gap = dotSize / 2;

	const containerStyle: React.CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: `${gap}px`,
		...style,
	};

	const dotStyle: React.CSSProperties = {
		width: `${dotSize}px`,
		height: `${dotSize}px`,
		borderRadius: "50%",
		backgroundColor: "currentColor",
		animation: animated ? "pulse 1.5s ease-in-out infinite" : "none",
	};

	const pulseKeyframes = `
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1); }
    }
  `;

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
			<div
				role="status"
				aria-label={label}
				data-testid={testId}
				className={className}
				style={containerStyle}
				{...props}
			>
				<div style={{ ...dotStyle, animationDelay: "0ms" }} aria-hidden="true" />
				<div style={{ ...dotStyle, animationDelay: "150ms" }} aria-hidden="true" />
				<div style={{ ...dotStyle, animationDelay: "300ms" }} aria-hidden="true" />
			</div>
		</>
	);
}

/**
 * Bar spinner variant (loading bar).
 */
export function SpinnerBar({
	size = "sm",
	animated = true,
	label = "Loading",
	testId = "spinner-bar",
	style,
	className,
}: Omit<SpinnerProps, "sizePx">) {
	const height = SIZE_PX_MAP[size] / 4;

	const containerStyle: React.CSSProperties = {
		width: "100%",
		height: `${height}px`,
		backgroundColor: "currentColor",
		opacity: 0.2,
		borderRadius: `${height / 2}px`,
		overflow: "hidden",
		position: "relative",
		...style,
	};

	const barStyle: React.CSSProperties = {
		position: "absolute",
		top: 0,
		left: 0,
		height: "100%",
		width: "40%",
		backgroundColor: "currentColor",
		borderRadius: `${height / 2}px`,
		animation: animated ? "slide 1.5s ease-in-out infinite" : "none",
	};

	const slideKeyframes = `
    @keyframes slide {
      0% { left: -40%; }
      100% { left: 100%; }
    }
  `;

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: slideKeyframes }} />
			<div
				role="status"
				aria-label={label}
				data-testid={testId}
				className={className}
				style={containerStyle}
			>
				<div style={barStyle} aria-hidden="true" />
			</div>
		</>
	);
}

// ============================================
// Button Loading State Component
// ============================================

/**
 * Button loading wrapper.
 *
 * Wraps button content to show loading state while preserving layout.
 *
 * @example
 * ```tsx
 * <button disabled={isLoading}>
 *   <ButtonLoading isLoading={isLoading}>
 *     Submit
 *   </ButtonLoading>
 * </button>
 * ```
 */
export function ButtonLoading({
	isLoading,
	children,
	spinnerSize = "sm",
	spinnerPosition = "left",
	loadingText,
}: {
	isLoading: boolean;
	children: React.ReactNode;
	spinnerSize?: SpinnerSize;
	spinnerPosition?: "left" | "right" | "center";
	loadingText?: string;
}) {
	if (!isLoading) {
		return <>{children}</>;
	}

	const content = loadingText ?? children;

	if (spinnerPosition === "center") {
		return (
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Spinner size={spinnerSize} label="Processing" />
			</span>
		);
	}

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "0.5em",
			}}
		>
			{spinnerPosition === "left" && <Spinner size={spinnerSize} label="Processing" />}
			<span style={{ opacity: loadingText ? 1 : 0.8 }}>{content}</span>
			{spinnerPosition === "right" && <Spinner size={spinnerSize} label="Processing" />}
		</span>
	);
}

// ============================================
// Loading Container
// ============================================

/**
 * Container that shows spinner overlay when loading.
 *
 * @example
 * ```tsx
 * <SpinnerOverlay isLoading={isLoading}>
 *   <CardContent />
 * </SpinnerOverlay>
 * ```
 */
export function SpinnerOverlay({
	isLoading,
	children,
	spinnerSize = "md",
	label = "Loading content",
	blur = true,
}: {
	isLoading: boolean;
	children: React.ReactNode;
	spinnerSize?: SpinnerSize;
	label?: string;
	blur?: boolean;
}) {
	return (
		<div style={{ position: "relative" }} aria-busy={isLoading}>
			<div
				style={{
					opacity: isLoading ? 0.5 : 1,
					filter: isLoading && blur ? "blur(1px)" : "none",
					transition: "opacity 0.2s, filter 0.2s",
					pointerEvents: isLoading ? "none" : "auto",
				}}
			>
				{children}
			</div>

			{isLoading && (
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: "rgba(255, 255, 255, 0.5)",
					}}
				>
					<Spinner size={spinnerSize} label={label} />
				</div>
			)}
		</div>
	);
}

// ============================================
// Loading Overlay (Pulsing)
// ============================================

const pulseOverlayKeyframes = `
  @keyframes pulseOverlay {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.6; }
  }
`;

/**
 * Pulsing overlay for loading states.
 *
 * Shows a semi-transparent pulsing overlay on top of existing content,
 * keeping the content visible but indicating loading state.
 *
 * @example
 * ```tsx
 * <LoadingOverlay isLoading={isRefetching}>
 *   <OptionsChainTable ... />
 * </LoadingOverlay>
 * ```
 */
export function LoadingOverlay({
	isLoading,
	children,
	label = "Loading",
}: {
	isLoading: boolean;
	children: React.ReactNode;
	label?: string;
}) {
	return (
		<div style={{ position: "relative", height: "100%" }} aria-busy={isLoading}>
			{children}

			{isLoading && (
				<>
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
					<style dangerouslySetInnerHTML={{ __html: pulseOverlayKeyframes }} />
					<output
						aria-label={label}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							backgroundColor: "var(--loading-overlay-bg, rgba(255, 255, 255, 0.4))",
							animation: "pulseOverlay 1.5s ease-in-out infinite",
							pointerEvents: "none",
						}}
						className="dark:!bg-night-900/50"
					/>
				</>
			)}
		</div>
	);
}

// ============================================
// Exports
// ============================================

export default Spinner;
