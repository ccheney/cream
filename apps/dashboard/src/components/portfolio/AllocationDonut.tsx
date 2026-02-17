"use client";

import { memo, useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StreamingPosition } from "@/hooks/usePortfolioStreaming";
import type { Account, Position } from "@/lib/api/types";
import { CHART_COLORS } from "@/lib/chart-config";

export interface AllocationDonutProps {
	positions: Position[] | StreamingPosition[];
	account?: Account;
	isStreaming?: boolean;
	isLoading?: boolean;
}

interface SectorAllocation {
	name: string;
	value: number;
	percentage: number;
	color: string;
	symbols: string[];
	[key: string]: string | number | string[] | undefined;
}

interface SectorAccumulator {
	value: number;
	symbols: string[];
}

const SECTOR_COLORS: Record<string, string> = {
	Technology: "#3B82F6",
	Healthcare: "#22C55E",
	Financials: "#8B5CF6",
	Consumer: "#F97316",
	Energy: "#EF4444",
	Industrials: "#78716C",
	Materials: "#14B8A6",
	Utilities: "#EC4899",
	"Real Estate": "#D97706",
	Communications: "#6366F1",
	Cash: "#A1A1AA",
	Other: "#525252",
};

const SYMBOL_SECTOR_MAP: Record<string, string> = {
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
	NEE: "Utilities",
	DUK: "Utilities",
	SO: "Utilities",
	AEP: "Utilities",
	EXC: "Utilities",
	SRE: "Utilities",
	XEL: "Utilities",
	ES: "Utilities",
	WEC: "Utilities",
	ED: "Utilities",
	D: "Utilities",
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

interface CustomTooltipPayload {
	name: string;
	value: number;
	percentage: number;
	symbols: string[];
}

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{ payload: CustomTooltipPayload }>;
}

function getSector(symbol: string): string {
	return SYMBOL_SECTOR_MAP[symbol.toUpperCase()] ?? "Other";
}

function isStreamingPosition(
	position: Position | StreamingPosition,
): position is StreamingPosition {
	return "liveMarketValue" in position;
}

function getMarketValue(position: Position | StreamingPosition, isStreaming: boolean): number {
	if (isStreaming && isStreamingPosition(position)) {
		return Math.abs(position.liveMarketValue ?? position.marketValue);
	}

	return Math.abs(position.marketValue);
}

function reduceSectorMap(
	positions: Position[] | StreamingPosition[],
	isStreaming: boolean,
): Map<string, SectorAccumulator> {
	const sectorMap = new Map<string, SectorAccumulator>();

	for (const position of positions) {
		const sector = getSector(position.symbol);
		const current = sectorMap.get(sector) ?? { value: 0, symbols: [] };
		const marketValue = getMarketValue(position, isStreaming);
		current.value += marketValue;
		current.symbols.push(position.symbol);
		sectorMap.set(sector, current);
	}

	return sectorMap;
}

function addCashToSectors(sectorMap: Map<string, SectorAccumulator>, cash: number): void {
	if (cash <= 0) {
		return;
	}

	sectorMap.set("Cash", {
		value: cash,
		symbols: [],
	});
}

function buildSectorData(
	sectorMap: Map<string, SectorAccumulator>,
	account: Account | undefined,
): SectorAllocation[] {
	const totalValue = account?.portfolioValue || account?.equity || account?.cash || 0;
	const sectors: SectorAllocation[] = [];

	for (const [sector, values] of sectorMap.entries()) {
		const percentage = totalValue > 0 ? (values.value / totalValue) * 100 : 0;
		sectors.push({
			name: sector,
			value: values.value,
			percentage,
			color: SECTOR_COLORS[sector] ?? SECTOR_COLORS.Other ?? "#525252",
			symbols: values.symbols,
		});
	}

	return sectors.toSorted((a, b) => b.value - a.value);
}

function AllocationLoadingState() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Allocation
			</h2>
			<div className="flex flex-col items-center gap-4">
				<div className="h-32 w-32 rounded-full border-8 border-cream-100 dark:border-night-700 animate-pulse" />
				<div className="w-full space-y-2">
					{[1, 2, 3, 4].map((n) => (
						<div key={`skeleton-${n}`} className="flex items-center justify-between">
							<div className="h-4 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
							<div className="h-4 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function AllocationEmptyState() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Allocation
			</h2>
			<div className="flex items-center justify-center h-48 text-stone-400 dark:text-night-500">
				No positions
			</div>
		</div>
	);
}

function AllocationLegend({ sectorData }: { sectorData: SectorAllocation[] }) {
	return (
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
	);
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

function AllocationChart({
	sectorData,
	isStreaming,
}: {
	sectorData: SectorAllocation[];
	isStreaming: boolean;
}) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
					Allocation
				</h2>
				{isStreaming ? (
					<output
						className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
						aria-label="Live streaming"
					>
						<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
						Live
					</output>
				) : null}
			</div>
			<div className="flex items-center gap-6">
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
				<AllocationLegend sectorData={sectorData} />
			</div>
		</div>
	);
}

export const AllocationDonut = memo(function AllocationDonut({
	positions,
	account,
	isStreaming = false,
	isLoading = false,
}: AllocationDonutProps) {
	const sectorData = useMemo(() => {
		const cash = account?.cash ?? 0;
		if (positions.length === 0 && cash === 0) {
			return [];
		}

		const sectorMap = reduceSectorMap(positions, isStreaming);
		addCashToSectors(sectorMap, cash);
		return buildSectorData(sectorMap, account);
	}, [positions, account, isStreaming]);

	if (isLoading) {
		return <AllocationLoadingState />;
	}

	if (sectorData.length === 0) {
		return <AllocationEmptyState />;
	}

	return <AllocationChart sectorData={sectorData} isStreaming={isStreaming} />;
});

export default AllocationDonut;
