"use client";

/**
 * Thesis Header Component
 *
 * Displays thesis header with symbol, direction, status, and action buttons.
 */

import { ArrowLeft, CheckCircle, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPct, formatPrice } from "./hooks";
import type { ThesisHeaderProps } from "./types";

export function ThesisHeader({ thesis, onRealize, onInvalidate }: ThesisHeaderProps) {
  const DirectionIcon = thesis.direction === "BULLISH" ? TrendingUp : TrendingDown;
  const directionColor = thesis.direction === "BULLISH" ? "text-green-600" : "text-red-600";

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/theses"
            className="p-2 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono font-semibold text-stone-900 dark:text-night-50">
              {thesis.symbol}
            </span>
            <DirectionIcon className={`w-6 h-6 ${directionColor}`} />
            <DirectionBadge direction={thesis.direction} />
            <StatusBadge status={thesis.status} />
          </div>
        </div>
        {thesis.status === "ACTIVE" && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRealize}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Realize
            </Button>
            <Button variant="destructive" size="sm" onClick={onInvalidate}>
              <XCircle className="w-4 h-4 mr-1" />
              Invalidate
            </Button>
          </div>
        )}
      </div>

      {thesis.pnlPct !== null && <PnlSummary thesis={thesis} />}
    </>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  let className = "px-3 py-1 text-sm font-medium rounded ";

  if (direction === "BULLISH") {
    className += "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  } else if (direction === "BEARISH") {
    className += "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  } else {
    className += "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";
  }

  return <span className={className}>{direction}</span>;
}

function StatusBadge({ status }: { status: string }) {
  let className = "px-3 py-1 text-sm font-medium rounded ";

  if (status === "ACTIVE") {
    className += "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  } else if (status === "REALIZED") {
    className += "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  } else if (status === "INVALIDATED") {
    className += "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  } else {
    className += "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";
  }

  return <span className={className}>{status}</span>;
}

interface PnlSummaryProps {
  thesis: {
    pnlPct: number | null;
    entryPrice: number | null;
    currentPrice: number | null;
  };
}

function PnlSummary({ thesis }: PnlSummaryProps) {
  const pnlColor = thesis.pnlPct !== null && thesis.pnlPct >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-stone-500 dark:text-night-300">Current P&L</div>
          <div className={`text-3xl font-semibold ${pnlColor}`}>{formatPct(thesis.pnlPct)}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-stone-500 dark:text-night-300">Entry → Current</div>
          <div className="text-lg font-mono text-stone-900 dark:text-night-50">
            {formatPrice(thesis.entryPrice)} → {formatPrice(thesis.currentPrice)}
          </div>
        </div>
      </div>
    </div>
  );
}
