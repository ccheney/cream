"use client";

import { useCallback } from "react";
import { type DisplayPreferences, usePreferencesStore } from "@/stores/preferences-store";

export function DisplaySection() {
	const display = usePreferencesStore((s) => s.display);
	const updateDisplay = usePreferencesStore((s) => s.updateDisplay);

	const toggle = useCallback(
		(key: keyof DisplayPreferences) => {
			const value = display[key];
			if (typeof value === "boolean") {
				updateDisplay({ [key]: !value });
			}
		},
		[display, updateDisplay],
	);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-6">
				Display Preferences
			</h2>

			<div className="space-y-4">
				<ToggleRow
					title="Auto Theme by Market Hours"
					description="Switch to light mode 5 min before market open (9:25 AM ET) and dark mode 5 min after close (4:05 PM ET)"
					enabled={display.autoThemeByMarketHours}
					onToggle={() => toggle("autoThemeByMarketHours")}
				/>

				<ToggleRow
					title="Animations"
					description="Enable UI animations and transitions"
					enabled={display.animationsEnabled}
					onToggle={() => toggle("animationsEnabled")}
				/>

				<ToggleRow
					title="Show Values"
					description="Display portfolio values (privacy mode when off)"
					enabled={display.showValues}
					onToggle={() => toggle("showValues")}
				/>

				<ToggleRow
					title="Compact Mode"
					description="Reduce spacing for information density"
					enabled={display.compactMode}
					onToggle={() => toggle("compactMode")}
				/>
			</div>
		</div>
	);
}

function ToggleRow({
	title,
	description,
	enabled,
	disabled,
	onToggle,
}: {
	title: string;
	description: string;
	enabled: boolean;
	disabled?: boolean;
	onToggle: () => void;
}) {
	return (
		<div
			className={`flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700 ${
				disabled ? "opacity-50" : ""
			}`}
		>
			<div>
				<div className="text-sm font-medium text-stone-900 dark:text-night-50">{title}</div>
				<div className="text-xs text-stone-500 dark:text-night-300">{description}</div>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={enabled}
				disabled={disabled}
				onClick={onToggle}
				className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-night-800 ${
					enabled ? "bg-blue-600" : "bg-cream-300 dark:bg-night-600"
				} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
			>
				<span
					className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
						enabled ? "translate-x-6" : "translate-x-1"
					}`}
				/>
			</button>
		</div>
	);
}
