/**
 * AgentBadge Component
 *
 * Badge for agent type identification with semantic colors.
 *
 * @see docs/plans/ui/32-design-appendix.md agent-badge.tsx
 * @see docs/plans/ui/21-color-system.md Agent Colors (lines 111-124)
 */

import { forwardRef, type HTMLAttributes } from "react";

function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

export type AgentType =
	| "technical"
	| "sentiment"
	| "fundamentals"
	| "bullish"
	| "bearish"
	| "trader"
	| "risk"
	| "critic";

export type AgentBadgeSize = "sm" | "md" | "lg";

export interface AgentBadgeProps extends HTMLAttributes<HTMLSpanElement> {
	/** Agent type */
	agent: AgentType;
	/** Size variant */
	size?: AgentBadgeSize;
	/** Show agent label text */
	showLabel?: boolean;
	/** Additional class names */
	className?: string;
}

const agentConfig: Record<
	AgentType,
	{ color: string; bgColor: string; label: string; icon: string }
> = {
	technical: {
		color: "text-violet-600 dark:text-violet-400",
		bgColor: "bg-violet-100 dark:bg-violet-900/30",
		label: "Technical",
		icon: "T",
	},
	sentiment: {
		color: "text-pink-600 dark:text-pink-400",
		bgColor: "bg-pink-100 dark:bg-pink-900/30",
		label: "Sentiment",
		icon: "S",
	},
	fundamentals: {
		color: "text-teal-600 dark:text-teal-400",
		bgColor: "bg-teal-100 dark:bg-teal-900/30",
		label: "Fundamentals",
		icon: "F",
	},
	bullish: {
		color: "text-green-600 dark:text-green-400",
		bgColor: "bg-green-100 dark:bg-green-900/30",
		label: "Bullish",
		icon: "B+",
	},
	bearish: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-100 dark:bg-red-900/30",
		label: "Bearish",
		icon: "B-",
	},
	trader: {
		color: "text-amber-600 dark:text-amber-400",
		bgColor: "bg-amber-100 dark:bg-amber-900/30",
		label: "Trader",
		icon: "TR",
	},
	risk: {
		color: "text-orange-600 dark:text-orange-400",
		bgColor: "bg-orange-100 dark:bg-orange-900/30",
		label: "Risk",
		icon: "R",
	},
	critic: {
		color: "text-indigo-600 dark:text-indigo-400",
		bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
		label: "Critic",
		icon: "C",
	},
};

const sizeConfig: Record<AgentBadgeSize, { badge: string; icon: string; text: string }> = {
	sm: {
		badge: "px-1.5 py-0.5 gap-1",
		icon: "h-4 w-4 text-xs",
		text: "text-xs",
	},
	md: {
		badge: "px-2 py-1 gap-1.5",
		icon: "h-5 w-5 text-sm",
		text: "text-sm",
	},
	lg: {
		badge: "px-2.5 py-1.5 gap-2",
		icon: "h-6 w-6 text-base",
		text: "text-base",
	},
};

/**
 * AgentBadge - Badge for agent type identification.
 *
 * Each agent type has a distinct color for quick visual identification
 * in consensus views and agent outputs.
 *
 * @example
 * ```tsx
 * // Icon only
 * <AgentBadge agent="technical" />
 *
 * // With label
 * <AgentBadge agent="risk" showLabel />
 *
 * // Different sizes
 * <AgentBadge agent="trader" size="lg" showLabel />
 * ```
 */
export const AgentBadge = forwardRef<HTMLSpanElement, AgentBadgeProps>(
	({ agent, size = "md", showLabel = false, className, ...props }, ref) => {
		const config = agentConfig[agent];
		const sizeStyles = sizeConfig[size];

		return (
			<span
				ref={ref}
				className={cn(
					"inline-flex items-center rounded-full font-medium",
					sizeStyles.badge,
					config.bgColor,
					config.color,
					className,
				)}
				title={config.label}
				{...props}
			>
				<span
					className={cn(
						"inline-flex items-center justify-center rounded-full font-semibold shrink-0",
						sizeStyles.icon,
					)}
					aria-hidden="true"
				>
					{config.icon}
				</span>
				{showLabel && <span className={sizeStyles.text}>{config.label}</span>}
			</span>
		);
	},
);

AgentBadge.displayName = "AgentBadge";

export function getAgentInfo(agent: AgentType) {
	return agentConfig[agent];
}

export const AGENT_TYPES: AgentType[] = [
	"technical",
	"sentiment",
	"fundamentals",
	"bullish",
	"bearish",
	"trader",
	"risk",
	"critic",
];

export default AgentBadge;
