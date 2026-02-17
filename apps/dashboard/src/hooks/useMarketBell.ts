"use client";

import { type MutableRefObject, useEffect, useRef } from "react";
import { usePreferencesStore } from "@/stores/preferences-store";

const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

const CHECK_INTERVAL_MS = 10_000;

type BellType = "open" | "close";
type FiredState = { open: string | null; close: string | null };

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
	const AudioContextClass = getAudioContextClass();
	if (!AudioContextClass) {
		return;
	}

	try {
		const ctx = new AudioContextClass();
		const fundamental = 293.66; // D4
		const strikes = type === "open" ? 4 : 3;
		const strikeGap = type === "open" ? 0.33 : 0.45;
		const bellDecay = 2.5;

		for (let s = 0; s < strikes; s++) {
			scheduleBellStrike(ctx, {
				fundamental,
				strikeTime: ctx.currentTime + s * strikeGap,
				strikeVolume: getStrikeVolume(type, strikes, s, volume),
				decay: getStrikeDecay(strikes, s, bellDecay),
			});
		}

		const totalDuration = strikes * strikeGap + bellDecay * 1.5;
		setTimeout(() => ctx.close(), totalDuration * 1000 + 500);
	} catch {
		// Browser may block audio without user interaction
	}
}

function getAudioContextClass():
	| typeof window.AudioContext
	| typeof window.webkitAudioContext
	| undefined {
	return (
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
	);
}

function getStrikeDecay(strikes: number, index: number, bellDecay: number): number {
	const isLast = index === strikes - 1;
	return isLast ? bellDecay * 1.5 : bellDecay;
}

function getStrikeVolume(type: BellType, strikes: number, index: number, volume: number): number {
	const isLast = index === strikes - 1;
	const base = type === "open" ? 0.32 : 0.32;
	return volume * (isLast ? base + 0.06 : base);
}

function createBellPartials(
	fundamental: number,
): Array<{ freq: number; amp: number; decayMul: number }> {
	return [
		{ freq: fundamental, amp: 1.0, decayMul: 1.0 },
		{ freq: fundamental * 2.0, amp: 0.55, decayMul: 0.8 },
		{ freq: fundamental * 2.08, amp: 0.3, decayMul: 0.7 },
		{ freq: fundamental * 3.0, amp: 0.2, decayMul: 0.6 },
		{ freq: fundamental * 4.16, amp: 0.15, decayMul: 0.45 },
		{ freq: fundamental * 5.43, amp: 0.08, decayMul: 0.35 },
		{ freq: fundamental * 6.8, amp: 0.04, decayMul: 0.25 },
	];
}

function addFMLayer(
	ctx: AudioContext,
	fundamental: number,
	strikeTime: number,
	strikeVolume: number,
	decay: number,
): void {
	const modulator = ctx.createOscillator();
	const modGain = ctx.createGain();
	const carrier = ctx.createOscillator();
	const carrierGain = ctx.createGain();

	modulator.frequency.value = fundamental * 1.4;
	modulator.type = "sine";
	const modDepth = fundamental;
	modGain.gain.setValueAtTime(modDepth, strikeTime);
	modGain.gain.exponentialRampToValueAtTime(modDepth * 0.08, strikeTime + decay);

	modulator.connect(modGain);
	modGain.connect(carrier.frequency);

	carrier.frequency.value = fundamental;
	carrier.type = "sine";
	carrier.connect(carrierGain);
	carrierGain.connect(ctx.destination);

	carrierGain.gain.setValueAtTime(0, strikeTime);
	carrierGain.gain.linearRampToValueAtTime(strikeVolume * 0.5, strikeTime + 0.002);
	carrierGain.gain.exponentialRampToValueAtTime(strikeVolume * 0.15, strikeTime + 0.3);
	carrierGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + decay);

	modulator.start(strikeTime);
	modulator.stop(strikeTime + decay);
	carrier.start(strikeTime);
	carrier.stop(strikeTime + decay);
}

function addPartialLayers(
	ctx: AudioContext,
	fundamental: number,
	strikeTime: number,
	strikeVolume: number,
	decay: number,
): void {
	for (const partial of createBellPartials(fundamental)) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.value = partial.freq;
		osc.type = "sine";

		const peak = strikeVolume * 0.35 * partial.amp;
		const partialDecay = decay * partial.decayMul;
		gain.gain.setValueAtTime(0, strikeTime);
		gain.gain.linearRampToValueAtTime(peak, strikeTime + 0.002);
		gain.gain.exponentialRampToValueAtTime(peak * 0.25, strikeTime + partialDecay * 0.2);
		gain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + partialDecay);

		osc.start(strikeTime);
		osc.stop(strikeTime + partialDecay + 0.01);
	}
}

function addNoiseBurst(ctx: AudioContext, strikeTime: number, strikeVolume: number): void {
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

	noiseGain.gain.setValueAtTime(strikeVolume * 0.4, strikeTime);
	noiseGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 0.025);

	noise.start(strikeTime);
	noise.stop(strikeTime + 0.03);
}

function scheduleBellStrike(
	ctx: AudioContext,
	params: { fundamental: number; strikeTime: number; strikeVolume: number; decay: number },
): void {
	addFMLayer(ctx, params.fundamental, params.strikeTime, params.strikeVolume, params.decay);
	addPartialLayers(ctx, params.fundamental, params.strikeTime, params.strikeVolume, params.decay);
	addNoiseBurst(ctx, params.strikeTime, params.strikeVolume);
}

function isWeekday(weekday: string): boolean {
	return weekday !== "Sat" && weekday !== "Sun";
}

function tryPlayBell(
	bellType: BellType,
	et: ReturnType<typeof getETTime>,
	sound: { volume: number },
	firedRef: MutableRefObject<FiredState>,
): void {
	const targetHour = bellType === "open" ? MARKET_OPEN_HOUR : MARKET_CLOSE_HOUR;
	const targetMinute = bellType === "open" ? MARKET_OPEN_MINUTE : MARKET_CLOSE_MINUTE;

	if (!isWithinWindow(et, targetHour, targetMinute) || firedRef.current[bellType] === et.dateStr) {
		return;
	}
	firedRef.current[bellType] = et.dateStr;
	playBellSound(bellType, sound.volume);
}

function runBellCheck(firedRef: MutableRefObject<FiredState>): void {
	const { sound } = usePreferencesStore.getState();
	if (!sound.enabled || !sound.marketBell) {
		return;
	}
	const et = getETTime(new Date());
	if (!isWeekday(et.weekday)) {
		return;
	}
	tryPlayBell("open", et, sound, firedRef);
	tryPlayBell("close", et, sound, firedRef);
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
	const firedRef = useRef<FiredState>({
		open: null,
		close: null,
	});

	useEffect(() => {
		const interval = setInterval(() => runBellCheck(firedRef), CHECK_INTERVAL_MS);

		return () => clearInterval(interval);
	}, []);
}
