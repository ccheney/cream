/**
 * Decision Detail Utility Functions
 *
 * Formatting utilities for decision-related display values.
 */

export function formatSizeUnit(unit: string): string {
	const map: Record<string, string> = {
		PCT_EQUITY: "% equity",
		SHARES: "shares",
		CONTRACTS: "contracts",
		DOLLARS: "",
	};
	return map[unit] ?? unit.toLowerCase().replaceAll("_", " ");
}

export function formatSize(size: number, unit: string): string {
	if (unit === "DOLLARS") {
		return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(size);
	}
	return `${size} ${formatSizeUnit(unit)}`;
}

export function formatStrategy(strategy: string | null): string {
	if (!strategy) {
		return "—";
	}
	return strategy
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

export function formatTimeHorizon(horizon: string | null): string {
	if (!horizon) {
		return "—";
	}
	const map: Record<string, string> = {
		SCALP: "Scalp",
		DAY: "Day Trade",
		SWING: "Swing",
		POSITION: "Position",
	};
	return map[horizon] ?? horizon;
}

export function formatPrice(price: number | null): string {
	return price
		? new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(price)
		: "--";
}

export function formatAgentName(type: string): string {
	return type.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const actionColors: Record<string, string> = {
	BUY: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	SELL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	HOLD: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400",
	CLOSE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export const statusColors: Record<string, string> = {
	PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	EXECUTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
