/**
 * Options Chain Page - Specific Underlying
 *
 * Displays the full options chain for a specific underlying symbol.
 * Features expiration tabs, virtualized chain table, and live streaming.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { IndicatorDrawer, IndicatorDrawerToggle } from "@/components/indicators";
import { ExpirationTabs, OptionsChainTable } from "@/components/options";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { LoadingOverlay, Spinner } from "@/components/ui/spinner";
import { useQuote } from "@/hooks/queries/useMarket";
import { useOptionsChain, useOptionsExpirations } from "@/hooks/queries/useOptions";
import type { ExpirationsResponse, OptionsChainResponse, Quote } from "@/lib/api/types";
import { getTickerName } from "@/lib/ticker-names";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useWatchlistStore } from "@/stores/watchlist-store";

interface OptionsChainPageProps {
	params: Promise<{ underlying: string }>;
}

export default function OptionsChainPage({ params }: OptionsChainPageProps) {
	const { underlying } = use(params);

	return <OptionsChainContent underlying={underlying} />;
}

interface OptionsChainContentProps {
	underlying: string;
}

interface SubscriptionState {
	toSubscribe: string[];
	toUnsubscribe: string[];
}

interface PriceChange {
	change: number;
	changePct: number;
}

interface OptionsChainContentState {
	upperUnderlying: string;
	companyName: string | undefined;
	isInWatchlist: boolean;
	wsConnected: boolean;
	isInitialLoading: boolean;
	expirationsData: ExpirationsResponse | undefined;
	displayChainData: OptionsChainResponse | null;
	isRefetching: boolean;
	selectedExpiration: string | null;
	quote: Quote | null | undefined;
	handleExpirationSelect: (date: string) => void;
	handleVisibleRowsChange: (startIndex: number, endIndex: number) => void;
	priceChange: PriceChange | null;
	indicatorDrawerOpen: boolean;
	setIndicatorDrawerOpen: Dispatch<SetStateAction<boolean>>;
	handleAddToWatchlist: () => void;
}

function getVisibleContracts(
	chainData: OptionsChainResponse | null | undefined,
	startIndex: number,
	endIndex: number,
): Set<string> {
	const contracts = new Set<string>();
	if (!chainData?.chain) {
		return contracts;
	}

	for (let i = startIndex; i <= endIndex && i < chainData.chain.length; i++) {
		const row = chainData.chain[i];
		if (row?.call?.symbol) {
			contracts.add(row.call.symbol);
		}
		if (row?.put?.symbol) {
			contracts.add(row.put.symbol);
		}
	}

	return contracts;
}

function getSubscriptionState(
	chainData: OptionsChainResponse | null | undefined,
	startIndex: number,
	endIndex: number,
	subscribedContracts: Set<string>,
): SubscriptionState {
	const visibleContracts = getVisibleContracts(chainData, startIndex, endIndex);
	const toSubscribe: string[] = [];
	const toUnsubscribe: string[] = [];

	for (const symbol of visibleContracts) {
		if (!subscribedContracts.has(symbol)) {
			toSubscribe.push(symbol);
		}
	}

	for (const symbol of subscribedContracts) {
		if (!visibleContracts.has(symbol)) {
			toUnsubscribe.push(symbol);
		}
	}

	return { toSubscribe, toUnsubscribe };
}

function syncSubscriptions(
	subscribedContractsRef: RefObject<Set<string>>,
	subscribeOptions: (symbols: string[]) => void,
	unsubscribeOptions: (symbols: string[]) => void,
	subscriptionState: SubscriptionState,
) {
	if (subscriptionState.toUnsubscribe.length > 0) {
		unsubscribeOptions(subscriptionState.toUnsubscribe);
		for (const symbol of subscriptionState.toUnsubscribe) {
			subscribedContractsRef.current.delete(symbol);
		}
	}

	if (subscriptionState.toSubscribe.length > 0) {
		subscribeOptions(subscriptionState.toSubscribe);
		for (const symbol of subscriptionState.toSubscribe) {
			subscribedContractsRef.current.add(symbol);
		}
	}
}

function calculatePriceChange(quote: Quote | null | undefined): PriceChange | null {
	if (!quote?.last || !quote?.prevClose) {
		return null;
	}

	const change = quote.last - quote.prevClose;
	const changePct = (change / quote.prevClose) * 100;
	return { change, changePct };
}

function useWatchlistState(underlying: string) {
	const watchlistSymbols = useWatchlistStore((s) => s.symbols);
	const addSymbol = useWatchlistStore((s) => s.addSymbol);
	const isInWatchlist = watchlistSymbols.includes(underlying);

	const handleAddToWatchlist = useCallback(() => {
		addSymbol(underlying);
	}, [addSymbol, underlying]);

	return { isInWatchlist, handleAddToWatchlist };
}

function useExpirationState(underlying: string) {
	const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
	const { data: expirationsData, isLoading: expirationsLoading } =
		useOptionsExpirations(underlying);

	useEffect(() => {
		if (
			!selectedExpiration &&
			expirationsData?.expirations &&
			expirationsData.expirations.length > 0
		) {
			setSelectedExpiration(expirationsData.expirations[0]?.date ?? null);
		}
	}, [expirationsData, selectedExpiration]);

	const handleExpirationSelect = useCallback((date: string) => {
		setSelectedExpiration(date);
	}, []);

	return {
		selectedExpiration,
		expirationsData,
		expirationsLoading,
		handleExpirationSelect,
	};
}

function useChainDataState(underlying: string, selectedExpiration: string | null) {
	const previousChainRef = useRef<OptionsChainResponse | null>(null);
	const { data: chainData, isLoading: chainLoading } = useOptionsChain(underlying, {
		expiration: selectedExpiration ?? undefined,
		strikeRange: 25,
		enabled: Boolean(selectedExpiration),
	});

	useEffect(() => {
		if (chainData) {
			previousChainRef.current = chainData;
		}
	}, [chainData]);

	const displayChainData = chainData ?? previousChainRef.current;
	const isRefetching = chainLoading && displayChainData !== null;

	return {
		chainData,
		chainLoading,
		displayChainData,
		isRefetching,
	};
}

function useChainVisibilityManager({
	chainData,
	wsContextConnected,
	subscribeOptions,
	unsubscribeOptions,
}: {
	chainData: OptionsChainResponse | null | undefined;
	wsContextConnected: boolean;
	subscribeOptions: (symbols: string[]) => void;
	unsubscribeOptions: (symbols: string[]) => void;
}) {
	const subscribedContractsRef = useRef<Set<string>>(new Set());

	const handleVisibleRowsChange = useCallback(
		(startIndex: number, endIndex: number) => {
			if (!chainData?.chain || !wsContextConnected) {
				return;
			}

			const subscriptionState = getSubscriptionState(
				chainData,
				startIndex,
				endIndex,
				subscribedContractsRef.current,
			);
			syncSubscriptions(
				subscribedContractsRef,
				subscribeOptions,
				unsubscribeOptions,
				subscriptionState,
			);
		},
		[chainData, wsContextConnected, subscribeOptions, unsubscribeOptions],
	);

	useEffect(() => {
		return () => {
			const contracts = Array.from(subscribedContractsRef.current);
			if (contracts.length > 0) {
				unsubscribeOptions(contracts);
				subscribedContractsRef.current.clear();
			}
		};
	}, [unsubscribeOptions]);

	return { handleVisibleRowsChange };
}

function useOptionsChainContent({
	underlying,
}: OptionsChainContentProps): OptionsChainContentState {
	const upperUnderlying = underlying.toUpperCase();
	const companyName = getTickerName(upperUnderlying);
	const { isInWatchlist, handleAddToWatchlist } = useWatchlistState(upperUnderlying);
	const expirationState = useExpirationState(upperUnderlying);
	const chainState = useChainDataState(upperUnderlying, expirationState.selectedExpiration);
	const { data: quote, connected: wsConnected } = useQuote(upperUnderlying);
	const {
		connected: wsContextConnected,
		subscribeOptions,
		unsubscribeOptions,
	} = useWebSocketContext();
	const { handleVisibleRowsChange } = useChainVisibilityManager({
		chainData: chainState.chainData,
		wsContextConnected,
		subscribeOptions,
		unsubscribeOptions,
	});

	const [indicatorDrawerOpen, setIndicatorDrawerOpen] = useState(false);

	const priceChange = useMemo(() => calculatePriceChange(quote), [quote]);
	const isInitialLoading =
		expirationState.expirationsLoading || (chainState.chainLoading && !chainState.displayChainData);

	return {
		upperUnderlying,
		companyName,
		isInWatchlist,
		wsConnected,
		isInitialLoading,
		expirationsData: expirationState.expirationsData,
		displayChainData: chainState.displayChainData,
		isRefetching: chainState.isRefetching,
		selectedExpiration: expirationState.selectedExpiration,
		quote,
		handleExpirationSelect: expirationState.handleExpirationSelect,
		handleVisibleRowsChange,
		priceChange,
		indicatorDrawerOpen,
		setIndicatorDrawerOpen,
		handleAddToWatchlist,
	};
}

function OptionsChainHeader({
	upperUnderlying,
	companyName,
	isInWatchlist,
	wsConnected,
	priceChange,
	quote,
	indicatorDrawerOpen,
	setIndicatorDrawerOpen,
	handleAddToWatchlist,
}: {
	upperUnderlying: string;
	companyName: string | undefined;
	isInWatchlist: boolean;
	wsConnected: boolean;
	priceChange: PriceChange | null;
	quote: Quote | null | undefined;
	indicatorDrawerOpen: boolean;
	setIndicatorDrawerOpen: Dispatch<SetStateAction<boolean>>;
	handleAddToWatchlist: () => void;
}) {
	return (
		<div className="shrink-0 px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						href="/options"
						className="p-1.5 -ml-1.5 rounded-md text-stone-500 hover:bg-cream-100 dark:hover:bg-night-700"
						aria-label="Back to options"
					>
						<ArrowLeft className="w-5 h-5" />
					</Link>

					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-xl font-semibold text-stone-900 dark:text-night-50">
								{upperUnderlying}
							</h1>
							{companyName && (
								<span className="text-sm text-stone-500 dark:text-night-400">{companyName}</span>
							)}
							{quote?.last && (
								<span className="text-lg font-mono text-stone-700 dark:text-night-200">
									<AnimatedNumber value={quote.last} format="currency" decimals={2} />
								</span>
							)}
							{priceChange && (
								<span
									className={`text-sm font-medium ${
										priceChange.change >= 0
											? "text-green-600 dark:text-green-400"
											: "text-red-600 dark:text-red-400"
									}`}
								>
									{priceChange.change >= 0 ? "+" : ""}
									{priceChange.change.toFixed(2)} ({priceChange.change >= 0 ? "+" : ""}
									{priceChange.changePct.toFixed(2)}%)
								</span>
							)}
							{!wsConnected && (
								<span className="text-xs text-yellow-600 dark:text-yellow-400">
									Connecting to live data...
								</span>
							)}
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<IndicatorDrawerToggle
						symbol={upperUnderlying}
						isOpen={indicatorDrawerOpen}
						onClick={() => setIndicatorDrawerOpen((open) => !open)}
					/>
					<Link
						href={`/charts/${upperUnderlying}`}
						className="px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-night-200 border border-cream-200 dark:border-night-700 rounded-md hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
					>
						← Chart
					</Link>
					{!isInWatchlist && (
						<button
							type="button"
							onClick={handleAddToWatchlist}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary/10 transition-colors duration-150"
						>
							<Plus className="w-4 h-4" />
							Add to List
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function OptionsChainTabs({
	expirationsData,
	selectedExpiration,
	handleExpirationSelect,
}: {
	expirationsData: ExpirationsResponse | undefined;
	selectedExpiration: string | null;
	handleExpirationSelect: (date: string) => void;
}) {
	if (!expirationsData?.expirations || expirationsData.expirations.length === 0) {
		return null;
	}

	return (
		<div className="shrink-0 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
			<ExpirationTabs
				expirations={expirationsData.expirations}
				selected={selectedExpiration}
				onSelect={handleExpirationSelect}
			/>
		</div>
	);
}

function ChainTable({
	isInitialLoading,
	displayChainData,
	isRefetching,
	selectedExpiration,
	upperUnderlying,
	handleVisibleRowsChange,
}: {
	isInitialLoading: boolean;
	displayChainData: OptionsChainResponse | null;
	isRefetching: boolean;
	selectedExpiration: string | null;
	upperUnderlying: string;
	handleVisibleRowsChange: (startIndex: number, endIndex: number) => void;
}) {
	return (
		<div className="flex-1 min-h-0 bg-white dark:bg-night-900">
			{isInitialLoading ? (
				<div className="flex items-center justify-center h-64">
					<Spinner size="lg" />
				</div>
			) : displayChainData?.chain && displayChainData.chain.length > 0 ? (
				<LoadingOverlay isLoading={isRefetching} label="Loading options chain">
					<OptionsChainTable
						chain={displayChainData.chain}
						atmStrike={displayChainData.atmStrike}
						underlyingPrice={displayChainData.underlyingPrice}
						onVisibleRowsChange={handleVisibleRowsChange}
						className="h-full"
					/>
				</LoadingOverlay>
			) : (
				<div className="flex flex-col items-center justify-center h-64 text-stone-500 dark:text-night-300">
					<p>No options data available for {upperUnderlying}</p>
					{selectedExpiration && <p className="text-sm mt-1">Expiration: {selectedExpiration}</p>}
				</div>
			)}
		</div>
	);
}

function ChainLegend() {
	return (
		<div className="shrink-0 px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
			<div className="flex items-center gap-4 text-xs text-stone-500 dark:text-night-300">
				<span className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
					Streaming live
				</span>
				<span className="flex items-center gap-1">
					<span className="text-primary">★</span>
					At-the-money
				</span>
				<span className="flex items-center gap-1">
					<span className="w-3 h-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" />
					ITM Call
				</span>
				<span className="flex items-center gap-1">
					<span className="w-3 h-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" />
					ITM Put
				</span>
			</div>
		</div>
	);
}

function OptionsChainContent({ underlying }: OptionsChainContentProps) {
	const {
		upperUnderlying,
		companyName,
		isInWatchlist,
		wsConnected,
		isInitialLoading,
		expirationsData,
		displayChainData,
		isRefetching,
		selectedExpiration,
		quote,
		handleExpirationSelect,
		handleVisibleRowsChange,
		priceChange,
		indicatorDrawerOpen,
		setIndicatorDrawerOpen,
		handleAddToWatchlist,
	} = useOptionsChainContent({ underlying });

	return (
		<div className="flex flex-col h-full">
			<OptionsChainHeader
				upperUnderlying={upperUnderlying}
				companyName={companyName}
				isInWatchlist={isInWatchlist}
				wsConnected={wsConnected}
				priceChange={priceChange}
				quote={quote}
				indicatorDrawerOpen={indicatorDrawerOpen}
				setIndicatorDrawerOpen={setIndicatorDrawerOpen}
				handleAddToWatchlist={handleAddToWatchlist}
			/>
			<OptionsChainTabs
				expirationsData={expirationsData}
				selectedExpiration={selectedExpiration}
				handleExpirationSelect={handleExpirationSelect}
			/>
			<ChainTable
				isInitialLoading={isInitialLoading}
				displayChainData={displayChainData}
				isRefetching={isRefetching}
				selectedExpiration={selectedExpiration}
				upperUnderlying={upperUnderlying}
				handleVisibleRowsChange={handleVisibleRowsChange}
			/>
			<ChainLegend />
			<IndicatorDrawer
				symbol={upperUnderlying}
				isOpen={indicatorDrawerOpen}
				onClose={() => setIndicatorDrawerOpen(false)}
				sections={["options", "liquidity"]}
			/>
		</div>
	);
}
