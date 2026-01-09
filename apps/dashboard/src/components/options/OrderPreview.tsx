"use client";

import { memo, useMemo } from "react";

// ============================================
// Types
// ============================================

export interface OrderPreviewProps {
  side: "buy" | "sell";
  quantity: number;
  contractPrice: number;
  multiplier?: number;
  className?: string;
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MULTIPLIER = 100;

// ============================================
// Component
// ============================================

export const OrderPreview = memo(function OrderPreview({
  side,
  quantity,
  contractPrice,
  multiplier = DEFAULT_MULTIPLIER,
  className = "",
  "data-testid": testId = "order-preview",
}: OrderPreviewProps) {
  const { totalCost, perContract, isCredit } = useMemo(() => {
    const perContract = contractPrice * multiplier;
    const totalCost = perContract * quantity;
    const isCredit = side === "sell";
    return { totalCost, perContract, isCredit };
  }, [contractPrice, multiplier, quantity, side]);

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
        <div className="flex justify-between text-sm">
          <span className="text-cream-500 dark:text-cream-400">Per Contract</span>
          <span className="font-mono text-cream-700 dark:text-cream-200">
            {formatCurrency(perContract)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-cream-500 dark:text-cream-400">Contracts</span>
          <span className="font-mono text-cream-700 dark:text-cream-200">x {quantity}</span>
        </div>

        <div className="border-t border-cream-200 dark:border-night-600 my-2" />

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

      <p className="mt-3 text-xs text-cream-400 dark:text-cream-500">
        Actual fill price may vary. Commission and fees not included.
      </p>
    </div>
  );
});

export default OrderPreview;
