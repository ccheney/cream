"use client";

/**
 * AccountSummaryCard Component
 *
 * Displays 8 key account metrics in a responsive 2x4 grid.
 * Metrics: Cash, Buying Power, Long Value, Short Value, Margin Used, PDT Status, Day Trades, Shorting
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Account } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface AccountSummaryCardProps {
  account?: Account;
  isLoading?: boolean;
  isStreaming?: boolean;
}

interface MetricItemProps {
  label: string;
  tooltip: string;
  value: string;
  variant?: "default" | "positive" | "negative" | "warning";
  isLoading?: boolean;
}

// ============================================
// Metric Item Component
// ============================================

const MetricItem = memo(function MetricItem({
  label,
  tooltip,
  value,
  variant = "default",
  isLoading = false,
}: MetricItemProps) {
  const variantClasses = {
    default: "text-stone-900 dark:text-night-50",
    positive: "text-green-600 dark:text-green-400",
    negative: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
  };

  if (isLoading) {
    return (
      <div className="space-y-1">
        <div className="h-3 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-6 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-stone-400 dark:text-night-500 cursor-help">{label}</span>
        </TooltipTrigger>
        <TooltipContent position="top">{tooltip}</TooltipContent>
      </Tooltip>
      <div className={`text-lg font-semibold font-mono ${variantClasses[variant]}`}>{value}</div>
    </div>
  );
});

// ============================================
// Formatters
// ============================================

function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================
// Main Component
// ============================================

export const AccountSummaryCard = memo(function AccountSummaryCard({
  account,
  isLoading = false,
  isStreaming = false,
}: AccountSummaryCardProps) {
  // Calculate margin used percentage
  const marginUsed =
    account && account.equity > 0 ? (account.maintenanceMargin / account.equity) * 100 : 0;

  // Determine margin status variant
  const marginVariant: MetricItemProps["variant"] =
    marginUsed >= 80 ? "negative" : marginUsed >= 50 ? "warning" : "default";

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
          Account Summary
        </h2>
        {isStreaming && (
          <output
            className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
            aria-label="Live streaming"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </output>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
        {/* Row 1: Cash, Buying Power, Long Value, Short Value */}
        <MetricItem
          label="Cash"
          tooltip="Available cash balance for trading"
          value={formatCurrency(account?.cash ?? 0)}
          isLoading={isLoading}
        />
        <MetricItem
          label="Buying Power"
          tooltip="Total buying power including margin (2x for margin accounts)"
          value={formatCurrency(account?.buyingPower ?? 0, true)}
          isLoading={isLoading}
        />
        <MetricItem
          label="Long Value"
          tooltip="Total market value of long positions"
          value={formatCurrency(account?.longMarketValue ?? 0)}
          isLoading={isLoading}
        />
        <MetricItem
          label="Short Value"
          tooltip="Total market value of short positions"
          value={formatCurrency(account?.shortMarketValue ?? 0)}
          variant={account && account.shortMarketValue > 0 ? "negative" : "default"}
          isLoading={isLoading}
        />

        {/* Row 2: Margin Used, PDT Status, Day Trades, Shorting */}
        <MetricItem
          label="Margin Used"
          tooltip="Percentage of available margin currently utilized"
          value={formatPercent(marginUsed)}
          variant={marginVariant}
          isLoading={isLoading}
        />
        <MetricItem
          label="PDT Status"
          tooltip="Pattern Day Trader status (requires $25k equity to day trade)"
          value={account?.patternDayTrader ? "Yes" : "No"}
          variant={account?.patternDayTrader ? "warning" : "default"}
          isLoading={isLoading}
        />
        <MetricItem
          label="Day Trades"
          tooltip="Number of day trades used in rolling 5-day period (limit: 3)"
          value={`${account?.daytradeCount ?? 0}/3`}
          variant={account && account.daytradeCount >= 3 ? "negative" : "default"}
          isLoading={isLoading}
        />
        <MetricItem
          label="Shorting"
          tooltip="Whether short selling is enabled on this account"
          value={account?.shortingEnabled ? "Enabled" : "Disabled"}
          variant={account?.shortingEnabled ? "positive" : "default"}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
});

export default AccountSummaryCard;
