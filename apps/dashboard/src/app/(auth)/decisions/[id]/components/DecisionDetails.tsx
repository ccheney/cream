// biome-ignore-all lint/suspicious/noArrayIndexKey: Factor lists use stable indices
"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { DecisionDetail } from "@/lib/api/types";
import { formatPrice, formatSize, formatStrategy, formatTimeHorizon } from "./utils.js";

export interface DecisionDetailsProps {
  decision: DecisionDetail;
}

export function DecisionDetails({ decision }: DecisionDetailsProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
        Decision Details
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <span className="text-sm text-cream-500 dark:text-cream-400">Size</span>
          <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {formatSize(decision.size, decision.sizeUnit)}
          </div>
        </div>
        <div>
          <span className="text-sm text-cream-500 dark:text-cream-400">Strategy</span>
          <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {formatStrategy(decision.strategyFamily)}
          </div>
        </div>
        <div>
          <span className="text-sm text-cream-500 dark:text-cream-400">Time Horizon</span>
          <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {formatTimeHorizon(decision.timeHorizon)}
          </div>
        </div>
        <div>
          <span className="text-sm text-cream-500 dark:text-cream-400">Consensus</span>
          <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {decision.consensusCount}/8 agents
          </div>
        </div>
        {decision.entry && (
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Entry Price</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {formatPrice(decision.entry)}
            </div>
          </div>
        )}
        {decision.stop && (
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Stop Loss</span>
            <div className="text-lg font-medium text-red-600">{formatPrice(decision.stop)}</div>
          </div>
        )}
        {decision.target && (
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Target</span>
            <div className="text-lg font-medium text-green-600">{formatPrice(decision.target)}</div>
          </div>
        )}
        <div>
          <span className="text-sm text-cream-500 dark:text-cream-400">Created</span>
          <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
          </div>
        </div>
      </div>

      <RationaleSection decision={decision} />
      <RelatedThesisSection decision={decision} />
    </div>
  );
}

function RationaleSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
  if (!decision.bullishFactors?.length && !decision.bearishFactors?.length) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
      <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-3">Rationale</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-medium text-green-600 mb-2">Bullish Factors</h4>
          <ul className="space-y-1">
            {(decision.bullishFactors ?? []).map((factor, i) => (
              <li
                key={`bull-${i}`}
                className="text-sm text-cream-700 dark:text-cream-300 flex items-start gap-2"
              >
                <span className="text-green-500 mt-0.5">+</span>
                {factor}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-medium text-red-600 mb-2">Bearish Factors</h4>
          <ul className="space-y-1">
            {(decision.bearishFactors ?? []).map((factor, i) => (
              <li
                key={`bear-${i}`}
                className="text-sm text-cream-700 dark:text-cream-300 flex items-start gap-2"
              >
                <span className="text-red-500 mt-0.5">-</span>
                {factor}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RelatedThesisSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
  if (!decision.thesis) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
      <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-2">
        Related Thesis
      </h3>
      <Link
        href={`/theses/${decision.thesis.id}`}
        className="inline-flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-night-700 rounded-md text-sm text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-600"
      >
        <span className="font-medium">{decision.thesis.symbol}</span>
        <span>&ndash;</span>
        <span>{decision.thesis.title}</span>
      </Link>
    </div>
  );
}
