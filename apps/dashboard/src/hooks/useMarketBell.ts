"use client";

import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/stores/preferences-store";

const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

const CHECK_INTERVAL_MS = 10_000;

/**
 * Get the current ET time components using Intl formatting.
 */
function getETTime(date: Date): {
	hour: number;
	minute: number;
	second: number;
	weekday: string;
	dateStr: string;
} {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
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
		second: Number.parseInt(get("second"), 10),
		weekday: get("weekday"),
		dateStr: `${get("year")}-${get("month")}-${get("day")}`,
	};
}

/**
 * Play an NYSE-style bell sound using FM synthesis + additive partials.
 *
 * The real NYSE bell is a brass bell tuned to D4 (293.66 Hz) with a D# overtone,
 * struck 9 times at brisk tempo. We use FM synthesis (carrier:modulator ratio 1.4,
 * index ~1.0) for metallic inharmonic sidebands, layered with additive partials
 * for body, and a noise burst for the striker transient.
 *
 * @see https://www.nyse.com/bell
 * @see https://www.soundonsound.com/techniques/synthesizing-bells
 * @see https://charlie-roberts.com/genish/tutorial/ (FM gong recipe: c2m=1.4, index=0.95)
 */
export function playBellSound(type: "open" | "close", volume: number): void {
	const AudioContextClass =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	if (!AudioContextClass) return;

	try {
		const ctx = new AudioContextClass();

		// NYSE bell: D4 fundamental, 9 strikes for open, 3 shorter for close
		const fundamental = 293.66; // D4
		const strikes = type === "open" ? 4 : 3;
		const strikeGap = type === "open" ? 0.33 : 0.45;
		const bellDecay = 2.5;

		for (let s = 0; s < strikes; s++) {
			const t = ctx.currentTime + s * strikeGap;
			const isLast = s === strikes - 1;
			const decay = isLast ? bellDecay * 1.5 : bellDecay;
			const strikeVol = volume * (isLast ? 0.38 : 0.32);

			// --- Layer 1: FM synthesis for metallic timbre ---
			// Carrier at fundamental, modulator at 1.4x (inharmonic = bell character)
			const modulator = ctx.createOscillator();
			const modGain = ctx.createGain();
			const carrier = ctx.createOscillator();
			const carrierGain = ctx.createGain();

			modulator.frequency.value = fundamental * 1.4; // inharmonic ratio
			modulator.type = "sine";
			// Modulation index decays over time (brighter attack, mellower sustain)
			const modDepth = fundamental * 1.0;
			modGain.gain.setValueAtTime(modDepth, t);
			modGain.gain.exponentialRampToValueAtTime(modDepth * 0.08, t + decay);

			modulator.connect(modGain);
			modGain.connect(carrier.frequency);

			carrier.frequency.value = fundamental;
			carrier.type = "sine";
			carrier.connect(carrierGain);
			carrierGain.connect(ctx.destination);

			carrierGain.gain.setValueAtTime(0, t);
			carrierGain.gain.linearRampToValueAtTime(strikeVol * 0.5, t + 0.002);
			carrierGain.gain.exponentialRampToValueAtTime(strikeVol * 0.15, t + 0.3);
			carrierGain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

			modulator.start(t);
			modulator.stop(t + decay);
			carrier.start(t);
			carrier.stop(t + decay);

			// --- Layer 2: Additive partials for body and shimmer ---
			// Real bells have inharmonic partials at non-integer ratios
			const partials = [
				{ freq: fundamental, amp: 1.0, decayMul: 1.0 }, // fundamental (hum)
				{ freq: fundamental * 2.0, amp: 0.55, decayMul: 0.8 }, // octave
				{ freq: fundamental * 2.08, amp: 0.3, decayMul: 0.7 }, // D# overtone (NYSE specific)
				{ freq: fundamental * 3.0, amp: 0.2, decayMul: 0.6 }, // 12th
				{ freq: fundamental * 4.16, amp: 0.15, decayMul: 0.45 }, // inharmonic
				{ freq: fundamental * 5.43, amp: 0.08, decayMul: 0.35 }, // inharmonic
				{ freq: fundamental * 6.8, amp: 0.04, decayMul: 0.25 }, // shimmer
			];

			for (const p of partials) {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.connect(gain);
				gain.connect(ctx.destination);

				osc.frequency.value = p.freq;
				osc.type = "sine";

				const peak = strikeVol * 0.35 * p.amp;
				const partialDecay = decay * p.decayMul;

				gain.gain.setValueAtTime(0, t);
				gain.gain.linearRampToValueAtTime(peak, t + 0.002);
				gain.gain.exponentialRampToValueAtTime(peak * 0.25, t + partialDecay * 0.2);
				gain.gain.exponentialRampToValueAtTime(0.0001, t + partialDecay);

				osc.start(t);
				osc.stop(t + partialDecay + 0.01);
			}

			// --- Layer 3: Noise burst for striker transient ---
			const bufferSize = ctx.sampleRate * 0.02;
			const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
			const data = noiseBuffer.getChannelData(0);
			for (let i = 0; i < bufferSize; i++) {
				data[i] = (Math.random() * 2 - 1) * 0.5;
			}

			const noise = ctx.createBufferSource();
			const noiseGain = ctx.createGain();
			const noiseFilter = ctx.createBiquadFilter();

			noise.buffer = noiseBuffer;
			noiseFilter.type = "bandpass";
			noiseFilter.frequency.value = 3000;
			noiseFilter.Q.value = 1.5;

			noise.connect(noiseFilter);
			noiseFilter.connect(noiseGain);
			noiseGain.connect(ctx.destination);

			noiseGain.gain.setValueAtTime(strikeVol * 0.4, t);
			noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

			noise.start(t);
			noise.stop(t + 0.03);
		}

		const totalDuration = strikes * strikeGap + bellDecay * 1.5;
		setTimeout(() => ctx.close(), totalDuration * 1000 + 500);
	} catch {
		// Browser may block audio without user interaction
	}
}

/**
 * Checks if the given ET time is within a window around a target time.
 * Window: target time ± half the check interval.
 */
function isWithinWindow(
	et: { hour: number; minute: number; second: number },
	targetHour: number,
	targetMinute: number,
): boolean {
	const currentSeconds = et.hour * 3600 + et.minute * 60 + et.second;
	const targetSeconds = targetHour * 3600 + targetMinute * 60;
	const windowSeconds = CHECK_INTERVAL_MS / 1000;
	return currentSeconds >= targetSeconds && currentSeconds < targetSeconds + windowSeconds;
}

/**
 * Play NYSE-style bell sounds at market open (9:30 AM ET) and close (4:00 PM ET).
 * Respects sound.enabled and sound.marketBell preferences.
 * Only fires on weekdays. Checks every 10 seconds.
 */
export function useMarketBell(): void {
	const firedRef = useRef<{ open: string | null; close: string | null }>({
		open: null,
		close: null,
	});

	useEffect(() => {
		const interval = setInterval(() => {
			const { sound } = usePreferencesStore.getState();
			if (!sound.enabled || !sound.marketBell) return;

			const now = new Date();
			const et = getETTime(now);

			if (et.weekday === "Sat" || et.weekday === "Sun") return;

			if (
				isWithinWindow(et, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE) &&
				firedRef.current.open !== et.dateStr
			) {
				firedRef.current.open = et.dateStr;
				playBellSound("open", sound.volume);
			}

			if (
				isWithinWindow(et, MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE) &&
				firedRef.current.close !== et.dateStr
			) {
				firedRef.current.close = et.dateStr;
				playBellSound("close", sound.volume);
			}
		}, CHECK_INTERVAL_MS);

		return () => clearInterval(interval);
	}, []);
}
