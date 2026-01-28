/**
 * @see docs/plans/ui/29-accessibility.md
 */

export interface ChartStats {
	current?: number;
	min?: number;
	max?: number;
	mean?: number;
	change?: number;
	changePercent?: number;
}

export interface TimeRange {
	start: string | Date;
	end: string | Date;
}

export interface ChartDescriptionOptions {
	chartType: string;
	title?: string;
	stats?: ChartStats;
	timeRange?: TimeRange;
	dataPointCount?: number;
}

export function generateChartAriaLabel(options: ChartDescriptionOptions): string {
	const { chartType, title, stats, timeRange } = options;

	let label = title ? `${title} - ` : "";
	label += `${chartType} chart`;

	if (timeRange) {
		const start = formatDate(timeRange.start);
		const end = formatDate(timeRange.end);
		label += ` from ${start} to ${end}`;
	}

	if (stats?.current !== undefined) {
		label += `. Current value: ${formatValue(stats.current)}`;
	}

	return label;
}

export function generateChartDescription(options: ChartDescriptionOptions): string {
	const { chartType, stats, dataPointCount } = options;

	const lines: string[] = [];

	lines.push(`${chartType} visualization.`);

	if (dataPointCount !== undefined) {
		lines.push(`Contains ${dataPointCount} data points.`);
	}

	if (stats) {
		if (stats.current !== undefined) {
			lines.push(`Current value: ${formatValue(stats.current)}.`);
		}
		if (stats.min !== undefined) {
			lines.push(`Minimum: ${formatValue(stats.min)}.`);
		}
		if (stats.max !== undefined) {
			lines.push(`Maximum: ${formatValue(stats.max)}.`);
		}
		if (stats.mean !== undefined) {
			lines.push(`Average: ${formatValue(stats.mean)}.`);
		}
		if (stats.changePercent !== undefined) {
			const direction = stats.changePercent >= 0 ? "gain" : "loss";
			lines.push(`Overall ${direction}: ${formatPercent(Math.abs(stats.changePercent))}.`);
		}
	}

	return lines.join(" ");
}

export function generateUpdateAnnouncement(
	chartType: string,
	newValue: number,
	previousValue?: number,
): string {
	const formatted = formatValue(newValue);

	if (previousValue === undefined) {
		return `${chartType} updated to ${formatted}`;
	}

	const change = newValue - previousValue;
	const direction = change >= 0 ? "increased" : "decreased";
	const changeFormatted = formatValue(Math.abs(change));

	return `${chartType} ${direction} to ${formatted}, change of ${changeFormatted}`;
}

export function calculateStats(data: number[]): ChartStats {
	if (data.length === 0) {
		return {};
	}

	const first = data[0];
	const last = data.at(-1);
	if (first === undefined || last === undefined) {
		return {};
	}

	const current = last;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const mean = data.reduce((sum, v) => sum + v, 0) / data.length;

	const change = current - first;
	const changePercent = first !== 0 ? (change / first) * 100 : 0;

	return {
		current,
		min,
		max,
		mean,
		change,
		changePercent,
	};
}

export function calculateOHLCStats(
	data: Array<{ close: number; time: string | number }>,
): ChartStats {
	const closes = data.map((d) => d.close);
	return calculateStats(closes);
}

export function calculateEquityStats(
	data: Array<{ value: number; time: string | number }>,
): ChartStats {
	const values = data.map((d) => d.value);
	return calculateStats(values);
}

export const KEYBOARD_KEYS = {
	LEFT: "ArrowLeft",
	RIGHT: "ArrowRight",
	UP: "ArrowUp",
	DOWN: "ArrowDown",
	HOME: "Home",
	END: "End",
	PLUS: "+",
	MINUS: "-",
	EQUAL: "=",
	ENTER: "Enter",
	SPACE: " ",
	ESCAPE: "Escape",
} as const;

export interface KeyboardNavigationResult {
	handled: boolean;
	action?: "next" | "prev" | "first" | "last" | "zoom-in" | "zoom-out" | "select" | "cancel";
	index?: number;
}

export function handleDataPointNavigation(
	event: KeyboardEvent,
	currentIndex: number,
	dataLength: number,
): KeyboardNavigationResult {
	switch (event.key) {
		case KEYBOARD_KEYS.LEFT:
			event.preventDefault();
			return {
				handled: true,
				action: "prev",
				index: Math.max(0, currentIndex - 1),
			};

		case KEYBOARD_KEYS.RIGHT:
			event.preventDefault();
			return {
				handled: true,
				action: "next",
				index: Math.min(dataLength - 1, currentIndex + 1),
			};

		case KEYBOARD_KEYS.HOME:
			event.preventDefault();
			return {
				handled: true,
				action: "first",
				index: 0,
			};

		case KEYBOARD_KEYS.END:
			event.preventDefault();
			return {
				handled: true,
				action: "last",
				index: dataLength - 1,
			};

		case KEYBOARD_KEYS.ENTER:
		case KEYBOARD_KEYS.SPACE:
			event.preventDefault();
			return {
				handled: true,
				action: "select",
				index: currentIndex,
			};

		case KEYBOARD_KEYS.ESCAPE:
			event.preventDefault();
			return {
				handled: true,
				action: "cancel",
			};

		default:
			return { handled: false };
	}
}

export function handleZoomNavigation(event: KeyboardEvent): KeyboardNavigationResult {
	switch (event.key) {
		case KEYBOARD_KEYS.PLUS:
		case KEYBOARD_KEYS.EQUAL:
			event.preventDefault();
			return {
				handled: true,
				action: "zoom-in",
			};

		case KEYBOARD_KEYS.MINUS:
			event.preventDefault();
			return {
				handled: true,
				action: "zoom-out",
			};

		default:
			return { handled: false };
	}
}

// ============================================
// Focus Management
// ============================================

/**
 * Focus styles for charts.
 */
export const FOCUS_STYLES = {
	outline: "2px solid #D97706",
	outlineOffset: "2px",
	borderRadius: "4px",
} as const;

/**
 * Generate focus style string for inline styles.
 */
export function getFocusStyleString(): string {
	return `outline: ${FOCUS_STYLES.outline}; outline-offset: ${FOCUS_STYLES.outlineOffset}; border-radius: ${FOCUS_STYLES.borderRadius};`;
}

/**
 * Focus trap for modal chart views.
 */
export function createFocusTrap(container: HTMLElement): () => void {
	const focusableElements = Array.from(
		container.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		),
	);

	const firstElement = focusableElements[0];
	const lastElement = focusableElements.at(-1);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Tab") {
			return;
		}

		if (event.shiftKey && document.activeElement === firstElement) {
			event.preventDefault();
			lastElement?.focus();
		} else if (!event.shiftKey && document.activeElement === lastElement) {
			event.preventDefault();
			firstElement?.focus();
		}
	};

	container.addEventListener("keydown", handleKeyDown);
	firstElement?.focus();

	return () => {
		container.removeEventListener("keydown", handleKeyDown);
	};
}

// ============================================
// Data Table Alternative
// ============================================

/**
 * Convert chart data to accessible table format.
 */
export function toAccessibleTableData<T extends Record<string, unknown>>(
	data: T[],
	columns: Array<{ key: keyof T; label: string; formatter?: (value: unknown) => string }>,
): {
	headers: string[];
	rows: string[][];
} {
	const headers = columns.map((col) => col.label);
	const rows = data.map((row) =>
		columns.map((col) => {
			const value = row[col.key];
			return col.formatter ? col.formatter(value) : String(value ?? "");
		}),
	);

	return { headers, rows };
}

/**
 * Generate CSV from chart data.
 */
export function toCSV<T extends Record<string, unknown>>(
	data: T[],
	columns: Array<{ key: keyof T; label: string }>,
): string {
	const headers = columns.map((col) => `"${col.label}"`).join(",");
	const rows = data.map((row) =>
		columns
			.map((col) => {
				const value = row[col.key];
				const str = String(value ?? "");
				// Escape quotes and wrap in quotes
				return `"${str.replaceAll('"', '""')}"`;
			})
			.join(","),
	);

	return [headers, ...rows].join("\n");
}

// ============================================
// Color Contrast
// ============================================

/**
 * Check if color contrast meets WCAG AA.
 */
export function checkContrastRatio(
	foreground: string,
	background: string,
): { ratio: number; passesAA: boolean; passesAAA: boolean } {
	const fgLuminance = getRelativeLuminance(hexToRgb(foreground));
	const bgLuminance = getRelativeLuminance(hexToRgb(background));

	const lighter = Math.max(fgLuminance, bgLuminance);
	const darker = Math.min(fgLuminance, bgLuminance);
	const ratio = (lighter + 0.05) / (darker + 0.05);

	return {
		ratio,
		passesAA: ratio >= 4.5,
		passesAAA: ratio >= 7,
	};
}

/**
 * Check graphics contrast (3:1 for WCAG AA).
 */
export function checkGraphicsContrast(foreground: string, background: string): boolean {
	const { ratio } = checkContrastRatio(foreground, background);
	return ratio >= 3;
}

// ============================================
// Helper Functions
// ============================================

function formatValue(value: number): string {
	if (Math.abs(value) >= 1000000) {
		return `$${(value / 1000000).toFixed(2)}M`;
	}
	if (Math.abs(value) >= 1000) {
		return `$${(value / 1000).toFixed(1)}K`;
	}
	return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`;
}

function formatDate(date: string | Date): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result || !result[1] || !result[2] || !result[3]) {
		throw new Error(`Invalid hex color: ${hex}`);
	}
	return {
		r: Number.parseInt(result[1], 16),
		g: Number.parseInt(result[2], 16),
		b: Number.parseInt(result[3], 16),
	};
}

function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
	const { r, g, b } = rgb;
	const toLinear = (c: number): number => {
		const sRGB = c / 255;
		return sRGB <= 0.03928 ? sRGB / 12.92 : ((sRGB + 0.055) / 1.055) ** 2.4;
	};
	const R = toLinear(r);
	const G = toLinear(g);
	const B = toLinear(b);
	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
