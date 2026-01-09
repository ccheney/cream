/**
 * Options Chain Page - Specific Underlying
 *
 * Displays the full options chain for a specific underlying symbol.
 * Features expiration tabs, virtualized chain table, and live streaming.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExpirationTabs,
  OptionsChainTable,
  type OptionsOrderRequest,
  PositionBuilderModal,
} from "@/components/options";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Spinner } from "@/components/ui/spinner";
import { useQuote } from "@/hooks/queries/useMarket";
import {
  useOptionsChain,
  useOptionsExpirations,
  useOptionsOrder,
} from "@/hooks/queries/useOptions";
import type { OptionsContract } from "@/lib/api/types";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useWatchlistStore } from "@/stores/watchlist-store";

interface OptionsChainPageProps {
  params: Promise<{ underlying: string }>;
}

export default function OptionsChainPage({ params }: OptionsChainPageProps) {
  const [resolvedParams, setResolvedParams] = useState<{ underlying: string } | null>(null);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  if (!resolvedParams) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return <OptionsChainContent underlying={resolvedParams.underlying} />;
}

function OptionsChainContent({ underlying }: { underlying: string }) {
  const upperUnderlying = underlying.toUpperCase();

  const watchlistSymbols = useWatchlistStore((s) => s.symbols);
  const addSymbol = useWatchlistStore((s) => s.addSymbol);
  const isInWatchlist = watchlistSymbols.includes(upperUnderlying);

  const {
    subscribeOptions,
    unsubscribeOptions,
    connected: wsContextConnected,
  } = useWebSocketContext();

  const subscribedContractsRef = useRef<Set<string>>(new Set());

  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<OptionsContract | null>(null);
  const [selectedContractType, setSelectedContractType] = useState<"call" | "put" | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);

  const { mutateAsync: submitOrder } = useOptionsOrder();
  const { data: quote, connected: wsConnected } = useQuote(upperUnderlying);
  const { data: expirationsData, isLoading: expirationsLoading } =
    useOptionsExpirations(upperUnderlying);

  useEffect(() => {
    if (
      expirationsData?.expirations &&
      expirationsData.expirations.length > 0 &&
      !selectedExpiration
    ) {
      setSelectedExpiration(expirationsData.expirations[0]?.date ?? null);
    }
  }, [expirationsData, selectedExpiration]);

  const {
    data: chainData,
    isLoading: chainLoading,
    isFetching: chainFetching,
    refetch: refetchChain,
  } = useOptionsChain(upperUnderlying, {
    expiration: selectedExpiration ?? undefined,
    strikeRange: 25,
    enabled: Boolean(selectedExpiration),
  });

  const handleExpirationSelect = useCallback((date: string) => {
    setSelectedExpiration(date);
  }, []);

  const handleContractClick = useCallback(
    (contract: OptionsContract, type: "call" | "put", strike: number) => {
      setSelectedContract(contract);
      setSelectedContractType(type);
      setSelectedStrike(strike);
      setModalOpen(true);
    },
    []
  );

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedContract(null);
    setSelectedContractType(null);
    setSelectedStrike(null);
  }, []);

  const handleSubmitOrder = useCallback(
    async (order: OptionsOrderRequest) => {
      await submitOrder(order);
    },
    [submitOrder]
  );

  const handleVisibleRowsChange = useCallback(
    (startIndex: number, endIndex: number) => {
      if (!chainData?.chain || !wsContextConnected) {
        return;
      }

      const visibleContracts = new Set<string>();
      for (let i = startIndex; i <= endIndex && i < chainData.chain.length; i++) {
        const row = chainData.chain[i];
        if (row?.call?.symbol) {
          visibleContracts.add(row.call.symbol);
        }
        if (row?.put?.symbol) {
          visibleContracts.add(row.put.symbol);
        }
      }

      const toSubscribe: string[] = [];
      const toUnsubscribe: string[] = [];

      for (const symbol of visibleContracts) {
        if (!subscribedContractsRef.current.has(symbol)) {
          toSubscribe.push(symbol);
        }
      }

      for (const symbol of subscribedContractsRef.current) {
        if (!visibleContracts.has(symbol)) {
          toUnsubscribe.push(symbol);
        }
      }

      if (toUnsubscribe.length > 0) {
        unsubscribeOptions(toUnsubscribe);
        for (const symbol of toUnsubscribe) {
          subscribedContractsRef.current.delete(symbol);
        }
      }

      if (toSubscribe.length > 0) {
        subscribeOptions(toSubscribe);
        for (const symbol of toSubscribe) {
          subscribedContractsRef.current.add(symbol);
        }
      }
    },
    [chainData?.chain, wsContextConnected, subscribeOptions, unsubscribeOptions]
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

  const handleAddToWatchlist = useCallback(() => {
    addSymbol(upperUnderlying);
  }, [addSymbol, upperUnderlying]);

  const priceChange = useMemo(() => {
    if (!quote?.last || !quote?.prevClose) {
      return null;
    }
    const change = quote.last - quote.prevClose;
    const changePct = (change / quote.prevClose) * 100;
    return { change, changePct };
  }, [quote]);

  const isLoading = expirationsLoading || (chainLoading && !chainData);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
        <div className="flex items-center justify-between">
          {/* Left: Back + Symbol + Price */}
          <div className="flex items-center gap-4">
            <Link
              href="/options"
              className="p-1.5 -ml-1.5 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700"
              aria-label="Back to options"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-cream-800 dark:text-cream-100">
                  {upperUnderlying}
                </h1>
                {quote?.last && (
                  <span className="text-lg font-mono text-cream-700 dark:text-cream-200">
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
              </div>
              {!wsConnected && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  Connecting to live data...
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {chainFetching && <Spinner size="sm" />}
            <button
              type="button"
              onClick={() => refetchChain()}
              disabled={chainFetching}
              className="p-2 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700 disabled:opacity-50"
              aria-label="Refresh chain"
            >
              <RefreshCw className={`w-4 h-4 ${chainFetching ? "animate-spin" : ""}`} />
            </button>
            {!isInWatchlist && (
              <button
                type="button"
                onClick={handleAddToWatchlist}
                className="
                  flex items-center gap-1.5 px-3 py-1.5
                  text-sm font-medium text-accent-warm
                  border border-accent-warm rounded-md
                  hover:bg-accent-warm/10
                  transition-colors duration-150
                "
              >
                <Plus className="w-4 h-4" />
                Add to List
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expiration Tabs */}
      {expirationsData?.expirations && expirationsData.expirations.length > 0 && (
        <div className="shrink-0 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
          <ExpirationTabs
            expirations={expirationsData.expirations}
            selected={selectedExpiration}
            onSelect={handleExpirationSelect}
          />
        </div>
      )}

      {/* Chain Table */}
      <div className="flex-1 min-h-0 bg-white dark:bg-night-900">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : chainData?.chain && chainData.chain.length > 0 ? (
          <OptionsChainTable
            chain={chainData.chain}
            atmStrike={chainData.atmStrike}
            underlyingPrice={chainData.underlyingPrice}
            onContractClick={handleContractClick}
            onVisibleRowsChange={handleVisibleRowsChange}
            className="h-full"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-cream-500 dark:text-cream-400">
            <p>No options data available for {upperUnderlying}</p>
            {selectedExpiration && <p className="text-sm mt-1">Expiration: {selectedExpiration}</p>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
        <div className="flex items-center gap-4 text-xs text-cream-500 dark:text-cream-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Streaming live
          </span>
          <span className="flex items-center gap-1">
            <span className="text-accent-warm">★</span>
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

      {/* Position Builder Modal */}
      <PositionBuilderModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        contract={selectedContract}
        contractType={selectedContractType}
        strike={selectedStrike}
        underlying={upperUnderlying}
        expiration={selectedExpiration}
        onSubmit={handleSubmitOrder}
        data-testid="position-builder-modal"
      />
    </div>
  );
}
