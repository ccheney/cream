/**
 * Cream Logo Component
 *
 * SVG logo with size variants and animation support.
 *
 * @see docs/plans/ui/28-states.md lines 42-44
 */

import type React from "react";

// ============================================
// Types
// ============================================

/**
 * Logo size variants.
 */
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Logo variant.
 */
export type LogoVariant = "full" | "icon";

/**
 * Logo props.
 */
export interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
	/** Size variant */
	size?: LogoSize;
	/** Custom size in pixels */
	sizePx?: number;
	/** Logo variant */
	variant?: LogoVariant;
	/** Enable pulse animation */
	pulse?: boolean;
	/** Accessibility label */
	label?: string;
	/** Test ID */
	testId?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Size mapping in pixels.
 */
export const SIZE_MAP: Record<LogoSize, number> = {
	xs: 24,
	sm: 32,
	md: 48,
	lg: 64,
	xl: 96,
};

// ============================================
// Keyframes
// ============================================

const pulseKeyframes = `
  @keyframes logo-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
`;

// ============================================
// Component
// ============================================

/**
 * Cream logo component.
 *
 * Displays the Cream logo with optional pulse animation.
 *
 * @example
 * ```tsx
 * // Standard logo
 * <Logo size="md" />
 *
 * // With pulse animation (for loading)
 * <Logo size="lg" pulse />
 *
 * // Icon only
 * <Logo variant="icon" size="sm" />
 * ```
 */
export function Logo({
	size = "md",
	sizePx,
	variant = "full",
	pulse = false,
	label = "Cream",
	testId = "logo",
	style,
	className,
	...props
}: LogoProps) {
	const computedSize = sizePx ?? SIZE_MAP[size];

	const logoStyle: React.CSSProperties = {
		width: variant === "icon" ? computedSize : computedSize * 3.2,
		height: computedSize,
		animation: pulse ? "logo-pulse 2s ease-in-out infinite" : "none",
		...style,
	};

	const viewBoxWidth = variant === "icon" ? 100 : 380;

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			{pulse && <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />}
			{/* biome-ignore lint/a11y/noSvgWithoutTitle: SVG has aria-label for accessibility */}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox={`0 0 ${viewBoxWidth} 120`}
				fill="none"
				aria-label={label}
				data-testid={testId}
				className={className}
				style={logoStyle}
				{...props}
			>
				<text
					x="0"
					y="95"
					fontFamily="system-ui, -apple-system, sans-serif"
					fontSize="110"
					fontWeight="700"
					fill="currentColor"
					letterSpacing="-0.05em"
				>
					{variant === "icon" ? "C" : "Cream"}
				</text>
			</svg>
		</>
	);
}

// ============================================
// Loading Logo Component
// ============================================

/**
 * Centered loading logo with pulse animation.
 *
 * Used for full-page loading states.
 *
 * @example
 * ```tsx
 * <LoadingLogo />
 * <LoadingLogo size="lg" />
 * ```
 */
export function LoadingLogo({
	size = "lg",
	sizePx,
	variant = "icon",
	label = "Loading...",
	testId = "loading-logo",
	...props
}: Omit<LogoProps, "pulse">) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100%",
			}}
			role="status"
			aria-live="polite"
			aria-label={label}
			data-testid={`${testId}-container`}
		>
			<Logo
				size={size}
				sizePx={sizePx}
				variant={variant}
				pulse
				label={label}
				testId={testId}
				{...props}
			/>
			<span className="sr-only">{label}</span>
		</div>
	);
}

// ============================================
// Exports
// ============================================

export default Logo;
