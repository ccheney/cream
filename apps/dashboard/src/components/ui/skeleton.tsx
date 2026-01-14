/**
 * Skeleton Loading Component
 *
 * Placeholder components with shimmer animation for loading states.
 *
 * @see docs/plans/ui/28-states.md lines 7-44
 */

import type React from "react";

// ============================================
// Types
// ============================================

/**
 * Base skeleton props.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Width of the skeleton (CSS value) */
	width?: string | number;
	/** Height of the skeleton (CSS value) */
	height?: string | number;
	/** Border radius (default: 4px) */
	radius?: string | number;
	/** Disable animation */
	animated?: boolean;
	/** Test ID */
	testId?: string;
}

/**
 * Skeleton text line props.
 */
export interface SkeletonTextProps extends Omit<SkeletonProps, "height"> {
	/** Line height (default: 16px) */
	lineHeight?: string | number;
	/** Number of lines */
	lines?: number;
	/** Last line width percentage (for paragraph effect) */
	lastLineWidth?: string;
}

/**
 * Skeleton circle props.
 */
export interface SkeletonCircleProps extends Omit<SkeletonProps, "width" | "height" | "radius"> {
	/** Circle diameter (default: 40px) */
	size?: string | number;
}

/**
 * Skeleton card props.
 */
export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Show avatar placeholder */
	avatar?: boolean;
	/** Number of text lines */
	lines?: number;
	/** Show action button placeholders */
	actions?: boolean;
	/** Card width */
	width?: string | number;
	/** Test ID */
	testId?: string;
}

// ============================================
// Styles
// ============================================

const baseStyles: React.CSSProperties = {
	display: "block",
	backgroundColor: "#e7e5e4", // stone-200
	backgroundImage: "linear-gradient(90deg, #e7e5e4 25%, #f5f5f4 50%, #e7e5e4 75%)",
	backgroundSize: "200% 100%",
	animation: "shimmer 1.5s infinite",
	borderRadius: "4px",
};

const reducedMotionStyles: React.CSSProperties = {
	animation: "none",
	opacity: 0.7,
};

const cardStyles: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "12px",
	padding: "16px",
	backgroundColor: "#ffffff",
	border: "1px solid #e7e5e4",
	borderRadius: "8px",
};

const cardHeaderStyles: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "12px",
};

const cardContentStyles: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "8px",
};

const cardActionsStyles: React.CSSProperties = {
	display: "flex",
	gap: "8px",
	marginTop: "8px",
};

// ============================================
// Utility Functions
// ============================================

/**
 * Convert size value to CSS string.
 */
function toCssValue(value: string | number | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === "number") {
		return `${value}px`;
	}
	return value;
}

/**
 * Check if prefers-reduced-motion is enabled.
 * Note: This runs client-side only.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ============================================
// Keyframes (inline style for SSR compatibility)
// ============================================

const shimmerKeyframes = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

// ============================================
// Components
// ============================================

/**
 * Base skeleton component.
 *
 * @example
 * ```tsx
 * <Skeleton width={200} height={20} />
 * <Skeleton width="100%" height={120} radius={8} />
 * ```
 */
export function Skeleton({
	width,
	height,
	radius = 4,
	animated = true,
	testId = "skeleton",
	style,
	className,
	...props
}: SkeletonProps) {
	const computedStyles: React.CSSProperties = {
		...baseStyles,
		width: toCssValue(width),
		height: toCssValue(height),
		borderRadius: toCssValue(radius),
		...(!animated && reducedMotionStyles),
		...style,
	};

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />
			<div
				role="presentation"
				aria-hidden="true"
				data-testid={testId}
				className={className}
				style={computedStyles}
				{...props}
			/>
		</>
	);
}

/**
 * Skeleton text line component.
 *
 * @example
 * ```tsx
 * <SkeletonText lines={3} />
 * <SkeletonText lines={2} lastLineWidth="60%" />
 * ```
 */
export function SkeletonText({
	lines = 1,
	lineHeight = 16,
	lastLineWidth = "80%",
	width = "100%",
	testId = "skeleton-text",
	style,
	...props
}: SkeletonTextProps) {
	const lineArray = Array.from({ length: lines }, (_, i) => i);

	return (
		<div
			data-testid={testId}
			style={{ display: "flex", flexDirection: "column", gap: "8px", ...style }}
			role="presentation"
			aria-hidden="true"
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />
			{lineArray.map((index) => (
				<Skeleton
					key={index}
					width={index === lines - 1 && lines > 1 ? lastLineWidth : width}
					height={lineHeight}
					testId={`${testId}-line-${index}`}
					{...props}
				/>
			))}
		</div>
	);
}

/**
 * Skeleton circle component.
 *
 * @example
 * ```tsx
 * <SkeletonCircle size={40} />
 * <SkeletonCircle size={64} />
 * ```
 */
export function SkeletonCircle({
	size = 40,
	testId = "skeleton-circle",
	style,
	...props
}: SkeletonCircleProps) {
	return (
		<Skeleton width={size} height={size} radius="50%" testId={testId} style={style} {...props} />
	);
}

/**
 * Skeleton card component.
 *
 * @example
 * ```tsx
 * <SkeletonCard avatar lines={3} actions />
 * <SkeletonCard lines={2} width={300} />
 * ```
 */
export function SkeletonCard({
	avatar = false,
	lines = 2,
	actions = false,
	width,
	testId = "skeleton-card",
	style,
	...props
}: SkeletonCardProps) {
	return (
		<div
			data-testid={testId}
			role="presentation"
			aria-hidden="true"
			style={{ ...cardStyles, width: toCssValue(width), ...style }}
			{...props}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />

			{/* Header with avatar */}
			{avatar && (
				<div style={cardHeaderStyles}>
					<SkeletonCircle size={40} testId={`${testId}-avatar`} />
					<div style={{ flex: 1 }}>
						<Skeleton width="60%" height={14} testId={`${testId}-title`} />
						<Skeleton
							width="40%"
							height={12}
							style={{ marginTop: "6px" }}
							testId={`${testId}-subtitle`}
						/>
					</div>
				</div>
			)}

			{/* Content lines */}
			<div style={cardContentStyles}>
				<SkeletonText lines={lines} testId={`${testId}-content`} />
			</div>

			{/* Action buttons */}
			{actions && (
				<div style={cardActionsStyles}>
					<Skeleton width={80} height={32} radius={6} testId={`${testId}-action-1`} />
					<Skeleton width={80} height={32} radius={6} testId={`${testId}-action-2`} />
				</div>
			)}
		</div>
	);
}

/**
 * Skeleton container with ARIA live region.
 *
 * @example
 * ```tsx
 * <SkeletonContainer isLoading={isLoading} label="Loading portfolio">
 *   <SkeletonCard avatar lines={3} />
 * </SkeletonContainer>
 * ```
 */
export function SkeletonContainer({
	isLoading = true,
	label = "Loading content",
	children,
	testId = "skeleton-container",
}: {
	isLoading?: boolean;
	label?: string;
	children: React.ReactNode;
	testId?: string;
}) {
	if (!isLoading) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for loading states
		<div role="status" aria-live="polite" aria-busy="true" aria-label={label} data-testid={testId}>
			<span className="sr-only">{label}</span>
			{children}
		</div>
	);
}

// ============================================
// Preset Skeleton Patterns
// ============================================

/**
 * Table row skeleton.
 */
export function SkeletonTableRow({
	columns = 4,
	testId = "skeleton-table-row",
}: {
	columns?: number;
	testId?: string;
}) {
	return (
		<div
			data-testid={testId}
			role="presentation"
			aria-hidden="true"
			style={{
				display: "flex",
				gap: "16px",
				padding: "12px 16px",
				borderBottom: "1px solid #e7e5e4",
			}}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />
			{Array.from({ length: columns }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Static column count, index is stable
				<Skeleton key={i} width={`${100 / columns}%`} height={16} testId={`${testId}-cell-${i}`} />
			))}
		</div>
	);
}

/**
 * Chart skeleton.
 */
export function SkeletonChart({
	height = 200,
	testId = "skeleton-chart",
}: {
	height?: number;
	testId?: string;
}) {
	return (
		<div
			data-testid={testId}
			role="presentation"
			aria-hidden="true"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "8px",
				padding: "16px",
				backgroundColor: "#ffffff",
				border: "1px solid #e7e5e4",
				borderRadius: "8px",
			}}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />
			{/* Header */}
			<div style={{ display: "flex", justifyContent: "space-between" }}>
				<Skeleton width={120} height={20} testId={`${testId}-title`} />
				<Skeleton width={80} height={16} testId={`${testId}-legend`} />
			</div>
			{/* Chart area */}
			<Skeleton width="100%" height={height} radius={4} testId={`${testId}-area`} />
		</div>
	);
}

/**
 * Stat card skeleton.
 */
export function SkeletonStat({ testId = "skeleton-stat" }: { testId?: string }) {
	return (
		<div
			data-testid={testId}
			role="presentation"
			aria-hidden="true"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "8px",
				padding: "16px",
				backgroundColor: "#ffffff",
				border: "1px solid #e7e5e4",
				borderRadius: "8px",
			}}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />
			<Skeleton width={100} height={14} testId={`${testId}-label`} />
			<Skeleton width={80} height={28} testId={`${testId}-value`} />
			<Skeleton width={60} height={12} testId={`${testId}-change`} />
		</div>
	);
}

// ============================================
// Exports
// ============================================

export default Skeleton;
