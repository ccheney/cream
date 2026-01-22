/**
 * SourceLogo Component
 *
 * Base component for displaying company logos via LogoKit.
 * Handles loading, error states, and fallback icons.
 *
 * @see docs/plans/ui/33-logo-integration.md
 */

"use client";

import { type ImgHTMLAttributes, memo, useState } from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type SourceLogoSize = "sm" | "md" | "lg";
export type FallbackType = "globe" | "company" | "x" | "none";

export interface SourceLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "size"> {
	/** LogoKit URL for the logo */
	logoUrl?: string | null;
	/** Domain name for alt text */
	domain?: string;
	/** Size variant: sm (16px), md (24px), lg (32px) */
	size?: SourceLogoSize;
	/** Fallback icon type when logo fails to load */
	fallback?: FallbackType;
	/** Additional class names */
	className?: string;
}

// ============================================
// Size Configuration
// ============================================

const sizeConfig: Record<SourceLogoSize, { px: number; className: string }> = {
	sm: { px: 16, className: "h-4 w-4" },
	md: { px: 24, className: "h-6 w-6" },
	lg: { px: 32, className: "h-8 w-8" },
};

// ============================================
// Fallback Icons
// ============================================

interface FallbackIconProps {
	type: FallbackType;
	size: SourceLogoSize;
	className?: string;
}

const FallbackIcon = memo(function FallbackIcon({ type, size, className }: FallbackIconProps) {
	const sizeStyles = sizeConfig[size];

	if (type === "none") {
		return null;
	}

	const baseClasses = cn(
		"inline-flex items-center justify-center rounded",
		"bg-stone-100 dark:bg-stone-800",
		"border border-stone-200 dark:border-stone-700",
		"text-stone-400 dark:text-stone-500",
		sizeStyles.className,
		className,
	);

	// X (Twitter) icon
	if (type === "x") {
		return (
			<span className={baseClasses} role="img" aria-label="X (Twitter)">
				<svg viewBox="0 0 24 24" className="w-[60%] h-[60%]" fill="currentColor" aria-hidden="true">
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			</span>
		);
	}

	// Company/building icon
	if (type === "company") {
		return (
			<span className={baseClasses} role="img" aria-label="Company">
				<svg
					viewBox="0 0 24 24"
					className="w-[60%] h-[60%]"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
					<path d="M9 22v-4h6v4" />
					<path d="M8 6h.01" />
					<path d="M16 6h.01" />
					<path d="M12 6h.01" />
					<path d="M12 10h.01" />
					<path d="M12 14h.01" />
					<path d="M16 10h.01" />
					<path d="M16 14h.01" />
					<path d="M8 10h.01" />
					<path d="M8 14h.01" />
				</svg>
			</span>
		);
	}

	// Globe icon (default)
	return (
		<span className={baseClasses} role="img" aria-label="Web source">
			<svg
				viewBox="0 0 24 24"
				className="w-[60%] h-[60%]"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<path d="M2 12h20" />
				<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
			</svg>
		</span>
	);
});

// ============================================
// Loading State
// ============================================

interface LoadingSkeletonProps {
	size: SourceLogoSize;
	className?: string;
}

const LoadingSkeleton = memo(function LoadingSkeleton({ size, className }: LoadingSkeletonProps) {
	const sizeStyles = sizeConfig[size];

	return (
		// biome-ignore lint/a11y/useSemanticElements: span is appropriate for inline skeleton loading indicator
		<span
			className={cn(
				"inline-block rounded animate-pulse",
				"bg-stone-200 dark:bg-stone-700",
				sizeStyles.className,
				className,
			)}
			role="status"
			aria-label="Loading logo"
		/>
	);
});

// ============================================
// Component
// ============================================

/**
 * SourceLogo - Display company logo with loading and error states.
 *
 * @example
 * ```tsx
 * // With logo URL
 * <SourceLogo logoUrl="https://img.logokit.com/yahoo.com?token=..." domain="yahoo.com" />
 *
 * // Different sizes
 * <SourceLogo logoUrl={url} size="sm" /> // 16px
 * <SourceLogo logoUrl={url} size="md" /> // 24px (default)
 * <SourceLogo logoUrl={url} size="lg" /> // 32px
 *
 * // Custom fallback
 * <SourceLogo logoUrl={url} fallback="company" />
 * <SourceLogo logoUrl={url} fallback="x" /> // X/Twitter icon
 * ```
 */
export const SourceLogo = memo(function SourceLogo({
	logoUrl,
	domain,
	size = "md",
	fallback = "globe",
	className,
	...props
}: SourceLogoProps) {
	const [status, setStatus] = useState<"loading" | "loaded" | "error">(
		logoUrl ? "loading" : "error",
	);

	const sizeStyles = sizeConfig[size];

	// No logo URL provided
	if (!logoUrl) {
		return <FallbackIcon type={fallback} size={size} className={className} />;
	}

	// Loading state
	if (status === "loading") {
		return (
			<>
				<LoadingSkeleton size={size} className={className} />
				{/* biome-ignore lint/performance/noImgElement: external CDN images require img element */}
				<img
					src={logoUrl}
					alt=""
					className="hidden"
					onLoad={() => setStatus("loaded")}
					onError={() => setStatus("error")}
				/>
			</>
		);
	}

	// Error state - show fallback
	if (status === "error") {
		return <FallbackIcon type={fallback} size={size} className={className} />;
	}

	// Loaded state - show logo
	return (
		// biome-ignore lint/performance/noImgElement: external CDN images require img element
		<img
			src={logoUrl}
			alt={domain ? `${domain} logo` : "Source logo"}
			width={sizeStyles.px}
			height={sizeStyles.px}
			className={cn(
				"rounded object-contain",
				// Subtle grayscale by default, full color on hover
				"grayscale-[30%] opacity-90",
				"hover:grayscale-0 hover:opacity-100",
				"transition-[filter,opacity] duration-150",
				sizeStyles.className,
				className,
			)}
			loading="lazy"
			onError={() => setStatus("error")}
			{...props}
		/>
	);
});

// ============================================
// Exports
// ============================================

export { FallbackIcon, LoadingSkeleton };
export default SourceLogo;
