/**
 * ReasoningBlock Component
 *
 * Collapsible component displaying AI reasoning content.
 * Follows AI SDK Elements Reasoning pattern.
 *
 * @see docs/plans/ui/25-motion.md — Animation timings
 * @see https://ai-sdk.dev/elements/components/reasoning
 */

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

export interface ReasoningBlockProps {
	/** Reasoning content text */
	content: string;
	/** Whether content is still streaming */
	isStreaming?: boolean;
	/** Additional class names */
	className?: string;
}

// ============================================
// Component
// ============================================

/**
 * ReasoningBlock - Collapsible AI thinking display.
 *
 * @example
 * ```tsx
 * <ReasoningBlock
 *   content="Analyzing market conditions..."
 *   isStreaming={true}
 * />
 * ```
 */
export function ReasoningBlock({ content, isStreaming = false, className }: ReasoningBlockProps) {
	const [isOpen, setIsOpen] = useState(isStreaming);

	// Auto-open when streaming starts
	useEffect(() => {
		if (isStreaming && !isOpen) {
			setIsOpen(true);
		}
	}, [isStreaming, isOpen]);

	return (
		<div
			className={cn(
				"rounded-md border border-cream-300 dark:border-night-700 overflow-hidden",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-500 dark:text-night-400 hover:bg-cream-100 dark:hover:bg-night-800 transition-colors duration-150"
				aria-expanded={isOpen}
			>
				<svg
					aria-hidden="true"
					className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
				<span>Thinking{isStreaming ? "..." : ""}</span>
				{isStreaming && (
					<span className="ml-auto h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
				)}
			</button>

			{isOpen && (
				<div className="px-3 py-2 text-sm border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-900">
					<p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-600 dark:text-night-300">
						{content}
						{isStreaming && (
							<span className="inline-block w-1.5 h-4 ml-0.5 bg-stone-600 dark:bg-night-300 animate-blink" />
						)}
					</p>
				</div>
			)}
		</div>
	);
}

export default ReasoningBlock;
