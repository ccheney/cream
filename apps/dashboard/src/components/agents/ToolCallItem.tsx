/**
 * ToolCallItem Component
 *
 * Collapsible display for tool invocations.
 * Follows AI SDK tool part state pattern.
 *
 * @see docs/plans/ui/24-components.md — Expandable Cards
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-with-tool-calling
 */

"use client";

import { useState } from "react";
import type { ToolCall } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

export interface ToolCallItemProps {
	/** Tool call data */
	tool: ToolCall;
	/** Additional class names */
	className?: string;
}

// ============================================
// Icons
// ============================================

function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	);
}

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("animate-spin", className)}
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

function AlertIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
	);
}

// ============================================
// Component
// ============================================

/**
 * ToolCallItem - Collapsible tool invocation display.
 *
 * @example
 * ```tsx
 * <ToolCallItem
 *   tool={{
 *     id: "tc-1",
 *     name: "get_quotes",
 *     input: { symbols: ["AAPL"] },
 *     status: "complete",
 *     durationMs: 142,
 *     timestamp: "2024-01-26T10:00:00Z"
 *   }}
 * />
 * ```
 */
export function ToolCallItem({ tool, className }: ToolCallItemProps) {
	const [isOpen, setIsOpen] = useState(false);

	const statusIcon = {
		pending: <SpinnerIcon className="h-3 w-3 text-amber-500" />,
		complete: <CheckIcon className="h-3 w-3 text-green-500" />,
		error: <AlertIcon className="h-3 w-3 text-red-500" />,
	}[tool.status];

	return (
		<div
			className={cn(
				"rounded border border-cream-200 dark:border-night-700 text-sm overflow-hidden",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-2 px-2 py-1.5 hover:bg-cream-50 dark:hover:bg-night-800 transition-colors duration-150"
				aria-expanded={isOpen}
			>
				<ChevronIcon
					className={cn(
						"h-3 w-3 text-stone-400 dark:text-night-500 transition-transform duration-200",
						isOpen && "rotate-90",
					)}
				/>
				<code className="font-mono text-xs text-stone-700 dark:text-night-200 truncate">
					{tool.name}
				</code>
				<span className="ml-auto flex items-center gap-1.5 shrink-0">
					{tool.durationMs !== undefined && (
						<span className="text-xs text-stone-400 dark:text-night-500 font-mono">
							{tool.durationMs}ms
						</span>
					)}
					{statusIcon}
				</span>
			</button>

			{isOpen && (
				<div className="border-t border-cream-200 dark:border-night-700 p-2 bg-cream-50 dark:bg-night-900">
					<div className="space-y-2">
						<div>
							<span className="text-xs text-stone-400 dark:text-night-500 uppercase tracking-wide">
								Input
							</span>
							<pre className="mt-1 text-xs font-mono text-stone-600 dark:text-night-300 overflow-x-auto p-2 bg-cream-100 dark:bg-night-800 rounded">
								{JSON.stringify(tool.input, null, 2)}
							</pre>
						</div>
						{tool.output !== undefined && (
							<div>
								<span className="text-xs text-stone-400 dark:text-night-500 uppercase tracking-wide">
									Output
								</span>
								<pre className="mt-1 text-xs font-mono text-stone-600 dark:text-night-300 overflow-x-auto p-2 bg-cream-100 dark:bg-night-800 rounded max-h-48">
									{typeof tool.output === "string"
										? tool.output
										: JSON.stringify(tool.output, null, 2)}
								</pre>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default ToolCallItem;
