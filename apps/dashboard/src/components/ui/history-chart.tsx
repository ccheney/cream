"use client";

import { memo, useMemo, useState } from "react";

interface DataPoint {
	date: string;
	value: number;
}

export interface HistoryChartProps {
	data: DataPoint[];
	seriesId: string;
	unit: string;
	width?: number;
	height?: number;
	className?: string;
}

const DEFAULT_WIDTH = 336;
const DEFAULT_HEIGHT = 80;
const PADDING = { top: 8, right: 8, bottom: 24, left: 40 };

function formatValue(value: number, unit: string): string {
	if (unit === "%") {
		return `${value.toFixed(2)}%`;
	}
	if (unit === "index") {
		return value.toFixed(1);
	}
	if (unit === "billions" || unit === "millions" || unit === "thousands") {
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}
	return value.toFixed(2);
}

function formatDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export const HistoryChart = memo(function HistoryChart({
	data,
	seriesId,
	unit,
	width = DEFAULT_WIDTH,
	height = DEFAULT_HEIGHT,
	className = "",
}: HistoryChartProps) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	const chartDimensions = useMemo(() => {
		const innerWidth = width - PADDING.left - PADDING.right;
		const innerHeight = height - PADDING.top - PADDING.bottom;
		return { innerWidth, innerHeight };
	}, [width, height]);

	const { points, minValue, maxValue, linePath, fillPath } = useMemo(() => {
		if (data.length < 2) {
			return { points: [], minValue: 0, maxValue: 0, linePath: "", fillPath: "" };
		}

		const values = data.map((d) => d.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const range = max - min || 1;

		const { innerWidth, innerHeight } = chartDimensions;

		const pts = data.map((d, i) => {
			const x = PADDING.left + (i / (data.length - 1)) * innerWidth;
			const y = PADDING.top + innerHeight - ((d.value - min) / range) * innerHeight;
			return { x, y, ...d };
		});

		const linePathStr = pts
			.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
			.join(" ");

		const lastPt = pts[pts.length - 1];
		const firstPt = pts[0];
		const fillPathStr =
			lastPt && firstPt
				? `${linePathStr} L ${lastPt.x.toFixed(2)} ${PADDING.top + innerHeight} L ${firstPt.x.toFixed(2)} ${PADDING.top + innerHeight} Z`
				: "";

		return {
			points: pts,
			minValue: min,
			maxValue: max,
			linePath: linePathStr,
			fillPath: fillPathStr,
		};
	}, [data, chartDimensions]);

	const isPositive = useMemo(() => {
		if (data.length < 2) {
			return true;
		}
		const first = data[0]?.value ?? 0;
		const last = data[data.length - 1]?.value ?? 0;
		return last >= first;
	}, [data]);

	const strokeColor = isPositive ? "#22c55e" : "#ef4444";
	const gradientId = `history-gradient-${isPositive ? "pos" : "neg"}-${seriesId}`;

	if (data.length < 2) {
		return (
			<div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
				<span className="text-xs text-stone-400 dark:text-night-500">Insufficient data</span>
			</div>
		);
	}

	const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

	return (
		<div className={`relative ${className}`}>
			<svg
				width={width}
				height={height}
				className="overflow-visible"
				aria-labelledby={`chart-title-${seriesId}`}
			>
				<title id={`chart-title-${seriesId}`}>{seriesId} historical data chart</title>
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
						<stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
						<stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
					</linearGradient>
				</defs>

				{/* Y-axis labels */}
				<text
					x={PADDING.left - 4}
					y={PADDING.top + 4}
					textAnchor="end"
					className="fill-stone-400 dark:fill-night-500 text-[9px]"
				>
					{formatValue(maxValue, unit)}
				</text>
				<text
					x={PADDING.left - 4}
					y={PADDING.top + chartDimensions.innerHeight}
					textAnchor="end"
					className="fill-stone-400 dark:fill-night-500 text-[9px]"
				>
					{formatValue(minValue, unit)}
				</text>

				{/* X-axis labels */}
				{(() => {
					const firstDate = data[0]?.date;
					const lastDate = data[data.length - 1]?.date;
					return (
						<>
							{firstDate && (
								<text
									x={PADDING.left}
									y={height - 4}
									textAnchor="start"
									className="fill-stone-400 dark:fill-night-500 text-[9px]"
								>
									{formatDate(firstDate)}
								</text>
							)}
							{lastDate && (
								<text
									x={width - PADDING.right}
									y={height - 4}
									textAnchor="end"
									className="fill-stone-400 dark:fill-night-500 text-[9px]"
								>
									{formatDate(lastDate)}
								</text>
							)}
						</>
					);
				})()}

				{/* Fill area */}
				{fillPath && <path d={fillPath} fill={`url(#${gradientId})`} />}

				{/* Line */}
				{linePath && (
					<path
						d={linePath}
						fill="none"
						stroke={strokeColor}
						strokeWidth={1.5}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				)}

				{/* Data points with hit areas */}
				{points.map((pt, i) => (
					<g
						key={pt.date}
						role="button"
						tabIndex={0}
						aria-label={`${formatDate(pt.date)}: ${formatValue(pt.value, unit)}`}
						onMouseEnter={() => setHoveredIndex(i)}
						onMouseLeave={() => setHoveredIndex(null)}
						onFocus={() => setHoveredIndex(i)}
						onBlur={() => setHoveredIndex(null)}
						className="cursor-pointer outline-none"
					>
						{/* Invisible hit area */}
						<circle cx={pt.x} cy={pt.y} r={12} fill="transparent" />
						{/* Visible dot */}
						<circle
							cx={pt.x}
							cy={pt.y}
							r={hoveredIndex === i ? 4 : 2}
							fill={strokeColor}
							className="transition-all duration-100"
							opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.3}
						/>
					</g>
				))}

				{/* Hover crosshair */}
				{hoveredPoint && (
					<line
						x1={hoveredPoint.x}
						y1={PADDING.top}
						x2={hoveredPoint.x}
						y2={PADDING.top + chartDimensions.innerHeight}
						stroke={strokeColor}
						strokeWidth={1}
						strokeDasharray="2,2"
						opacity={0.5}
					/>
				)}
			</svg>

			{/* Tooltip */}
			{hoveredPoint && (
				<div
					className="absolute pointer-events-none z-10 bg-stone-900 dark:bg-night-700 text-white px-2 py-1 rounded text-xs shadow-lg whitespace-nowrap"
					style={{
						left: hoveredPoint.x,
						top: hoveredPoint.y - 36,
						transform: "translateX(-50%)",
					}}
				>
					<div className="font-medium">{formatValue(hoveredPoint.value, unit)}</div>
					<div className="text-stone-400 dark:text-night-400 text-[10px]">
						{new Date(`${hoveredPoint.date}T00:00:00`).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})}
					</div>
				</div>
			)}

			{/* Series label */}
			<div className="absolute top-0 right-0 text-[10px] font-medium text-stone-500 dark:text-night-400">
				{seriesId}
			</div>
		</div>
	);
});

export default HistoryChart;
