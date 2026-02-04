"use client";

import { useEffect, useRef } from "react";
import { applyTheme, usePreferencesStore } from "@/stores/preferences-store";

const LIGHT_HOUR = 9;
const LIGHT_MINUTE = 25; // 5 min before 9:30 open
const DARK_HOUR = 16;
const DARK_MINUTE = 5; // 5 min after 16:00 close

const CHECK_INTERVAL_MS = 10_000;

function getETTime(date: Date): { hour: number; minute: number; weekday: string; dateStr: string } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		hour: "numeric",
		minute: "numeric",
		hour12: false,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

	return {
		hour: Number.parseInt(get("hour"), 10),
		minute: Number.parseInt(get("minute"), 10),
		weekday: get("weekday"),
		dateStr: `${get("year")}-${get("month")}-${get("day")}`,
	};
}

function getTargetTheme(et: { hour: number; minute: number }): "light" | "dark" {
	const mins = et.hour * 60 + et.minute;
	const lightAt = LIGHT_HOUR * 60 + LIGHT_MINUTE;
	const darkAt = DARK_HOUR * 60 + DARK_MINUTE;

	if (mins >= lightAt && mins < darkAt) {
		return "light";
	}
	return "dark";
}

/**
 * Auto-switch theme based on market hours.
 * Light mode at 9:25 AM ET (5 min before open), dark mode at 4:05 PM ET (5 min after close).
 * Only fires on weekdays. Respects display.autoThemeByMarketHours preference.
 */
export function useMarketTheme(): void {
	const appliedRef = useRef<{ light: string | null; dark: string | null }>({
		light: null,
		dark: null,
	});

	useEffect(() => {
		const check = () => {
			const { display } = usePreferencesStore.getState();
			if (!display.autoThemeByMarketHours) return;

			const now = new Date();
			const et = getETTime(now);

			if (et.weekday === "Sat" || et.weekday === "Sun") return;

			const target = getTargetTheme(et);

			if (appliedRef.current[target] === et.dateStr) return;

			appliedRef.current[target] = et.dateStr;
			applyTheme(target);
			usePreferencesStore.getState().updateDisplay({ theme: target });
		};

		check();
		const interval = setInterval(check, CHECK_INTERVAL_MS);
		return () => clearInterval(interval);
	}, []);
}
