/**
 * OptionsChainRow Component
 *
 * Single row in the options chain table showing call and put at same strike.
 * Supports flash animations on quote updates and hover for greeks.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { memo, useCallback, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { usePriceFlash } from "@/components/ui/use-price-flash";
import type { OptionsContract } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface OptionsChainRowProps {
  /** Strike price */
  strike: number;
  /** Call contract data */
  call: OptionsContract | null;
  /** Put contract data */
  put: OptionsContract | null;
  /** Is this the at-the-money strike */
  isAtm: boolean;
  /** Underlying price for reference */
  underlyingPrice: number | null;
  /** Previous call price for flash animation */
  previousCallPrice?: number;
  /** Previous put price for flash animation */
  previousPutPrice?: number;
  /** Click handler for contract selection */
  onContractClick?: (contract: OptionsContract, type: "call" | "put") => void;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Helper Functions
// ============================================

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(2);
}

function formatVolume(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

function formatOI(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

// ============================================
// Contract Cell Component
// ============================================

interface ContractCellProps {
  contract: OptionsContract | null;
  type: "call" | "put";
  previousPrice?: number;
  onClick?: (contract: OptionsContract, type: "call" | "put") => void;
  isAtm: boolean;
}

const ContractCell = memo(function ContractCell({
  contract,
  type,
  previousPrice,
  onClick,
  isAtm,
}: ContractCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { flash } = usePriceFlash(contract?.last ?? 0, previousPrice);

  const handleClick = useCallback(() => {
    if (contract && onClick) {
      onClick(contract, type);
    }
  }, [contract, type, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && contract && onClick) {
        e.preventDefault();
        onClick(contract, type);
      }
    },
    [contract, type, onClick]
  );

  if (!contract) {
    return (
      <div className="flex items-center justify-center px-2 py-1.5 text-cream-300 dark:text-night-600">
        —
      </div>
    );
  }

  const flashClasses = flash.isFlashing
    ? flash.direction === "up"
      ? "animate-flash-profit"
      : "animate-flash-loss"
    : "";

  const itmClass =
    type === "call" ? "bg-green-50/50 dark:bg-green-900/20" : "bg-red-50/50 dark:bg-red-900/20";

  return (
    // biome-ignore lint/a11y/useSemanticElements: Options chain cell with complex hover state and click behavior
    <div
      className={`
        grid grid-cols-5 gap-1 px-2 py-1.5 text-xs font-mono
        cursor-pointer transition-colors duration-150
        hover:bg-cream-100 dark:hover:bg-night-700
        ${isAtm ? itmClass : ""}
        ${flashClasses}
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`${type} option at strike, bid ${formatPrice(contract.bid)}, ask ${formatPrice(contract.ask)}`}
    >
      {/* Bid */}
      <span className="text-right text-green-600 dark:text-green-400">
        {formatPrice(contract.bid)}
      </span>

      {/* Ask */}
      <span className="text-right text-red-600 dark:text-red-400">{formatPrice(contract.ask)}</span>

      {/* Last */}
      <span className="text-right text-cream-700 dark:text-cream-200">
        {contract.last !== null ? (
          <AnimatedNumber value={contract.last} format="decimal" decimals={2} />
        ) : (
          "—"
        )}
      </span>

      {/* Volume */}
      <span className="text-right text-cream-500 dark:text-cream-400">
        {formatVolume(contract.volume)}
      </span>

      {/* Open Interest */}
      <span className="text-right text-cream-500 dark:text-cream-400">
        {formatOI(contract.openInterest)}
      </span>

      {/* Streaming indicator */}
      {isHovered && (
        <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
});

// ============================================
// Component
// ============================================

/**
 * OptionsChainRow displays a single row with call and put at same strike.
 *
 * Features:
 * - Side-by-side calls and puts
 * - Strike price in center column
 * - ATM strike highlighting
 * - Flash animation on price updates
 * - Click to open position builder
 * - Hover for greeks tooltip
 *
 * @example
 * ```tsx
 * <OptionsChainRow
 *   strike={180}
 *   call={chainData.call}
 *   put={chainData.put}
 *   isAtm={strike === atmStrike}
 *   underlyingPrice={187.52}
 *   onContractClick={handleContractClick}
 * />
 * ```
 */
export const OptionsChainRow = memo(function OptionsChainRow({
  strike,
  call,
  put,
  isAtm,
  underlyingPrice,
  previousCallPrice,
  previousPutPrice,
  onContractClick,
  "data-testid": testId,
}: OptionsChainRowProps) {
  // Calculate if strike is ITM for calls or puts
  const callItm = underlyingPrice !== null && strike < underlyingPrice;
  const putItm = underlyingPrice !== null && strike > underlyingPrice;

  return (
    <div
      className={`
        grid grid-cols-[1fr_auto_1fr] items-center
        border-b border-cream-100 dark:border-night-700
        ${isAtm ? "bg-accent-warm/10 dark:bg-accent-warm/20" : ""}
      `}
      data-testid={testId}
    >
      {/* Calls - left side */}
      <div className={callItm && !isAtm ? "bg-green-50/30 dark:bg-green-900/10" : ""}>
        <ContractCell
          contract={call}
          type="call"
          previousPrice={previousCallPrice}
          onClick={onContractClick}
          isAtm={isAtm}
        />
      </div>

      {/* Strike - center */}
      <div
        className={`
          px-4 py-1.5 min-w-[80px] text-center font-mono text-sm font-semibold
          border-x border-cream-200 dark:border-night-600
          ${
            isAtm
              ? "bg-accent-warm text-white"
              : "bg-cream-50 dark:bg-night-800 text-cream-700 dark:text-cream-200"
          }
        `}
      >
        {isAtm && <span className="mr-1 text-xs">★</span>}
        {strike.toFixed(2)}
      </div>

      {/* Puts - right side */}
      <div className={putItm && !isAtm ? "bg-red-50/30 dark:bg-red-900/10" : ""}>
        <ContractCell
          contract={put}
          type="put"
          previousPrice={previousPutPrice}
          onClick={onContractClick}
          isAtm={isAtm}
        />
      </div>
    </div>
  );
});

export default OptionsChainRow;
