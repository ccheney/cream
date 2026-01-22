/**
 * SourcePill Component
 *
 * Compact pill for source attribution in agent outputs.
 * Combines logo with domain/handle, links to source.
 *
 * @see docs/plans/ui/33-logo-integration.md
 */

"use client";

import { type AnchorHTMLAttributes, memo } from "react";
import { type FallbackType, SourceLogo, type SourceLogoSize } from "./source-logo";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type SourceType = "url" | "x";

export interface SourcePillProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
	/** Source type: url or x (Twitter/X) */
	sourceType: SourceType;
	/** Full URL of the source */
	url: string;
	/** Extracted domain (e.g., "yahoo.com") */
	domain?: string;
	/** LogoKit URL for the logo */
	logoUrl?: string | null;
	/** Optional title for tooltip */
	title?: string;
	/** X handle (for sourceType='x') */
	handle?: string;
	/** Size variant */
	size?: "sm" | "md";
	/** Additional class names */
	className?: string;
}

// ============================================
// Size Configuration
// ============================================

const sizeConfig: Record<
	"sm" | "md",
	{ padding: string; fontSize: string; logoSize: SourceLogoSize }
> = {
	sm: {
		padding: "px-2 py-1",
		fontSize: "text-xs",
		logoSize: "sm",
	},
	md: {
		padding: "px-2.5 py-1.5",
		fontSize: "text-sm",
		logoSize: "sm",
	},
};

// ============================================
// Helper Functions
// ============================================

/**
 * Extract X handle from URL
 */
function extractXHandle(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === "x.com" || parsed.hostname === "twitter.com") {
			const match = parsed.pathname.match(/^\/([^/]+)/);
			if (match?.[1] && match[1] !== "i" && match[1] !== "search") {
				return `@${match[1]}`;
			}
		}
	} catch {
		// Invalid URL
	}
	return null;
}

/**
 * Determine fallback type based on source type and domain
 */
function getFallbackType(sourceType: SourceType, domain?: string): FallbackType {
	if (sourceType === "x") {
		return "x";
	}
	if (domain?.includes("x.com") || domain?.includes("twitter.com")) {
		return "x";
	}
	return "globe";
}

// ============================================
// Component
// ============================================

/**
 * SourcePill - Compact source attribution with logo.
 *
 * @example
 * ```tsx
 * // URL source
 * <SourcePill
 *   sourceType="url"
 *   url="https://finance.yahoo.com/news/..."
 *   domain="yahoo.com"
 *   logoUrl="https://img.logokit.com/yahoo.com?token=..."
 *   title="Tesla Q3 earnings beat expectations"
 * />
 *
 * // X/Twitter source
 * <SourcePill
 *   sourceType="x"
 *   url="https://x.com/elonmusk/status/..."
 *   handle="@elonmusk"
 * />
 *
 * // Auto-detect X handle from URL
 * <SourcePill
 *   sourceType="x"
 *   url="https://x.com/zerohedge/status/..."
 * />
 * ```
 */
export const SourcePill = memo(function SourcePill({
	sourceType,
	url,
	domain,
	logoUrl,
	title,
	handle,
	size = "sm",
	className,
	...props
}: SourcePillProps) {
	const sizeStyles = sizeConfig[size];
	const fallbackType = getFallbackType(sourceType, domain);

	// For X sources, extract handle from URL if not provided
	const displayHandle = handle ?? (sourceType === "x" ? extractXHandle(url) : null);

	// Display text: handle for X, domain for URLs
	const displayText = displayHandle ?? domain ?? new URL(url).hostname.replace(/^www\./, "");

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			title={title ?? url}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full",
				"border border-stone-200 dark:border-stone-700",
				"bg-stone-50 dark:bg-stone-800/50",
				"text-stone-600 dark:text-stone-400",
				"hover:bg-stone-100 dark:hover:bg-stone-800",
				"hover:border-stone-300 dark:hover:border-stone-600",
				"transition-colors duration-150",
				"no-underline",
				sizeStyles.padding,
				sizeStyles.fontSize,
				className,
			)}
			{...props}
		>
			<SourceLogo
				logoUrl={logoUrl}
				domain={domain}
				size={sizeStyles.logoSize}
				fallback={fallbackType}
			/>
			<span className="truncate max-w-[120px]">{displayText}</span>
		</a>
	);
});

// ============================================
// SourcePillList Component
// ============================================

export interface SourceEntry {
	sourceId?: string;
	sourceType: SourceType;
	url: string;
	domain?: string;
	logoUrl?: string | null;
	title?: string;
}

export interface SourcePillListProps {
	/** Array of sources to display */
	sources: SourceEntry[];
	/** Size variant */
	size?: "sm" | "md";
	/** Maximum sources to show (rest hidden with "+N more") */
	maxVisible?: number;
	/** Additional class names */
	className?: string;
}

/**
 * SourcePillList - Horizontal scrollable list of source pills.
 *
 * @example
 * ```tsx
 * <SourcePillList
 *   sources={[
 *     { sourceType: "url", url: "https://yahoo.com/...", domain: "yahoo.com", logoUrl: "..." },
 *     { sourceType: "x", url: "https://x.com/elonmusk/...", domain: "x.com" },
 *   ]}
 *   maxVisible={5}
 * />
 * ```
 */
export const SourcePillList = memo(function SourcePillList({
	sources,
	size = "sm",
	maxVisible = 10,
	className,
}: SourcePillListProps) {
	if (sources.length === 0) {
		return null;
	}

	const visibleSources = sources.slice(0, maxVisible);
	const hiddenCount = sources.length - maxVisible;

	return (
		<div className={cn("flex flex-wrap gap-2 items-center", className)}>
			{visibleSources.map((source, index) => (
				<SourcePill
					key={source.sourceId ?? `${source.url}-${index}`}
					sourceType={source.sourceType}
					url={source.url}
					domain={source.domain}
					logoUrl={source.logoUrl}
					title={source.title}
					size={size}
				/>
			))}
			{hiddenCount > 0 && (
				<span
					className={cn(
						"text-stone-500 dark:text-stone-400",
						size === "sm" ? "text-xs" : "text-sm",
					)}
				>
					+{hiddenCount} more
				</span>
			)}
		</div>
	);
});

// ============================================
// Exports
// ============================================

export default SourcePill;
