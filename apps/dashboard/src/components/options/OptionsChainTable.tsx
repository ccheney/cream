/** @see docs/plans/ui/40-streaming-data-integration.md Part 2.1 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { OptionsChainRow as ChainRow, OptionsContract } from "@/lib/api/types";
import { OptionsChainRow } from "./OptionsChainRow";

export interface OptionsChainTableProps {
  chain: ChainRow[];
  atmStrike: number | null;
  underlyingPrice: number | null;
  onContractClick?: (contract: OptionsContract, type: "call" | "put", strike: number) => void;
  /** Used for subscription management - only subscribe to visible strikes */
  onVisibleRowsChange?: (startIndex: number, endIndex: number) => void;
  className?: string;
  "data-testid"?: string;
}

const ROW_HEIGHT = 44;
const OVERSCAN = 5;

const ChainHeader = memo(function ChainHeader() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center sticky top-0 z-10 bg-cream-100 dark:bg-night-700 border-b border-cream-200 dark:border-night-600">
      <div className="grid grid-cols-5 gap-1 px-2 py-2 text-xs font-semibold text-cream-600 dark:text-cream-300">
        <span className="text-right">Bid</span>
        <span className="text-right">Ask</span>
        <span className="text-right">Last</span>
        <span className="text-right">Vol</span>
        <span className="text-right">OI</span>
      </div>

      <div className="px-4 py-2 min-w-[80px] text-center text-xs font-semibold text-cream-600 dark:text-cream-300 border-x border-cream-200 dark:border-night-600">
        Strike
      </div>

      <div className="grid grid-cols-5 gap-1 px-2 py-2 text-xs font-semibold text-cream-600 dark:text-cream-300">
        <span className="text-right">Bid</span>
        <span className="text-right">Ask</span>
        <span className="text-right">Last</span>
        <span className="text-right">Vol</span>
        <span className="text-right">OI</span>
      </div>
    </div>
  );
});

export const OptionsChainTable = memo(function OptionsChainTable({
  chain,
  atmStrike,
  underlyingPrice,
  onContractClick,
  onVisibleRowsChange,
  className = "",
  "data-testid": testId,
}: OptionsChainTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const atmIndex = useMemo(() => {
    if (atmStrike === null) {
      return Math.floor(chain.length / 2);
    }
    const index = chain.findIndex((row) => row.strike === atmStrike);
    return index >= 0 ? index : Math.floor(chain.length / 2);
  }, [chain, atmStrike]);

  const virtualizer = useVirtualizer({
    count: chain.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (chain.length === 0) {
      return;
    }
    // Delay ensures container is measured before scrolling
    const timer = setTimeout(() => {
      virtualizer.scrollToIndex(atmIndex, { align: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [atmIndex, chain.length, virtualizer]);

  useEffect(() => {
    if (onVisibleRowsChange && virtualItems.length > 0) {
      const startIndex = virtualItems[0]?.index ?? 0;
      const endIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
      onVisibleRowsChange(startIndex, endIndex);
    }
  }, [virtualItems, onVisibleRowsChange]);

  const handleContractClick = useCallback(
    (contract: OptionsContract, type: "call" | "put") => {
      if (onContractClick) {
        const row = chain.find(
          (r) =>
            (type === "call" && r.call?.symbol === contract.symbol) ||
            (type === "put" && r.put?.symbol === contract.symbol)
        );
        const strike = row?.strike ?? 0;
        onContractClick(contract, type, strike);
      }
    },
    [chain, onContractClick]
  );

  if (chain.length === 0) {
    return (
      <div
        className={`flex items-center justify-center p-8 text-cream-500 dark:text-cream-400 ${className}`}
        data-testid={testId}
      >
        No options data available
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`} data-testid={testId}>
      <ChainHeader />

      <div ref={parentRef} className="flex-1 overflow-auto" style={{ contain: "strict" }}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = chain[virtualRow.index];
            if (!row) {
              return null;
            }

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <OptionsChainRow
                  strike={row.strike}
                  call={row.call}
                  put={row.put}
                  isAtm={row.strike === atmStrike}
                  underlyingPrice={underlyingPrice}
                  onContractClick={handleContractClick}
                  data-testid={`chain-row-${row.strike}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default OptionsChainTable;
