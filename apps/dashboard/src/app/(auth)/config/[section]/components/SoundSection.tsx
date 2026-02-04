"use client";

/**
 * Sound Preferences Section
 *
 * Client-side sound settings stored in Zustand (localStorage).
 * Includes market bell toggle with preview buttons.
 */

import { useCallback } from "react";
import { playBellSound } from "@/hooks/useMarketBell";
import { playAlertSound, playBeep } from "@/stores/alert-store";
import { type SoundPreferences, usePreferencesStore } from "@/stores/preferences-store";

export function SoundSection() {
	const sound = usePreferencesStore((s) => s.sound);
	const updateSound = usePreferencesStore((s) => s.updateSound);

	const toggle = useCallback(
		(key: keyof SoundPreferences) => {
			updateSound({ [key]: !sound[key] });
		},
		[sound, updateSound],
	);

	const setVolume = useCallback(
		(volume: number) => {
			updateSound({ volume });
		},
		[updateSound],
	);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-6">
				Sound Preferences
			</h2>

			<div className="space-y-4">
				<ToggleRow
					title="Sound Enabled"
					description="Master toggle for all sound effects"
					enabled={sound.enabled}
					onToggle={() => toggle("enabled")}
				/>

				<VolumeRow volume={sound.volume} disabled={!sound.enabled} onChange={setVolume} />

				<ToggleRowWithPreview
					title="Critical Alerts"
					description="Play sound for critical-level alerts"
					enabled={sound.criticalAlerts}
					disabled={!sound.enabled}
					onToggle={() => toggle("criticalAlerts")}
					onPreview={() => playAlertSound("critical")}
				/>

				<ToggleRowWithPreview
					title="Trade Executions"
					description="Play sound when trades are executed"
					enabled={sound.tradeExecutions}
					disabled={!sound.enabled}
					onToggle={() => toggle("tradeExecutions")}
					onPreview={() => {
						playBeep(880, 0.12, sound.volume * 0.4);
						setTimeout(() => playBeep(1108, 0.15, sound.volume * 0.35), 150);
					}}
				/>

				<ToggleRowWithPreview
					title="Order Fills"
					description="Play sound when orders are filled"
					enabled={sound.orderFills}
					disabled={!sound.enabled}
					onToggle={() => toggle("orderFills")}
					onPreview={() => {
						playBeep(660, 0.1, sound.volume * 0.3);
						setTimeout(() => playBeep(880, 0.1, sound.volume * 0.3), 120);
						setTimeout(() => playBeep(1100, 0.15, sound.volume * 0.25), 240);
					}}
				/>

				<div className="pt-2 border-t border-cream-100 dark:border-night-700">
					<ToggleRow
						title="Market Bell"
						description="Play opening bell at 9:30 AM ET and closing bell at 4:00 PM ET"
						enabled={sound.marketBell}
						disabled={!sound.enabled}
						onToggle={() => toggle("marketBell")}
					/>

					<div className="flex items-center gap-2 mt-3 ml-0.5">
						<PreviewButton
							label="Opening Bell"
							disabled={!sound.enabled}
							onClick={() => playBellSound("open", sound.volume)}
						/>
						<PreviewButton
							label="Closing Bell"
							disabled={!sound.enabled}
							onClick={() => playBellSound("close", sound.volume)}
						/>
					</div>
				</div>
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

function ToggleRowWithPreview({
	title,
	description,
	enabled,
	disabled,
	onToggle,
	onPreview,
}: {
	title: string;
	description: string;
	enabled: boolean;
	disabled?: boolean;
	onToggle: () => void;
	onPreview: () => void;
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
			<div className="flex items-center gap-3">
				<PreviewButton label="Preview" disabled={!!disabled} onClick={onPreview} />
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
		</div>
	);
}

function VolumeRow({
	volume,
	disabled,
	onChange,
}: {
	volume: number;
	disabled: boolean;
	onChange: (v: number) => void;
}) {
	return (
		<div
			className={`flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700 ${
				disabled ? "opacity-50" : ""
			}`}
		>
			<div>
				<div className="text-sm font-medium text-stone-900 dark:text-night-50">Volume</div>
				<div className="text-xs text-stone-500 dark:text-night-300">
					{Math.round(volume * 100)}%
				</div>
			</div>
			<input
				type="range"
				min={0}
				max={1}
				step={0.05}
				value={volume}
				disabled={disabled}
				onChange={(e) => onChange(Number.parseFloat(e.target.value))}
				className="w-32 accent-blue-600"
			/>
		</div>
	);
}

function PreviewButton({
	label,
	disabled,
	onClick,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
				disabled
					? "bg-cream-100 dark:bg-night-700 text-stone-400 dark:text-night-500 cursor-not-allowed"
					: "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-200 hover:bg-cream-200 dark:hover:bg-night-600"
			}`}
		>
			{label}
		</button>
	);
}
