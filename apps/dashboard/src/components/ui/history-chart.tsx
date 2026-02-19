"use client";

import type { MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";

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
const MIN_REQUIRED_POINTS = 2;
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

type DataPointLike = {
	date: string;
	value: number;
	x: number;
	y: number;
};

function useChartDimensions(width: number, height: number) {
	return useMemo(() => {
		const innerWidth = width - PADDING.left - PADDING.right;
		const innerHeight = height - PADDING.top - PADDING.bottom;
		return { innerWidth, innerHeight };
	}, [width, height]);
}

function useIsPositiveTrend(data: DataPoint[]) {
	return useMemo(() => {
		if (data.length < MIN_REQUIRED_POINTS) {
			return true;
		}
		const first = data[0]?.value ?? 0;
		const last = data.at(-1)?.value ?? 0;
		return last >= first;
	}, [data]);
}

function useChartSeries(
	data: DataPoint[],
	chartDimensions: { innerWidth: number; innerHeight: number },
) {
	return useMemo(() => {
		if (data.length < MIN_REQUIRED_POINTS) {
			return {
				points: [] as DataPointLike[],
				minValue: 0,
				maxValue: 0,
				linePath: "",
				fillPath: "",
			};
		}

		const values = data.map((item) => item.value);
		const minValue = Math.min(...values);
		const maxValue = Math.max(...values);
		const range = maxValue - minValue || 1;
		const { innerWidth, innerHeight } = chartDimensions;

		const points = data.map((item, index) => {
			const x = PADDING.left + (index / (data.length - 1)) * innerWidth;
			const y = PADDING.top + innerHeight - ((item.value - minValue) / range) * innerHeight;
			return { ...item, x, y };
		});

		const linePath = points
			.map(
				(point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
			)
			.join(" ");

		const lastPoint = points.at(-1);
		const firstPoint = points[0];
		const fillPath =
			lastPoint && firstPoint
				? `${linePath} L ${lastPoint.x.toFixed(2)} ${PADDING.top + innerHeight} L ${firstPoint.x.toFixed(2)} ${PADDING.top + innerHeight} Z`
				: "";

		return {
			points,
			minValue,
			maxValue,
			linePath,
			fillPath,
		};
	}, [data, chartDimensions]);
}

function HistoryChartSeriesLabel({ seriesId }: { seriesId: string }) {
	return (
		<div className="absolute top-0 right-0 text-[10px] font-medium text-stone-500 dark:text-night-400">
			{seriesId}
		</div>
	);
}

function HistoryChartYAxis({
	maxValue,
	minValue,
	unit,
	chartHeight,
}: {
	maxValue: number;
	minValue: number;
	unit: string;
	chartHeight: number;
}) {
	return (
		<>
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
				y={PADDING.top + chartHeight}
				textAnchor="end"
				className="fill-stone-400 dark:fill-night-500 text-[9px]"
			>
				{formatValue(minValue, unit)}
			</text>
		</>
	);
}

function HistoryChartXAxis({
	data,
	width,
	height,
}: {
	data: DataPoint[];
	width: number;
	height: number;
}) {
	const firstDate = data[0]?.date;
	const lastDate = data.at(-1)?.date;

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
}

function HistoryChartCrosshair({
	points,
	hoveredIndex,
	strokeColor,
	chartHeight,
}: {
	points: DataPointLike[];
	hoveredIndex: number | null;
	strokeColor: string;
	chartHeight: number;
}) {
	if (hoveredIndex === null) {
		return null;
	}

	const hoveredPoint = points[hoveredIndex];
	if (!hoveredPoint) {
		return null;
	}

	return (
		<line
			x1={hoveredPoint.x}
			y1={PADDING.top}
			x2={hoveredPoint.x}
			y2={PADDING.top + chartHeight}
			stroke={strokeColor}
			strokeWidth={1}
			strokeDasharray="2,2"
			opacity={0.5}
		/>
	);
}

function HistoryChartTooltip({
	hoveredPoint,
	unit,
}: {
	hoveredPoint: DataPointLike | null;
	unit: string;
}) {
	if (!hoveredPoint) {
		return null;
	}

	return (
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
	);
}

function HistoryChartPoints({
	points,
	hoveredIndex,
	strokeColor,
	unit,
}: {
	points: DataPointLike[];
	hoveredIndex: number | null;
	strokeColor: string;
	unit: string;
}) {
	return (
		<>
			{points.map((point, index) => (
				<g
					key={point.date}
					aria-label={`${formatDate(point.date)}: ${formatValue(point.value, unit)}`}
				>
					<circle cx={point.x} cy={point.y} r={12} fill="transparent" />
					<circle
						cx={point.x}
						cy={point.y}
						r={hoveredIndex === index ? 4 : 2}
						fill={strokeColor}
						className="transition-all duration-100"
						opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.3}
					/>
				</g>
			))}
		</>
	);
}

function useHistoryChartInteraction(points: DataPointLike[]) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	const setHovered = useCallback((nextIndex: number | null) => {
		setHoveredIndex(nextIndex);
	}, []);

	const handleMouseMove = useCallback(
		(event: MouseEvent<SVGSVGElement>) => {
			const bounds = event.currentTarget.getBoundingClientRect();
			const pointerX = event.clientX - bounds.left;
			const nearest = points.reduce<{ index: number; distance: number }>(
				(current, point, index) => {
					const distance = Math.abs(point.x - pointerX);
					return distance < current.distance ? { index, distance } : current;
				},
				{ index: 0, distance: Number.POSITIVE_INFINITY },
			);

			setHovered(nearest.distance === Number.POSITIVE_INFINITY ? null : nearest.index);
		},
		[points, setHovered],
	);

	const handleMouseLeave = useCallback(() => {
		setHovered(null);
	}, [setHovered]);

	return {
		hoveredIndex,
		hoveredPoint: hoveredIndex !== null ? (points[hoveredIndex] ?? null) : null,
		handleMouseMove,
		handleMouseLeave,
	};
}

function HistoryChartInsufficientData({
	width,
	height,
	className,
}: {
	width: number;
	height: number;
	className: string;
}) {
	return (
		<div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
			<span className="text-xs text-stone-400 dark:text-night-500">Insufficient data</span>
		</div>
	);
}

function HistoryChartSvg({
	data,
	seriesId,
	unit,
	width,
	height,
	chartDimensions,
	points,
	minValue,
	maxValue,
	linePath,
	fillPath,
	strokeColor,
	hoveredIndex,
	hoveredPoint,
	handleMouseMove,
	handleMouseLeave,
}: {
	data: DataPoint[];
	seriesId: string;
	unit: string;
	width: number;
	height: number;
	chartDimensions: { innerWidth: number; innerHeight: number };
	points: DataPointLike[];
	minValue: number;
	maxValue: number;
	linePath: string;
	fillPath: string;
	strokeColor: string;
	hoveredIndex: number | null;
	hoveredPoint: DataPointLike | null;
	handleMouseMove: (event: MouseEvent<SVGSVGElement>) => void;
	handleMouseLeave: () => void;
}) {
	return (
		<div className="relative">
			<svg
				width={width}
				height={height}
				className="overflow-visible"
				aria-labelledby={`chart-title-${seriesId}`}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
			>
				<title id={`chart-title-${seriesId}`}>{seriesId} historical data chart</title>
				<defs>
					<linearGradient id={`history-gradient-${seriesId}`} x1="0%" y1="0%" x2="0%" y2="100%">
						<stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
						<stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
					</linearGradient>
				</defs>

				<HistoryChartYAxis
					maxValue={maxValue}
					minValue={minValue}
					unit={unit}
					chartHeight={chartDimensions.innerHeight}
				/>
				<HistoryChartXAxis data={data} width={width} height={height} />
				{fillPath && <path d={fillPath} fill={`url(#history-gradient-${seriesId})`} />}
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
				<HistoryChartPoints
					points={points}
					hoveredIndex={hoveredIndex}
					strokeColor={strokeColor}
					unit={unit}
				/>
				<HistoryChartCrosshair
					points={points}
					hoveredIndex={hoveredIndex}
					strokeColor={strokeColor}
					chartHeight={chartDimensions.innerHeight}
				/>
			</svg>
			<HistoryChartTooltip hoveredPoint={hoveredPoint} unit={unit} />
			<HistoryChartSeriesLabel seriesId={seriesId} />
		</div>
	);
}

export const HistoryChart = memo(function HistoryChart({
	data,
	seriesId,
	unit,
	width = DEFAULT_WIDTH,
	height = DEFAULT_HEIGHT,
	className = "",
}: HistoryChartProps) {
	const chartDimensions = useChartDimensions(width, height);
	const isPositive = useIsPositiveTrend(data);
	const { points, minValue, maxValue, linePath, fillPath } = useChartSeries(data, chartDimensions);
	const strokeColor = isPositive ? "#22c55e" : "#ef4444";
	const { hoveredIndex, hoveredPoint, handleMouseMove, handleMouseLeave } =
		useHistoryChartInteraction(points);

	if (data.length < MIN_REQUIRED_POINTS) {
		return <HistoryChartInsufficientData width={width} height={height} className={className} />;
	}

	return (
		<div className={`relative ${className}`}>
			<HistoryChartSvg
				data={data}
				seriesId={seriesId}
				unit={unit}
				width={width}
				height={height}
				chartDimensions={chartDimensions}
				points={points}
				minValue={minValue}
				maxValue={maxValue}
				linePath={linePath}
				fillPath={fillPath}
				strokeColor={strokeColor}
				hoveredIndex={hoveredIndex}
				hoveredPoint={hoveredPoint}
				handleMouseMove={handleMouseMove}
				handleMouseLeave={handleMouseLeave}
			/>
		</div>
	);
});

export default HistoryChart;
