"use client";

/**
 * ChartContent Component
 *
 * Main chart content including quote header, candlestick chart, and indicators.
 */

import { useState } from "react";
import { EnhancedQuoteHeader } from "@/components/charts/EnhancedQuoteHeader";
import { StreamPanel } from "@/components/charts/StreamPanel";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { IndicatorDrawer } from "@/components/indicators";
import { LoadingOverlay } from "@/components/ui/spinner";
import { getTickerName } from "@/lib/ticker-names";
import { useChartPreferences } from "@/stores/ui-store";
import { ChartControls } from "./ChartControls";
import { ChartHeader } from "./ChartHeader";
import { useChartData, useMAToggle, useStreamToggle } from "./hooks";
import type { ChartContentProps } from "./types";

const Y_AXIS_SKELETON_KEYS = ["y-axis-1", "y-axis-2", "y-axis-3", "y-axis-4", "y-axis-5"];
const HORIZONTAL_GRID_SKELETON_KEYS = [
	"grid-line-1",
	"grid-line-2",
	"grid-line-3",
	"grid-line-4",
	"grid-line-5",
];
const BAR_SKELETON_ITEMS = Array.from({ length: 40 }, (_, index) => ({
	key: `bar-${index}`,
	height: 25 + Math.sin(index * 0.4) * 20 + Math.cos(index * 0.7) * 15,
	isGreen: index % 3 !== 0,
}));
const X_AXIS_SKELETON_KEYS = [
	"x-axis-1",
	"x-axis-2",
	"x-axis-3",
	"x-axis-4",
	"x-axis-5",
	"x-axis-6",
];

function QuoteHeaderSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<div className="flex items-start justify-between mb-4">
				<div className="flex items-baseline gap-4">
					<div className="h-8 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
			</div>
			<div className="mb-4">
				<div className="flex items-center justify-between gap-4">
					<div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
				<div className="mt-2 h-1.5 bg-cream-100 dark:bg-night-700 rounded-full animate-pulse" />
			</div>
			<div className="flex items-center gap-6">
				<div className="flex-1">
					<div className="h-3 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-1" />
					<div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full animate-pulse" />
				</div>
				<div className="text-right">
					<div className="h-3 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-1" />
					<div className="h-5 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
			</div>
		</div>
	);
}

function ChartSkeleton() {
	return (
		<div className="h-96 bg-cream-50 dark:bg-night-800 rounded border border-cream-200 dark:border-night-700 relative overflow-hidden">
			<div className="absolute left-2 top-4 bottom-12 w-12 flex flex-col justify-between">
				{Y_AXIS_SKELETON_KEYS.map((yAxisKey) => (
					<div
						key={yAxisKey}
						className="h-3 w-10 bg-cream-200 dark:bg-night-600 rounded animate-pulse"
					/>
				))}
			</div>
			<div className="absolute left-16 right-4 top-4 bottom-12 flex flex-col justify-between">
				{HORIZONTAL_GRID_SKELETON_KEYS.map((gridKey) => (
					<div key={gridKey} className="h-px bg-cream-200 dark:bg-night-700" />
				))}
			</div>
			<div className="absolute left-16 right-4 top-8 bottom-16 flex items-end justify-around gap-1">
				{BAR_SKELETON_ITEMS.map((bar) => (
					<div
						key={bar.key}
						className={`w-1.5 rounded-sm animate-pulse ${
							bar.isGreen ? "bg-bullish/40 dark:bg-bullish/30" : "bg-bearish/40 dark:bg-bearish/30"
						}`}
						style={{ height: `${bar.height}%` }}
					/>
				))}
			</div>
			<div className="absolute left-16 right-4 bottom-2 flex justify-between">
				{X_AXIS_SKELETON_KEYS.map((xAxisKey) => (
					<div
						key={xAxisKey}
						className="h-3 w-8 bg-cream-200 dark:bg-night-600 rounded animate-pulse"
					/>
				))}
			</div>
		</div>
	);
}

function SymbolErrorState({ symbol }: { symbol: string }) {
	return (
		<div className="flex-1 flex items-center justify-center bg-white dark:bg-night-800">
			<div className="text-center">
				<div className="text-4xl mb-4">?</div>
				<h2 className="text-xl font-semibold text-stone-700 dark:text-night-100 mb-2">
					Unknown Symbol
				</h2>
				<p className="text-stone-500 dark:text-night-300">
					Could not find market data for <span className="font-mono font-medium">{symbol}</span>
				</p>
			</div>
		</div>
	);
}

interface QuoteSectionProps {
	symbol: string;
	quote: ReturnType<typeof useChartData>["quote"];
	quoteLoading: boolean;
	regimeLabel?: string;
	dayHigh?: number;
	dayLow?: number;
}

function QuoteSection({
	symbol,
	quote,
	quoteLoading,
	regimeLabel,
	dayHigh,
	dayLow,
}: QuoteSectionProps) {
	if (!quote && quoteLoading) {
		return <QuoteHeaderSkeleton />;
	}
	if (!quote) {
		return null;
	}
	return (
		<EnhancedQuoteHeader
			symbol={symbol}
			quote={{
				bid: quote.bid,
				ask: quote.ask,
				bidSize: quote.bidSize,
				askSize: quote.askSize,
				last: quote.last,
				previousClose: quote.prevClose,
				volume: quote.volume,
				high: dayHigh,
				low: dayLow,
			}}
			regime={regimeLabel}
			showDepth={true}
		/>
	);
}

interface ChartSectionProps {
	candles: ReturnType<typeof useChartData>["candles"];
	candlesLoading: boolean;
	chartData: ReturnType<typeof useChartData>["chartData"];
	maOverlays: ReturnType<typeof useChartData>["maOverlays"];
	sessionBoundaries: ReturnType<typeof useChartData>["sessionBoundaries"];
	isRefetching: boolean;
	enabledMAs: string[];
	onToggleMA: (maId: string) => void;
}

function ChartSection({
	candles,
	candlesLoading,
	chartData,
	maOverlays,
	sessionBoundaries,
	isRefetching,
	enabledMAs,
	onToggleMA,
}: ChartSectionProps) {
	return (
		<div>
			<ChartControls enabledMAs={enabledMAs} onToggleMA={onToggleMA} />
			{!candles && candlesLoading ? (
				<ChartSkeleton />
			) : chartData.length > 0 ? (
				<LoadingOverlay isLoading={isRefetching} label="Loading chart data">
					<TradingViewChart
						data={chartData}
						maOverlays={maOverlays}
						sessionBoundaries={sessionBoundaries}
						height={384}
					/>
				</LoadingOverlay>
			) : (
				<div className="h-96 flex items-center justify-center text-stone-400 dark:text-night-400">
					No chart data available
				</div>
			)}
		</div>
	);
}

interface ChartContentBaseProps {
	upperSymbol: string;
	companyName: string;
	timeframe: ReturnType<typeof useChartPreferences>["timeframe"];
	onTimeframeChange: ReturnType<typeof useChartPreferences>["setTimeframe"];
	isIndicatorDrawerOpen: boolean;
	onIndicatorDrawerToggle: () => void;
}

interface ChartContentErrorStateProps extends ChartContentBaseProps {
	onStreamToggle: () => void;
}

function ChartContentErrorState({
	upperSymbol,
	companyName,
	timeframe,
	onTimeframeChange,
	isIndicatorDrawerOpen,
	onIndicatorDrawerToggle,
	onStreamToggle,
}: ChartContentErrorStateProps) {
	return (
		<div className="flex flex-col h-full">
			<ChartHeader
				symbol={upperSymbol}
				companyName={companyName}
				timeframe={timeframe}
				onTimeframeChange={onTimeframeChange}
				isStreamOpen={false}
				onStreamToggle={onStreamToggle}
				isIndicatorDrawerOpen={isIndicatorDrawerOpen}
				onIndicatorDrawerToggle={onIndicatorDrawerToggle}
			/>
			<SymbolErrorState symbol={upperSymbol} />
		</div>
	);
}

interface ChartContentLoadedProps extends ChartContentBaseProps {
	isStreamOpen: boolean;
	onStreamToggle: () => void;
	onStreamClose: () => void;
	data: ReturnType<typeof useChartData>;
	enabledMAs: string[];
	onToggleMA: (maId: string) => void;
	onIndicatorDrawerClose: () => void;
}

function ChartContentLoaded({
	upperSymbol,
	companyName,
	timeframe,
	onTimeframeChange,
	isIndicatorDrawerOpen,
	onIndicatorDrawerToggle,
	isStreamOpen,
	onStreamToggle,
	onStreamClose,
	data,
	enabledMAs,
	onToggleMA,
	onIndicatorDrawerClose,
}: ChartContentLoadedProps) {
	return (
		<div className="flex flex-col h-full">
			<ChartHeader
				symbol={upperSymbol}
				companyName={companyName}
				timeframe={timeframe}
				onTimeframeChange={onTimeframeChange}
				isStreamOpen={isStreamOpen}
				onStreamToggle={onStreamToggle}
				isIndicatorDrawerOpen={isIndicatorDrawerOpen}
				onIndicatorDrawerToggle={onIndicatorDrawerToggle}
			/>
			<StreamPanel symbol={upperSymbol} isOpen={isStreamOpen} onClose={onStreamClose} />
			<div className="flex-1 overflow-auto p-4 space-y-4 bg-white dark:bg-night-800">
				<QuoteSection
					symbol={upperSymbol}
					quote={data.quote}
					quoteLoading={data.quoteLoading}
					regimeLabel={data.regime?.label}
					dayHigh={data.dayHighLow.high}
					dayLow={data.dayHighLow.low}
				/>
				<ChartSection
					candles={data.candles}
					candlesLoading={data.candlesLoading}
					chartData={data.chartData}
					maOverlays={data.maOverlays}
					sessionBoundaries={data.sessionBoundaries}
					isRefetching={data.isRefetching}
					enabledMAs={enabledMAs}
					onToggleMA={onToggleMA}
				/>
			</div>
			<IndicatorDrawer
				symbol={upperSymbol}
				isOpen={isIndicatorDrawerOpen}
				onClose={onIndicatorDrawerClose}
				sections={["price", "liquidity", "options"]}
			/>
		</div>
	);
}

export function ChartContent({ symbol }: ChartContentProps) {
	const upperSymbol = symbol.toUpperCase();
	const companyName = getTickerName(upperSymbol);
	const { timeframe, setTimeframe } = useChartPreferences();
	const { isStreamOpen, toggleStream, closeStream } = useStreamToggle();
	const { enabledMAs, toggleMA } = useMAToggle();
	const [indicatorDrawerOpen, setIndicatorDrawerOpen] = useState(false);
	const data = useChartData(upperSymbol, timeframe, enabledMAs);
	const toggleIndicatorDrawer = () => setIndicatorDrawerOpen((open) => !open);
	const closeIndicatorDrawer = () => setIndicatorDrawerOpen(false);

	if (data.isSymbolError) {
		return (
			<ChartContentErrorState
				upperSymbol={upperSymbol}
				companyName={companyName}
				timeframe={timeframe}
				onTimeframeChange={setTimeframe}
				isIndicatorDrawerOpen={indicatorDrawerOpen}
				onIndicatorDrawerToggle={toggleIndicatorDrawer}
				onStreamToggle={toggleStream}
			/>
		);
	}

	return (
		<ChartContentLoaded
			upperSymbol={upperSymbol}
			companyName={companyName}
			timeframe={timeframe}
			onTimeframeChange={setTimeframe}
			isIndicatorDrawerOpen={indicatorDrawerOpen}
			onIndicatorDrawerToggle={toggleIndicatorDrawer}
			isStreamOpen={isStreamOpen}
			onStreamToggle={toggleStream}
			onStreamClose={closeStream}
			data={data}
			enabledMAs={enabledMAs}
			onToggleMA={toggleMA}
			onIndicatorDrawerClose={closeIndicatorDrawer}
		/>
	);
}
