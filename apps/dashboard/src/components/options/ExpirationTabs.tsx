"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { ExpirationInfo } from "@/lib/api/types";

export interface ExpirationTabsProps {
	expirations: ExpirationInfo[];
	selected: string | null;
	onSelect: (date: string) => void;
	className?: string;
	"data-testid"?: string;
}

function formatExpirationLabel(exp: ExpirationInfo): string {
	// Parse as local time to avoid UTC timezone shift
	const [year, month, day] = exp.date.split("-").map(Number);
	const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
	const monthStr = date.toLocaleDateString("en-US", { month: "short" });
	return `${monthStr} ${day}`;
}

function getTypeIndicator(type: ExpirationInfo["type"]): string {
	switch (type) {
		case "monthly":
			return "M";
		case "quarterly":
			return "Q";
		default:
			return "";
	}
}

function getDteColor(dte: number): string {
	if (dte <= 7) {
		return "text-red-500 dark:text-red-400";
	}
	if (dte <= 30) {
		return "text-yellow-600 dark:text-yellow-400";
	}
	return "text-stone-500 dark:text-night-300";
}

export const ExpirationTabs = memo(function ExpirationTabs({
	expirations,
	selected,
	onSelect,
	className = "",
	"data-testid": testId,
}: ExpirationTabsProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const selectedRef = useRef<HTMLButtonElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: selected triggers scroll to center the newly selected tab
	useEffect(() => {
		if (selectedRef.current && scrollContainerRef.current) {
			const container = scrollContainerRef.current;
			const selectedEl = selectedRef.current;
			const containerWidth = container.clientWidth;
			const selectedLeft = selectedEl.offsetLeft;
			const selectedWidth = selectedEl.clientWidth;

			const scrollTarget = selectedLeft - containerWidth / 2 + selectedWidth / 2;
			container.scrollTo({ left: scrollTarget, behavior: "smooth" });
		}
	}, [selected]);

	const handleSelect = useCallback(
		(date: string) => {
			onSelect(date);
		},
		[onSelect]
	);

	if (expirations.length === 0) {
		return (
			<div
				className={`flex items-center px-4 py-2 text-stone-500 dark:text-night-300 ${className}`}
				data-testid={testId}
			>
				No expirations available
			</div>
		);
	}

	return (
		<div className={`relative ${className}`} data-testid={testId}>
			<div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-cream-50 dark:from-night-800 to-transparent z-10 pointer-events-none" />

			<div
				ref={scrollContainerRef}
				className="flex overflow-x-auto scrollbar-hide gap-1 px-4 py-2"
				style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
			>
				{expirations.map((exp) => {
					const isSelected = exp.date === selected;
					const typeIndicator = getTypeIndicator(exp.type);

					return (
						<button
							key={exp.date}
							ref={isSelected ? selectedRef : null}
							type="button"
							onClick={() => handleSelect(exp.date)}
							className={`
                relative flex flex-col items-center px-3 py-1.5 min-w-[70px]
                rounded-md transition-colors duration-150
                ${
									isSelected
										? "bg-primary text-white"
										: "bg-cream-200 dark:bg-night-700 text-stone-700 dark:text-night-200 hover:bg-cream-300 dark:hover:bg-white/[0.04]"
								}
              `}
							aria-pressed={isSelected}
							aria-label={`Expiration ${formatExpirationLabel(exp)}, ${exp.dte} days to expiration`}
						>
							{typeIndicator && (
								<span
									className={`
                    absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold
                    rounded-full flex items-center justify-center
                    ${isSelected ? "bg-white text-primary" : "bg-primary text-white"}
                  `}
								>
									{typeIndicator}
								</span>
							)}

							<span className="text-sm font-medium whitespace-nowrap">
								{formatExpirationLabel(exp)}
							</span>

							<span className={`text-xs ${isSelected ? "text-white/80" : getDteColor(exp.dte)}`}>
								{exp.dte}d
							</span>
						</button>
					);
				})}
			</div>

			<div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-cream-50 dark:from-night-800 to-transparent z-10 pointer-events-none" />
		</div>
	);
});

export default ExpirationTabs;
