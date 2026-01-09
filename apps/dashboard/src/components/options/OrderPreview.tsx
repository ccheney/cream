/**
 * OrderPreview Component
 *
 * Displays order cost/credit preview for options orders.
 * Shows estimated premium and total cost with contract multiplier.
 */

"use client";

import { memo, useMemo } from "react";

// ============================================
// Types
// ============================================

export interface OrderPreviewProps {
  /** Order side (buy = debit, sell = credit) */
  side: "buy" | "sell";
  /** Number of contracts */
  quantity: number;
  /** Contract price (per share) */
  contractPrice: number;
  /** Options multiplier (default 100) */
  multiplier?: number;
  /** Custom CSS class */
  className?: string;
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MULTIPLIER = 100;

// ============================================
// Component
// ============================================

/**
 * OrderPreview displays the estimated cost/credit for an options order.
 *
 * @example
 * ```tsx
 * <OrderPreview
 *   side="buy"
 *   quantity={2}
 *   contractPrice={3.50}
 * />
 * ```
 */
export const OrderPreview = memo(function OrderPreview({
  side,
  quantity,
  contractPrice,
  multiplier = DEFAULT_MULTIPLIER,
  className = "",
  "data-testid": testId = "order-preview",
}: OrderPreviewProps) {
  // Calculate totals
  const { totalCost, perContract, isCredit } = useMemo(() => {
    const perContract = contractPrice * multiplier;
    const totalCost = perContract * quantity;
    const isCredit = side === "sell";
    return { totalCost, perContract, isCredit };
  }, [contractPrice, multiplier, quantity, side]);

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div
      className={`p-4 bg-cream-50 dark:bg-night-700 rounded-md border border-cream-200 dark:border-night-600 ${className}`}
      data-testid={testId}
    >
      <h4 className="text-sm font-semibold text-cream-700 dark:text-cream-300 mb-3">
        Order Preview
      </h4>

      <div className="space-y-2">
        {/* Per Contract */}
        <div className="flex justify-between text-sm">
          <span className="text-cream-500 dark:text-cream-400">Per Contract</span>
          <span className="font-mono text-cream-700 dark:text-cream-200">
            {formatCurrency(perContract)}
          </span>
        </div>

        {/* Quantity */}
        <div className="flex justify-between text-sm">
          <span className="text-cream-500 dark:text-cream-400">Contracts</span>
          <span className="font-mono text-cream-700 dark:text-cream-200">x {quantity}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-cream-200 dark:border-night-600 my-2" />

        {/* Total */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-cream-600 dark:text-cream-300">
            {isCredit ? "Total Credit" : "Total Cost"}
          </span>
          <span
            className={`text-lg font-bold font-mono ${
              isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {isCredit ? "+" : "-"}
            {formatCurrency(totalCost)}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-xs text-cream-400 dark:text-cream-500">
        Actual fill price may vary. Commission and fees not included.
      </p>
    </div>
  );
});

export default OrderPreview;
