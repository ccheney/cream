// biome-ignore-all lint/a11y/useSemanticElements: CSS grid layout requires div elements with ARIA roles
// biome-ignore-all lint/a11y/useFocusableInteractive: Headers are not interactive
/**
 * Correlation Heat Map Component
 *
 * Matrix visualization for correlation data with diverging color scale.
 *
 * @see docs/plans/ui/26-data-viz.md lines 139-149
 */

"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { CHART_COLORS } from "@/lib/chart-config";
import {
	CORRELATION_COLORS,
	formatCorrelation,
	getCorrelationColor,
	isHighCorrelation,
} from "@/lib/color-scales";

// ============================================
// Types
// ============================================

export type CorrelationMatrix = Record<string, Record<string, number>>;

export interface HeatMapProps {
	/** Correlation data as nested object */
	data: CorrelationMatrix;

	/** Threshold for highlighting high correlations (default: 0.7) */
	highlightThreshold?: number;

	/** Cell size in pixels (default: 50) */
	cellSize?: number;

	/** Show diagonal cells (default: false) */
	showDiagonal?: boolean;

	/** Cell gap in pixels (default: 1) */
	cellGap?: number;

	/** Show value on hover (default: true) */
	showTooltip?: boolean;

	/** Additional CSS class */
	className?: string;
}

export interface CellData {
	rowKey: string;
	colKey: string;
	value: number;
	color: string;
	isHighCorrelation: boolean;
	isDiagonal: boolean;
}

// ============================================
// Hooks
// ============================================

/**
 * Process correlation matrix into cell data.
 */
function useMatrixData(
	data: CorrelationMatrix,
	highlightThreshold: number,
	_showDiagonal: boolean
): {
	keys: string[];
	cells: CellData[][];
} {
	return useMemo(() => {
		const keys = Object.keys(data).sort();

		const cells: CellData[][] = keys.map((rowKey) => {
			return keys.map((colKey) => {
				const value = data[rowKey]?.[colKey] ?? 0;
				const isDiagonal = rowKey === colKey;

				return {
					rowKey,
					colKey,
					value,
					color: getCorrelationColor(value),
					isHighCorrelation: isHighCorrelation(value, highlightThreshold),
					isDiagonal,
				};
			});
		});

		return { keys, cells };
	}, [data, highlightThreshold]);
}

// ============================================
// Sub-Components
// ============================================

interface CellProps {
	cell: CellData;
	size: number;
	showDiagonal: boolean;
	isHovered: boolean;
	onHover: (cell: CellData | null) => void;
}

function Cell({ cell, size, showDiagonal, isHovered, onHover }: CellProps) {
	const handleMouseEnter = useCallback(() => {
		onHover(cell);
	}, [cell, onHover]);

	const handleMouseLeave = useCallback(() => {
		onHover(null);
	}, [onHover]);

	// Hide diagonal if not showing
	if (cell.isDiagonal && !showDiagonal) {
		return (
			<div
				style={{
					width: size,
					height: size,
					backgroundColor: CHART_COLORS.background,
				}}
			/>
		);
	}

	const borderColor = cell.isHighCorrelation
		? cell.value > 0
			? CORRELATION_COLORS.positive
			: CORRELATION_COLORS.negative
		: "transparent";

	return (
		<div
			style={{
				width: size,
				height: size,
				backgroundColor: cell.color,
				border: `2px solid ${borderColor}`,
				boxSizing: "border-box",
				cursor: "pointer",
				transition: "transform 0.1s ease",
				transform: isHovered ? "scale(1.05)" : "scale(1)",
				zIndex: isHovered ? 10 : 1,
				position: "relative",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontFamily: "Geist Mono, monospace",
				fontSize: size > 40 ? 10 : 8,
				color: Math.abs(cell.value) > 0.5 ? "#FFFFFF" : CHART_COLORS.text,
				textShadow: Math.abs(cell.value) > 0.5 ? "0 1px 2px rgba(0,0,0,0.5)" : "none",
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			role="cell"
			aria-label={`${cell.rowKey} vs ${cell.colKey}: ${formatCorrelation(cell.value)}`}
		>
			{isHovered && formatCorrelation(cell.value)}
		</div>
	);
}

interface TooltipProps {
	cell: CellData;
	position: { x: number; y: number };
}

function Tooltip({ cell, position }: TooltipProps) {
	return (
		<div
			style={{
				position: "fixed",
				left: position.x + 10,
				top: position.y + 10,
				backgroundColor: "#1C1917",
				border: `1px solid ${CHART_COLORS.grid}`,
				borderRadius: 4,
				padding: "8px 12px",
				fontFamily: "Geist Mono, monospace",
				fontSize: 11,
				zIndex: 1000,
				pointerEvents: "none",
			}}
		>
			<p style={{ color: CHART_COLORS.text, margin: 0, marginBottom: 4 }}>
				{cell.rowKey} vs {cell.colKey}
			</p>
			<p
				style={{
					color:
						cell.value > 0
							? CORRELATION_COLORS.positive
							: cell.value < 0
								? CORRELATION_COLORS.negative
								: CHART_COLORS.text,
					margin: 0,
					fontWeight: 600,
				}}
			>
				{formatCorrelation(cell.value)}
			</p>
			{cell.isHighCorrelation && (
				<p
					style={{
						color: CHART_COLORS.primary,
						margin: 0,
						marginTop: 4,
						fontSize: 9,
					}}
				>
					High correlation
				</p>
			)}
		</div>
	);
}

// ============================================
// Main Component
// ============================================

/**
 * Correlation matrix heat map component.
 */
function HeatMapComponent({
	data,
	highlightThreshold = 0.7,
	cellSize = 50,
	showDiagonal = false,
	cellGap = 1,
	showTooltip = true,
	className,
}: HeatMapProps) {
	const { keys, cells } = useMatrixData(data, highlightThreshold, showDiagonal);
	const [hoveredCell, setHoveredCell] = useState<CellData | null>(null);
	const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		setMousePosition({ x: e.clientX, y: e.clientY });
	}, []);

	const handleCellHover = useCallback((cell: CellData | null) => {
		setHoveredCell(cell);
	}, []);

	// Calculate dimensions
	const labelWidth = 60;
	const gridWidth = keys.length * (cellSize + cellGap);
	const totalWidth = labelWidth + gridWidth;
	const totalHeight = labelWidth + gridWidth;

	if (keys.length === 0) {
		return (
			<div
				className={className}
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: CHART_COLORS.text,
					fontFamily: "Geist Mono, monospace",
					fontSize: 12,
					padding: 20,
				}}
			>
				No data
			</div>
		);
	}

	return (
		<div
			className={className}
			style={{ position: "relative" }}
			onMouseMove={handleMouseMove}
			role="grid"
			aria-label="Correlation matrix"
		>
			{/* Container */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: `${labelWidth}px repeat(${keys.length}, ${cellSize}px)`,
					gridTemplateRows: `${labelWidth}px repeat(${keys.length}, ${cellSize}px)`,
					gap: cellGap,
					width: totalWidth,
					height: totalHeight,
				}}
			>
				{/* Empty corner */}
				<div />

				{/* Column headers */}
				{keys.map((key) => (
					<div
						key={`col-${key}`}
						style={{
							display: "flex",
							alignItems: "flex-end",
							justifyContent: "center",
							paddingBottom: 4,
							fontFamily: "Geist Mono, monospace",
							fontSize: 10,
							color: CHART_COLORS.text,
							transform: "rotate(-45deg)",
							transformOrigin: "bottom center",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
						role="columnheader"
					>
						{key}
					</div>
				))}

				{/* Rows */}
				{cells.map((row, rowIndex) => (
					<>
						{/* Row header */}
						<div
							key={`row-${keys[rowIndex]}`}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								paddingRight: 8,
								fontFamily: "Geist Mono, monospace",
								fontSize: 10,
								color: CHART_COLORS.text,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
							role="rowheader"
						>
							{keys[rowIndex]}
						</div>

						{/* Row cells */}
						{row.map((cell, _colIndex) => (
							<Cell
								key={`${cell.rowKey}-${cell.colKey}`}
								cell={cell}
								size={cellSize}
								showDiagonal={showDiagonal}
								isHovered={
									hoveredCell?.rowKey === cell.rowKey && hoveredCell?.colKey === cell.colKey
								}
								onHover={handleCellHover}
							/>
						))}
					</>
				))}
			</div>

			{/* Tooltip */}
			{showTooltip && hoveredCell && <Tooltip cell={hoveredCell} position={mousePosition} />}
		</div>
	);
}

/**
 * Memoized HeatMap component.
 */
export const HeatMap = memo(HeatMapComponent);

export default HeatMap;

// ============================================
// Sample Data Export
// ============================================

/**
 * Sample correlation matrix for testing.
 */
export const SAMPLE_CORRELATION_DATA: CorrelationMatrix = {
	AAPL: { AAPL: 1.0, MSFT: 0.75, GOOGL: 0.68, AMZN: 0.55, NVDA: 0.82 },
	MSFT: { AAPL: 0.75, MSFT: 1.0, GOOGL: 0.72, AMZN: 0.48, NVDA: 0.71 },
	GOOGL: { AAPL: 0.68, MSFT: 0.72, GOOGL: 1.0, AMZN: 0.52, NVDA: 0.65 },
	AMZN: { AAPL: 0.55, MSFT: 0.48, GOOGL: 0.52, AMZN: 1.0, NVDA: 0.45 },
	NVDA: { AAPL: 0.82, MSFT: 0.71, GOOGL: 0.65, AMZN: 0.45, NVDA: 1.0 },
};
