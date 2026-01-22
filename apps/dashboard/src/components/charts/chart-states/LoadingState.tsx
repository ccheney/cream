import { shimmerKeyframes, styles } from "./styles";
import type { ChartSkeletonProps } from "./types";

function Shimmer(): React.ReactElement {
	return (
		<>
			<style>{shimmerKeyframes}</style>
			<div style={styles.shimmer} />
		</>
	);
}

function polarToCartesian(
	cx: number,
	cy: number,
	r: number,
	angleInDegrees: number,
): { x: number; y: number } {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
	return {
		x: cx + r * Math.cos(angleInRadians),
		y: cy + r * Math.sin(angleInRadians),
	};
}

function describeArc(
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
): string {
	const start = polarToCartesian(cx, cy, r, endAngle);
	const end = polarToCartesian(cx, cy, r, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function CandlestickSkeleton({
	width,
	height,
}: {
	width: number;
	height: number;
}): React.ReactElement {
	const barCount = Math.floor(width / 20);
	const bars = Array.from({ length: barCount }, (_, i) => ({
		x: i * 20 + 4,
		height: 30 + Math.random() * 60,
		y: height - 50 - Math.random() * (height - 100),
	}));

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading candlestick chart"
		>
			{bars.map((bar) => (
				<rect
					key={`candle-${bar.x}`}
					x={bar.x}
					y={bar.y}
					width={12}
					height={bar.height}
					fill="#d6d3d1"
					rx={2}
				/>
			))}
			<Shimmer />
		</svg>
	);
}

function LineSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const points = Array.from({ length: 20 }, (_, i) => ({
		x: (i / 19) * width,
		y: height / 2 + Math.sin(i * 0.5) * (height * 0.3),
	}));
	const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading line chart"
		>
			<path
				d={pathD}
				fill="none"
				stroke="#d6d3d1"
				strokeWidth={3}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<Shimmer />
		</svg>
	);
}

function AreaSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const points = Array.from({ length: 20 }, (_, i) => ({
		x: (i / 19) * width,
		y: height / 2 + Math.sin(i * 0.5) * (height * 0.25),
	}));
	const pathD = `M 0 ${height} ${points.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${width} ${height} Z`;

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading area chart"
		>
			<path d={pathD} fill="#d6d3d1" />
			<Shimmer />
		</svg>
	);
}

function BarSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const barCount = Math.min(12, Math.floor(width / 40));
	const barWidth = (width - (barCount + 1) * 8) / barCount;
	const bars = Array.from({ length: barCount }, (_, i) => ({
		x: 8 + i * (barWidth + 8),
		height: 40 + Math.random() * (height - 80),
	}));

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading bar chart"
		>
			{bars.map((bar) => (
				<rect
					key={`bar-${bar.x}`}
					x={bar.x}
					y={height - bar.height - 20}
					width={barWidth}
					height={bar.height}
					fill="#d6d3d1"
					rx={4}
				/>
			))}
			<Shimmer />
		</svg>
	);
}

function PieSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const size = Math.min(width, height);
	const cx = width / 2;
	const cy = height / 2;
	const r = size / 2 - 20;

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading pie chart"
		>
			<circle cx={cx} cy={cy} r={r} fill="#d6d3d1" />
			<circle cx={cx} cy={cy} r={r * 0.5} fill="#fafaf9" />
			<Shimmer />
		</svg>
	);
}

function SparklineSkeleton({
	width,
	height,
}: {
	width: number;
	height: number;
}): React.ReactElement {
	const points = Array.from({ length: 15 }, (_, i) => ({
		x: (i / 14) * width,
		y: height / 2 + Math.sin(i * 0.7) * (height * 0.3),
	}));
	const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading sparkline chart"
		>
			<path d={pathD} fill="none" stroke="#d6d3d1" strokeWidth={2} strokeLinecap="round" />
			<Shimmer />
		</svg>
	);
}

function GaugeSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const size = Math.min(width, height);
	const cx = width / 2;
	const cy = height / 2;
	const r = size / 2 - 20;

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading gauge chart"
		>
			<path
				d={describeArc(cx, cy, r, 180, 360)}
				fill="none"
				stroke="#d6d3d1"
				strokeWidth={16}
				strokeLinecap="round"
			/>
			<Shimmer />
		</svg>
	);
}

function HeatmapSkeleton({ width, height }: { width: number; height: number }): React.ReactElement {
	const cols = 8;
	const rows = 6;
	const cellWidth = (width - 16) / cols;
	const cellHeight = (height - 16) / rows;

	return (
		<svg
			width={width}
			height={height}
			style={styles.skeleton}
			role="img"
			aria-label="Loading heatmap chart"
		>
			{Array.from({ length: rows * cols }, (_, i) => {
				const row = Math.floor(i / cols);
				const col = i % cols;
				return (
					<rect
						key={`cell-${row}-${col}`}
						x={8 + col * cellWidth + 1}
						y={8 + row * cellHeight + 1}
						width={cellWidth - 2}
						height={cellHeight - 2}
						fill="#d6d3d1"
						rx={2}
					/>
				);
			})}
			<Shimmer />
		</svg>
	);
}

const skeletonComponents = {
	candlestick: CandlestickSkeleton,
	line: LineSkeleton,
	area: AreaSkeleton,
	bar: BarSkeleton,
	pie: PieSkeleton,
	sparkline: SparklineSkeleton,
	gauge: GaugeSkeleton,
	heatmap: HeatmapSkeleton,
};

export function ChartSkeleton({
	variant = "line",
	width = 400,
	height = 225,
	className,
	"aria-label": ariaLabel = "Loading chart",
}: ChartSkeletonProps): React.ReactElement {
	const SkeletonComponent = skeletonComponents[variant];

	return (
		<output
			aria-label={ariaLabel}
			className={className}
			style={{ width, height, display: "block" }}
		>
			<SkeletonComponent width={width} height={height} />
		</output>
	);
}
