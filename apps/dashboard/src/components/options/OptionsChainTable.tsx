/**
 * OptionsChainTable Component
 *
 * Virtualized options chain table with side-by-side calls and puts.
 * Uses TanStack Virtual for efficient rendering of 100+ strikes.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { OptionsChainRow as ChainRow, OptionsContract } from "@/lib/api/types";
import { OptionsChainRow } from "./OptionsChainRow";

// ============================================
// Types
// ============================================

export interface OptionsChainTableProps {
  /** Chain rows sorted by strike */
  chain: ChainRow[];
  /** ATM strike for highlighting */
  atmStrike: number | null;
  /** Underlying price */
  underlyingPrice: number | null;
  /** Click handler for contract selection */
  onContractClick?: (contract: OptionsContract, type: "call" | "put", strike: number) => void;
  /** Callback when visible rows change (for subscription management) */
  onVisibleRowsChange?: (startIndex: number, endIndex: number) => void;
  /** Custom CSS class */
  className?: string;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const ROW_HEIGHT = 44; // Height of each row in pixels
const OVERSCAN = 5; // Extra rows to render above/below viewport

// ============================================
// Header Component
// ============================================

const ChainHeader = memo(function ChainHeader() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center sticky top-0 z-10 bg-cream-100 dark:bg-night-700 border-b border-cream-200 dark:border-night-600">
      {/* Calls header */}
      <div className="grid grid-cols-5 gap-1 px-2 py-2 text-xs font-semibold text-cream-600 dark:text-cream-300">
        <span className="text-right">Bid</span>
        <span className="text-right">Ask</span>
        <span className="text-right">Last</span>
        <span className="text-right">Vol</span>
        <span className="text-right">OI</span>
      </div>

      {/* Strike header */}
      <div className="px-4 py-2 min-w-[80px] text-center text-xs font-semibold text-cream-600 dark:text-cream-300 border-x border-cream-200 dark:border-night-600">
        Strike
      </div>

      {/* Puts header */}
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

// ============================================
// Component
// ============================================

/**
 * OptionsChainTable displays a virtualized options chain.
 *
 * Features:
 * - TanStack Virtual for efficient rendering
 * - Auto-scroll to ATM on mount
 * - Side-by-side calls/puts centered on strikes
 * - Callbacks for visible row tracking (subscription management)
 * - Sticky header
 *
 * @example
 * ```tsx
 * <OptionsChainTable
 *   chain={chainData.chain}
 *   atmStrike={chainData.atmStrike}
 *   underlyingPrice={chainData.underlyingPrice}
 *   onContractClick={handleContractClick}
 *   onVisibleRowsChange={handleVisibleRowsChange}
 * />
 * ```
 */
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

  // Find ATM index for initial scroll
  const atmIndex = useMemo(() => {
    if (atmStrike === null) {
      return Math.floor(chain.length / 2);
    }
    const index = chain.findIndex((row) => row.strike === atmStrike);
    return index >= 0 ? index : Math.floor(chain.length / 2);
  }, [chain, atmStrike]);

  // Set up virtualizer
  const virtualizer = useVirtualizer({
    count: chain.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Scroll to ATM on mount
  useEffect(() => {
    if (chain.length === 0) {
      return;
    }
    // Small delay to ensure container is measured
    const timer = setTimeout(() => {
      virtualizer.scrollToIndex(atmIndex, { align: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [atmIndex, chain.length, virtualizer]);

  // Report visible rows for subscription management
  useEffect(() => {
    if (onVisibleRowsChange && virtualItems.length > 0) {
      const startIndex = virtualItems[0]?.index ?? 0;
      const endIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
      onVisibleRowsChange(startIndex, endIndex);
    }
  }, [virtualItems, onVisibleRowsChange]);

  // Handle contract click with strike info
  const handleContractClick = useCallback(
    (contract: OptionsContract, type: "call" | "put") => {
      if (onContractClick) {
        // Find the strike for this contract
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
      {/* Fixed header */}
      <ChainHeader />

      {/* Virtualized body */}
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
