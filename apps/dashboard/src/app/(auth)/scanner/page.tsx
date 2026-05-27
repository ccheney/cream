"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useScannerStatus } from "@/hooks/queries";
import type { ScannerAlertData, ScannerSignal, WSMessage } from "@/lib/api/ws-invalidation";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

const MAX_SCANNER_ALERTS = 50;
const CLOCK_REFRESH_MS = 15_000;

function isScannerAlertMessage(message: WSMessage | null): message is WSMessage<ScannerAlertData> {
	return message?.type === "scanner_alert";
}

function useNowClock(intervalMs: number) {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs]);

	return now;
}

function useScannerFeed() {
	const { connected, lastMessage, subscribe, unsubscribe, send } = useWebSocketContext();
	const [alerts, setAlerts] = useState<ScannerAlertData[]>([]);

	useEffect(() => {
		if (!connected) {
			return;
		}

		subscribe(["scanner"]);
		send({ type: "request_state", channel: "scanner" });
		return () => {
			unsubscribe(["scanner"]);
		};
	}, [connected, send, subscribe, unsubscribe]);

	useEffect(() => {
		if (!isScannerAlertMessage(lastMessage)) {
			return;
		}

		setAlerts((current) => [lastMessage.data, ...current].slice(0, MAX_SCANNER_ALERTS));
	}, [lastMessage]);

	return {
		alerts,
		streamConnected: connected,
	};
}

function formatRelativeTime(timestamp: string, now: number): string {
	const elapsedMs = now - Date.parse(timestamp);
	const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
	if (elapsedSec < 60) {
		return `${elapsedSec}s ago`;
	}

	const elapsedMin = Math.floor(elapsedSec / 60);
	if (elapsedMin < 60) {
		return `${elapsedMin}m ago`;
	}

	const elapsedHour = Math.floor(elapsedMin / 60);
	return `${elapsedHour}h ago`;
}

function formatSignedPercent(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVolume(value: number): string {
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(2)}B`;
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(2)}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}
	return value.toString();
}

function signalLabel(signal: ScannerSignal): string {
	switch (signal) {
		case "volume_spike":
			return "Volume Spike";
		case "price_move":
			return "Price Move";
		case "gap":
			return "Gap";
	}
}

function signalClasses(signal: ScannerSignal): string {
	switch (signal) {
		case "volume_spike":
			return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
		case "price_move":
			return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
		case "gap":
			return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
	}
}

function ScannerStatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-cream-200 bg-white p-4 dark:border-night-700 dark:bg-night-800">
			<div className="text-xs uppercase tracking-wide text-stone-500 dark:text-night-300">
				{label}
			</div>
			<div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-stone-900 dark:text-night-50">
				{value}
			</div>
		</div>
	);
}

function ScannerRuntimeOverview({ connected }: { connected: boolean }) {
	const { data: status } = useScannerStatus();
	const connectionLabel = connected ? "Connected" : "Offline";
	const connectionClasses = connected
		? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
		: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";

	return (
		<div className="rounded-lg border border-cream-200 bg-white p-4 dark:border-night-700 dark:bg-night-800">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="text-base font-medium text-stone-900 dark:text-night-50">Runtime</h2>
				<span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${connectionClasses}`}>
					{connectionLabel}
				</span>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<ScannerStatCard label="State" value={status?.active ? "Active" : "Inactive"} />
				<ScannerStatCard label="Symbols Tracked" value={String(status?.symbolsTracked ?? 0)} />
				<ScannerStatCard label="Alerts Total" value={String(status?.totalAlerts ?? 0)} />
				<ScannerStatCard label="Alerts / Hour" value={String(status?.alertsLastHour ?? 0)} />
			</div>
		</div>
	);
}

function ScannerSignalMix({ alerts }: { alerts: ScannerAlertData[] }) {
	const signalTotals = useMemo(() => {
		const totals = {
			volume_spike: 0,
			price_move: 0,
			gap: 0,
		} satisfies Record<ScannerSignal, number>;

		for (const alert of alerts) {
			for (const signal of alert.signals) {
				totals[signal] += 1;
			}
		}

		return totals;
	}, [alerts]);

	return (
		<div className="rounded-lg border border-cream-200 bg-white p-4 dark:border-night-700 dark:bg-night-800">
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-base font-medium text-stone-900 dark:text-night-50">Signal Mix</h2>
				<span className="text-xs text-stone-500 dark:text-night-300">
					Last {alerts.length} alerts
				</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{(["volume_spike", "price_move", "gap"] as const).map((signal) => (
					<div
						key={signal}
						className="inline-flex items-center gap-2 rounded-md border border-cream-200 bg-cream-50 px-2.5 py-1 text-xs dark:border-night-700 dark:bg-night-700"
					>
						<span
							className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${signalClasses(signal)}`}
						>
							{signalLabel(signal)}
						</span>
						<span className="font-mono tabular-nums text-stone-800 dark:text-night-100">
							{signalTotals[signal]}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function ScannerAlertTape({ alerts, now }: { alerts: ScannerAlertData[]; now: number }) {
	return (
		<div className="rounded-lg border border-cream-200 bg-white p-4 dark:border-night-700 dark:bg-night-800">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="text-base font-medium text-stone-900 dark:text-night-50">Live Alert Tape</h2>
				<span className="rounded bg-cream-100 px-2 py-1 text-xs text-stone-600 dark:bg-night-700 dark:text-night-300">
					{alerts.length} buffered
				</span>
			</div>

			{alerts.length === 0 ? (
				<div className="flex h-56 items-center justify-center rounded-md border border-dashed border-cream-200 text-sm text-stone-500 dark:border-night-700 dark:text-night-300">
					Waiting for scanner alerts...
				</div>
			) : (
				<div aria-live="polite" className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
					{alerts.map((alert) => (
						<div
							key={`${alert.symbol}-${alert.timestamp}`}
							className="rounded-md border border-cream-200 bg-cream-50 p-3 dark:border-night-700 dark:bg-night-700"
						>
							<div className="flex items-center justify-between gap-2">
								<div className="font-semibold text-stone-900 dark:text-night-50">
									{alert.symbol}
								</div>
								<div className="text-xs text-stone-500 dark:text-night-300">
									{formatRelativeTime(alert.timestamp, now)}
								</div>
							</div>
							<div className="mt-2 flex flex-wrap gap-1.5">
								{alert.signals.map((signal) => (
									<span
										key={`${alert.symbol}-${alert.timestamp}-${signal}`}
										className={`rounded px-2 py-0.5 text-[11px] font-medium ${signalClasses(signal)}`}
									>
										{signalLabel(signal)}
									</span>
								))}
							</div>
							<div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums text-stone-700 dark:text-night-200">
								<div>Px ${alert.price.toFixed(2)}</div>
								<div>Vol x{alert.volumeRatio.toFixed(2)}</div>
								<div>Move {formatSignedPercent(alert.priceChangePct)}</div>
								<div>Gap {formatSignedPercent(alert.gapPct)}</div>
								<div>Bar Vol {formatVolume(alert.volume)}</div>
								<div>Avg Vol {formatVolume(alert.avgVolume)}</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function ScannerPage() {
	const now = useNowClock(CLOCK_REFRESH_MS);
	const { alerts, streamConnected } = useScannerFeed();

	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-cream-200 bg-gradient-to-r from-cream-50 to-white p-5 dark:border-night-700 dark:from-night-800 dark:to-night-800">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
							Scanner Live
						</h1>
						<p className="mt-1 text-sm text-stone-600 dark:text-night-300">
							Realtime stream of scanner detections driving event-based OODA cycles.
						</p>
					</div>
					<Link
						href="/config/scanner"
						className="inline-flex items-center rounded-md border border-cream-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-cream-100 dark:border-night-600 dark:bg-night-700 dark:text-night-100 dark:hover:bg-night-600"
					>
						Open Scanner Settings
					</Link>
				</div>
			</div>

			<ScannerRuntimeOverview connected={streamConnected} />
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
				<ScannerSignalMix alerts={alerts} />
				<ScannerAlertTape alerts={alerts} now={now} />
			</div>
		</div>
	);
}
