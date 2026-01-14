/**
 * AllocationDonut Component
 *
 * Donut chart showing portfolio sector allocation breakdown.
 * Derives sectors from position symbols using a sector mapping.
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

"use client";

import { memo, useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Account, Position } from "@/lib/api/types";
import { CHART_COLORS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export interface AllocationDonutProps {
	positions: Position[];
	account: Account;
}

interface SectorAllocation {
	name: string;
	value: number;
	percentage: number;
	color: string;
	symbols: string[];
	/** Index signature for recharts compatibility */
	[key: string]: string | number | string[] | undefined;
}

// ============================================
// Sector Classifications
// ============================================

/**
 * Sector color palette.
 */
const SECTOR_COLORS: Record<string, string> = {
	Technology: "#3B82F6", // blue
	Healthcare: "#22C55E", // green
	Financials: "#8B5CF6", // purple
	Consumer: "#F97316", // orange
	Energy: "#EF4444", // red
	Industrials: "#78716C", // stone
	Materials: "#14B8A6", // teal
	Utilities: "#EC4899", // pink
	"Real Estate": "#D97706", // amber
	Communications: "#6366F1", // indigo
	Cash: "#A1A1AA", // gray
	Other: "#525252", // neutral
};

/**
 * Common stock to sector mappings.
 * Covers major S&P 500 and popular trading symbols.
 */
const SYMBOL_SECTOR_MAP: Record<string, string> = {
	// Technology
	AAPL: "Technology",
	MSFT: "Technology",
	GOOGL: "Technology",
	GOOG: "Technology",
	AMZN: "Technology",
	META: "Technology",
	NVDA: "Technology",
	AMD: "Technology",
	INTC: "Technology",
	CRM: "Technology",
	ORCL: "Technology",
	ADBE: "Technology",
	CSCO: "Technology",
	AVGO: "Technology",
	TXN: "Technology",
	QCOM: "Technology",
	IBM: "Technology",
	NOW: "Technology",
	SHOP: "Technology",
	SQ: "Technology",
	PLTR: "Technology",
	NET: "Technology",
	SNOW: "Technology",
	PANW: "Technology",
	MU: "Technology",
	AMAT: "Technology",
	LRCX: "Technology",
	KLAC: "Technology",
	MRVL: "Technology",
	SNPS: "Technology",
	CDNS: "Technology",
	FTNT: "Technology",
	CRWD: "Technology",
	ZS: "Technology",
	DDOG: "Technology",
	TEAM: "Technology",

	// Healthcare
	JNJ: "Healthcare",
	UNH: "Healthcare",
	LLY: "Healthcare",
	PFE: "Healthcare",
	ABBV: "Healthcare",
	MRK: "Healthcare",
	TMO: "Healthcare",
	ABT: "Healthcare",
	DHR: "Healthcare",
	BMY: "Healthcare",
	AMGN: "Healthcare",
	GILD: "Healthcare",
	ISRG: "Healthcare",
	VRTX: "Healthcare",
	REGN: "Healthcare",
	MDT: "Healthcare",
	SYK: "Healthcare",
	ZTS: "Healthcare",
	BDX: "Healthcare",
	CI: "Healthcare",
	HUM: "Healthcare",
	CVS: "Healthcare",
	MCK: "Healthcare",
	MRNA: "Healthcare",
	BIIB: "Healthcare",

	// Financials
	JPM: "Financials",
	V: "Financials",
	MA: "Financials",
	BAC: "Financials",
	WFC: "Financials",
	GS: "Financials",
	MS: "Financials",
	BLK: "Financials",
	SCHW: "Financials",
	C: "Financials",
	AXP: "Financials",
	USB: "Financials",
	PNC: "Financials",
	TFC: "Financials",
	CB: "Financials",
	MMC: "Financials",
	CME: "Financials",
	ICE: "Financials",
	SPGI: "Financials",
	MCO: "Financials",
	AON: "Financials",
	COF: "Financials",
	PYPL: "Financials",
	AIG: "Financials",
	MET: "Financials",

	// Consumer Discretionary
	TSLA: "Consumer",
	HD: "Consumer",
	MCD: "Consumer",
	NKE: "Consumer",
	SBUX: "Consumer",
	TGT: "Consumer",
	LOW: "Consumer",
	BKNG: "Consumer",
	MAR: "Consumer",
	ORLY: "Consumer",
	AZO: "Consumer",
	ROST: "Consumer",
	TJX: "Consumer",
	CMG: "Consumer",
	DHI: "Consumer",
	LEN: "Consumer",
	GM: "Consumer",
	F: "Consumer",
	RIVN: "Consumer",
	LCID: "Consumer",

	// Consumer Staples
	WMT: "Consumer",
	PG: "Consumer",
	COST: "Consumer",
	KO: "Consumer",
	PEP: "Consumer",
	PM: "Consumer",
	MO: "Consumer",
	CL: "Consumer",
	KMB: "Consumer",
	GIS: "Consumer",
	K: "Consumer",
	HSY: "Consumer",
	KHC: "Consumer",
	MDLZ: "Consumer",
	STZ: "Consumer",
	KDP: "Consumer",

	// Energy
	XOM: "Energy",
	CVX: "Energy",
	COP: "Energy",
	SLB: "Energy",
	EOG: "Energy",
	MPC: "Energy",
	PSX: "Energy",
	VLO: "Energy",
	OXY: "Energy",
	HAL: "Energy",
	DVN: "Energy",
	PXD: "Energy",
	FANG: "Energy",
	HES: "Energy",
	BKR: "Energy",

	// Industrials
	CAT: "Industrials",
	BA: "Industrials",
	HON: "Industrials",
	UNP: "Industrials",
	RTX: "Industrials",
	LMT: "Industrials",
	GE: "Industrials",
	DE: "Industrials",
	UPS: "Industrials",
	FDX: "Industrials",
	ETN: "Industrials",
	ITW: "Industrials",
	EMR: "Industrials",
	MMM: "Industrials",
	GD: "Industrials",
	NOC: "Industrials",
	WM: "Industrials",
	CSX: "Industrials",
	NSC: "Industrials",
	DAL: "Industrials",
	UAL: "Industrials",
	AAL: "Industrials",
	LUV: "Industrials",

	// Materials
	LIN: "Materials",
	APD: "Materials",
	SHW: "Materials",
	ECL: "Materials",
	FCX: "Materials",
	NEM: "Materials",
	NUE: "Materials",
	DD: "Materials",
	DOW: "Materials",
	VMC: "Materials",
	MLM: "Materials",

	// Utilities
	NEE: "Utilities",
	DUK: "Utilities",
	SO: "Utilities",
	D: "Utilities",
	AEP: "Utilities",
	EXC: "Utilities",
	SRE: "Utilities",
	XEL: "Utilities",
	ES: "Utilities",
	WEC: "Utilities",
	ED: "Utilities",

	// Real Estate
	PLD: "Real Estate",
	AMT: "Real Estate",
	CCI: "Real Estate",
	EQIX: "Real Estate",
	SPG: "Real Estate",
	O: "Real Estate",
	PSA: "Real Estate",
	WELL: "Real Estate",
	DLR: "Real Estate",
	AVB: "Real Estate",
	EQR: "Real Estate",

	// Communications
	NFLX: "Communications",
	DIS: "Communications",
	CMCSA: "Communications",
	VZ: "Communications",
	T: "Communications",
	TMUS: "Communications",
	CHTR: "Communications",
	WBD: "Communications",
	FOX: "Communications",
	FOXA: "Communications",
	OMC: "Communications",
	IPG: "Communications",

	// ETFs - classify as "Other" or by primary sector
	SPY: "Other",
	QQQ: "Technology",
	IWM: "Other",
	DIA: "Other",
	VOO: "Other",
	VTI: "Other",
	XLK: "Technology",
	XLF: "Financials",
	XLE: "Energy",
	XLV: "Healthcare",
	XLI: "Industrials",
	XLP: "Consumer",
	XLY: "Consumer",
	XLU: "Utilities",
	XLB: "Materials",
	XLRE: "Real Estate",
	XLC: "Communications",
};

/**
 * Get sector for a symbol.
 */
function getSector(symbol: string): string {
	return SYMBOL_SECTOR_MAP[symbol.toUpperCase()] ?? "Other";
}

// ============================================
// Custom Tooltip
// ============================================

interface TooltipPayload {
	name: string;
	value: number;
	percentage: number;
	symbols: string[];
}

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{ payload: TooltipPayload }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}

	const data = payload[0]?.payload;
	if (!data) {
		return null;
	}

	return (
		<div
			style={{
				backgroundColor: "#1C1917",
				border: `1px solid ${CHART_COLORS.grid}`,
				borderRadius: 4,
				padding: "8px 12px",
				fontFamily: "Geist Mono, monospace",
				fontSize: 11,
				maxWidth: 200,
			}}
		>
			<p style={{ color: CHART_COLORS.text, margin: 0, marginBottom: 4, fontWeight: 600 }}>
				{data.name}
			</p>
			<p style={{ color: CHART_COLORS.primary, margin: 0, marginBottom: 4 }}>
				{data.percentage.toFixed(1)}% (${data.value.toLocaleString()})
			</p>
			{data.symbols.length > 0 && (
				<p style={{ color: CHART_COLORS.text, margin: 0, fontSize: 10, opacity: 0.7 }}>
					{data.symbols.slice(0, 5).join(", ")}
					{data.symbols.length > 5 && ` +${data.symbols.length - 5} more`}
				</p>
			)}
		</div>
	);
}

// ============================================
// Component
// ============================================

/**
 * AllocationDonut - Sector breakdown donut chart
 */
export const AllocationDonut = memo(function AllocationDonut({
	positions,
	account,
}: AllocationDonutProps) {
	// Calculate sector allocations
	const sectorData = useMemo((): SectorAllocation[] => {
		if (positions.length === 0 && account.cash === 0) {
			return [];
		}

		// Group positions by sector
		const sectorMap = new Map<string, { value: number; symbols: string[] }>();

		for (const position of positions) {
			const sector = getSector(position.symbol);
			const current = sectorMap.get(sector) ?? { value: 0, symbols: [] };
			current.value += Math.abs(position.marketValue);
			current.symbols.push(position.symbol);
			sectorMap.set(sector, current);
		}

		// Add cash if present
		if (account.cash > 0) {
			sectorMap.set("Cash", { value: account.cash, symbols: [] });
		}

		// Calculate total portfolio value
		const totalValue = account.portfolioValue || account.equity || account.cash;

		// Convert to array and calculate percentages
		const allocations: SectorAllocation[] = [];
		for (const [sector, data] of sectorMap.entries()) {
			const percentage = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
			allocations.push({
				name: sector,
				value: data.value,
				percentage,
				color: SECTOR_COLORS[sector] ?? SECTOR_COLORS.Other ?? "#525252",
				symbols: data.symbols,
			});
		}

		// Sort by value descending
		return allocations.toSorted((a, b) => b.value - a.value);
	}, [positions, account]);

	// Empty state
	if (sectorData.length === 0) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<h3 className="text-sm font-medium text-stone-500 dark:text-night-300 mb-4">
					Sector Allocation
				</h3>
				<div className="flex items-center justify-center h-48 text-stone-400 dark:text-night-500">
					No positions
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h3 className="text-sm font-medium text-stone-500 dark:text-night-300 mb-4">
				Sector Allocation
			</h3>

			<div className="flex items-center gap-6">
				{/* Donut Chart */}
				<div className="w-40 h-40 flex-shrink-0">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Tooltip content={<CustomTooltip />} />
							<Pie
								data={sectorData}
								cx="50%"
								cy="50%"
								innerRadius={40}
								outerRadius={60}
								dataKey="value"
								nameKey="name"
								animationDuration={300}
							>
								{sectorData.map((entry) => (
									<Cell key={`cell-${entry.name}`} fill={entry.color} stroke="transparent" />
								))}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
				</div>

				{/* Custom Legend */}
				<div className="flex-1 min-w-0">
					<ul className="space-y-1.5 font-mono text-xs">
						{sectorData.map((sector) => (
							<li key={sector.name} className="flex items-center gap-2">
								<span
									className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
									style={{ backgroundColor: sector.color }}
								/>
								<span className="text-stone-600 dark:text-night-200 flex-1 truncate">
									{sector.name}
								</span>
								<span className="text-amber-600 dark:text-amber-400 font-medium">
									{sector.percentage.toFixed(1)}%
								</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
});

export default AllocationDonut;
