/** @see docs/plans/ui/40-streaming-data-integration.md Part 4.3 */

"use client";

import { memo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";

export type GreekType = "delta" | "gamma" | "theta" | "vega" | "rho";

export interface GreekCardProps {
	type: GreekType;
	value: number;
	limit?: number;
	size?: "sm" | "md" | "lg";
	isStreaming?: boolean;
	className?: string;
}

interface GreekConfig {
	letter: string;
	name: string;
	unit: string;
	format: (value: number) => string;
	colorPositive: string;
	colorNegative: string;
}

const GREEK_CONFIG: Record<GreekType, GreekConfig> = {
	delta: {
		letter: "Δ",
		name: "Delta",
		unit: "notional",
		format: (v) => `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
		colorPositive: "text-green-600 dark:text-green-400",
		colorNegative: "text-red-600 dark:text-red-400",
	},
	gamma: {
		letter: "Γ",
		name: "Gamma",
		unit: "per $1 move",
		format: (v) => `${v >= 0 ? "+" : ""}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
		colorPositive: "text-stone-700 dark:text-night-100 dark:text-night-200",
		colorNegative: "text-stone-700 dark:text-night-100 dark:text-night-200",
	},
	theta: {
		letter: "Θ",
		name: "Theta",
		unit: "time decay",
		format: (v) => `$${Math.abs(v).toFixed(0)}/day`,
		colorPositive: "text-green-600 dark:text-green-400",
		colorNegative: "text-red-600 dark:text-red-400",
	},
	vega: {
		letter: "V",
		name: "Vega",
		unit: "per 1% IV",
		format: (v) => `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
		colorPositive: "text-stone-700 dark:text-night-100 dark:text-night-200",
		colorNegative: "text-stone-700 dark:text-night-100 dark:text-night-200",
	},
	rho: {
		letter: "ρ",
		name: "Rho",
		unit: "per 1% rate",
		format: (v) => `$${Math.abs(v).toFixed(0)}`,
		colorPositive: "text-stone-700 dark:text-night-100 dark:text-night-200",
		colorNegative: "text-stone-700 dark:text-night-100 dark:text-night-200",
	},
};

const SIZE_CLASSES = {
	sm: { letter: "text-2xl", value: "text-lg", label: "text-[10px]", padding: "p-3" },
	md: { letter: "text-3xl", value: "text-xl", label: "text-xs", padding: "p-4" },
	lg: { letter: "text-4xl", value: "text-2xl", label: "text-sm", padding: "p-5" },
} as const;

interface GreekLimitState {
	textColor: string;
}

function getGreekValueColor(type: GreekType, value: number, config: GreekConfig): string {
	if (type === "theta") {
		return value > 0 ? config.colorPositive : config.colorNegative;
	}
	return value >= 0 ? config.colorPositive : config.colorNegative;
}

function getLimitState(limit: number | null): GreekLimitState {
	if (limit === null) {
		return { textColor: "" };
	}
	if (limit >= 0.95) {
		return { textColor: "text-red-500" };
	}
	if (limit >= 0.8) {
		return { textColor: "text-amber-500" };
	}
	return { textColor: "" };
}

function getLimitLabel(limitUtilization: number | null) {
	if (limitUtilization === null) {
		return null;
	}
	return `(${(limitUtilization * 100).toFixed(0)}%)`;
}

function renderGreekValue(type: GreekType, value: number) {
	if (type === "delta" || type === "vega") {
		return (
			<AnimatedNumber
				value={value}
				format="currency"
				decimals={0}
				className="inline"
				animationThreshold={100}
			/>
		);
	}

	if (type === "theta") {
		return (
			<>
				{value < 0 ? "-" : "+"}$
				<AnimatedNumber value={Math.abs(value)} format="decimal" decimals={0} className="inline" />
				/day
			</>
		);
	}

	return (
		<>
			{value >= 0 ? "+" : ""}
			<AnimatedNumber value={value} format="decimal" decimals={0} className="inline" />
		</>
	);
}

export const GreekCard = memo(function GreekCard({
	type,
	value,
	limit,
	size = "md",
	isStreaming = false,
	className = "",
}: GreekCardProps) {
	const config = GREEK_CONFIG[type];
	const sizes = SIZE_CLASSES[size];
	const limitUtilization = limit ? Math.abs(value) / limit : null;
	const isAtLimit = Boolean(limitUtilization && limitUtilization >= 0.95);
	const isNearLimit = Boolean(limitUtilization && limitUtilization >= 0.8);
	const valueColor = getGreekValueColor(type, value, config);
	const limitState = getLimitState(limitUtilization);
	const limitLabel = getLimitLabel(limitUtilization);

	return (
		<div
			className={`
        relative text-center ${sizes.padding}
        bg-cream-50 dark:bg-night-700 rounded-lg
        border border-cream-200 dark:border-night-600
        ${isAtLimit ? "border-red-500 dark:border-red-500" : ""}
        ${isNearLimit && !isAtLimit ? "border-amber-500 dark:border-amber-500" : ""}
        ${className}
      `}
		>
			{isStreaming && (
				<span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
			)}

			<div
				className={`${sizes.letter} font-serif text-cream-300 dark:text-stone-600 dark:text-night-200`}
			>
				{config.letter}
			</div>

			<div className={`${sizes.label} text-stone-500 dark:text-night-300 mt-1`}>{config.name}</div>

			<div className={`mt-2 ${sizes.value} font-mono font-semibold ${valueColor}`}>
				{renderGreekValue(type, value)}
			</div>

			<div className={`${sizes.label} text-stone-400 dark:text-night-400 mt-1`}>{config.unit}</div>

			{limit !== undefined && (
				<div className={`${sizes.label} text-stone-400 dark:text-night-400 mt-2`}>
					Limit: {config.format(limit)}
					{limitLabel ? <span className={`ml-1 ${limitState.textColor}`}>{limitLabel}</span> : null}
				</div>
			)}
		</div>
	);
});

export default GreekCard;
