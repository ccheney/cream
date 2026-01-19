/**
 * TickerBadge Component
 *
 * Company ticker symbol with logo for positions and decisions.
 * Combines LogoKit logo with ticker symbol and optional price.
 *
 * @see docs/plans/ui/33-logo-integration.md
 */

"use client";

import { type HTMLAttributes, memo } from "react";
import { SourceLogo, type SourceLogoSize } from "./source-logo";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type TickerBadgeSize = "compact" | "standard" | "large";

export interface TickerBadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	/** Stock ticker symbol (e.g., "AAPL") */
	ticker: string;
	/** LogoKit URL for the company logo */
	logoUrl?: string | null;
	/** Current price (optional) */
	price?: number;
	/** Price change percentage (optional) */
	change?: number;
	/** Size variant */
	size?: TickerBadgeSize;
	/** Additional class names */
	className?: string;
}

// ============================================
// Size Configuration
// ============================================

const sizeConfig: Record<
	TickerBadgeSize,
	{
		logoSize: SourceLogoSize;
		tickerSize: string;
		priceSize: string;
		gap: string;
		padding: string;
	}
> = {
	compact: {
		logoSize: "sm",
		tickerSize: "text-xs font-semibold",
		priceSize: "text-[11px]",
		gap: "gap-1.5",
		padding: "px-2 py-1",
	},
	standard: {
		logoSize: "md",
		tickerSize: "text-sm font-semibold",
		priceSize: "text-xs",
		gap: "gap-2",
		padding: "px-2.5 py-1.5",
	},
	large: {
		logoSize: "lg",
		tickerSize: "text-base font-semibold",
		priceSize: "text-sm",
		gap: "gap-2.5",
		padding: "px-3 py-2",
	},
};

// ============================================
// Helper Functions
// ============================================

/**
 * Format price with currency symbol
 */
function formatPrice(price: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(price);
}

/**
 * Format change percentage with sign
 */
function formatChange(change: number): string {
	const sign = change >= 0 ? "+" : "";
	return `${sign}${change.toFixed(2)}%`;
}

// ============================================
// Component
// ============================================

/**
 * TickerBadge - Company ticker with logo and optional price.
 *
 * @example
 * ```tsx
 * // Basic ticker
 * <TickerBadge ticker="AAPL" logoUrl="https://img.logokit.com/AAPL?token=..." />
 *
 * // With price
 * <TickerBadge ticker="AAPL" logoUrl={url} price={185.20} />
 *
 * // With price and change
 * <TickerBadge ticker="AAPL" logoUrl={url} price={185.20} change={2.5} />
 *
 * // Different sizes
 * <TickerBadge ticker="AAPL" size="compact" /> // 20×20 logo
 * <TickerBadge ticker="AAPL" size="standard" /> // 24×24 logo (default)
 * <TickerBadge ticker="AAPL" size="large" /> // 32×32 logo
 * ```
 */
export const TickerBadge = memo(function TickerBadge({
	ticker,
	logoUrl,
	price,
	change,
	size = "standard",
	className,
	...props
}: TickerBadgeProps) {
	const sizeStyles = sizeConfig[size];

	// Determine change color
	const changeColor =
		change === undefined
			? ""
			: change >= 0
				? "text-emerald-600 dark:text-emerald-400"
				: "text-red-600 dark:text-red-400";

	return (
		<div
			className={cn(
				"inline-flex items-center rounded-lg",
				"bg-stone-50 dark:bg-stone-800/50",
				"border border-stone-200 dark:border-stone-700",
				sizeStyles.gap,
				sizeStyles.padding,
				className
			)}
			{...props}
		>
			<SourceLogo logoUrl={logoUrl} domain={ticker} size={sizeStyles.logoSize} fallback="company" />

			<span className={cn("text-stone-900 dark:text-stone-100", sizeStyles.tickerSize)}>
				{ticker.toUpperCase()}
			</span>

			{price !== undefined && (
				<span className={cn("text-stone-600 dark:text-stone-400 font-mono", sizeStyles.priceSize)}>
					{formatPrice(price)}
				</span>
			)}

			{change !== undefined && (
				<span className={cn("font-mono", sizeStyles.priceSize, changeColor)}>
					{formatChange(change)}
				</span>
			)}
		</div>
	);
});

// ============================================
// TickerBadgeList Component
// ============================================

export interface TickerEntry {
	ticker: string;
	logoUrl?: string | null;
	price?: number;
	change?: number;
}

export interface TickerBadgeListProps {
	/** Array of tickers to display */
	tickers: TickerEntry[];
	/** Size variant */
	size?: TickerBadgeSize;
	/** Additional class names */
	className?: string;
}

/**
 * TickerBadgeList - Horizontal list of ticker badges.
 *
 * @example
 * ```tsx
 * <TickerBadgeList
 *   tickers={[
 *     { ticker: "AAPL", logoUrl: "...", price: 185.20, change: 2.5 },
 *     { ticker: "GOOGL", logoUrl: "...", price: 155.00, change: -1.2 },
 *   ]}
 * />
 * ```
 */
export const TickerBadgeList = memo(function TickerBadgeList({
	tickers,
	size = "compact",
	className,
}: TickerBadgeListProps) {
	if (tickers.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{tickers.map((entry) => (
				<TickerBadge
					key={entry.ticker}
					ticker={entry.ticker}
					logoUrl={entry.logoUrl}
					price={entry.price}
					change={entry.change}
					size={size}
				/>
			))}
		</div>
	);
});

// ============================================
// Exports
// ============================================

export default TickerBadge;
