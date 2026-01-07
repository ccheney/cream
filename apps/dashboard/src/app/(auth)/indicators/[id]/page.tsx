"use client";

/**
 * Indicator Detail Page
 *
 * Detailed view of a single indicator with IC history, validation report,
 * and paper trading metrics.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ICChart, RetireButton, ValidationReport } from "@/components/indicators";
import { useIndicatorDetail, useIndicatorICHistory } from "@/hooks/queries";

export default function IndicatorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: indicator, isLoading } = useIndicatorDetail(id);
  const { data: icHistory, isLoading: icLoading } = useIndicatorICHistory(id, 180);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  if (!indicator) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-medium text-cream-900 dark:text-cream-100">
          Indicator not found
        </h1>
        <Link href="/indicators" className="mt-4 text-blue-600 hover:underline">
          Back to Indicator Lab
        </Link>
      </div>
    );
  }

  const statusColors = {
    production: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    paper: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    staging: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    retired: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400",
  };

  // Parse validation report from indicator data
  const validationReport = indicator.validationReport
    ? (indicator.validationReport as {
        validatedAt?: string;
        trialNumber?: number;
        gates?: Array<{
          name: string;
          value: number;
          threshold: string;
          passed: boolean;
        }>;
        paperTrading?: {
          startDate: string;
          endDate: string;
          durationDays: number;
          backtestedSharpe: number;
          realizedSharpe: number;
          ratio: number;
        };
      })
    : null;

  const canRetire = indicator.status === "production" || indicator.status === "paper";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-cream-500 dark:text-cream-400 mb-1">
            <Link href="/indicators" className="hover:text-blue-600 dark:hover:text-blue-400">
              ← Indicator Lab
            </Link>
            <span>/</span>
            <span>{indicator.name}</span>
          </div>
          <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
            {indicator.name}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`px-2.5 py-1 text-sm font-medium rounded ${statusColors[indicator.status]}`}
            >
              {indicator.status}
            </span>
            <span className="px-2 py-1 text-xs font-medium bg-cream-100 dark:bg-night-700 text-cream-700 dark:text-cream-300 rounded">
              {indicator.category}
            </span>
          </div>
        </div>

        {/* Actions */}
        {canRetire && (
          <RetireButton
            indicatorId={indicator.id}
            indicatorName={indicator.name}
            onSuccess={() => router.push("/indicators")}
          />
        )}
      </div>

      {/* Hypothesis & Rationale */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-2">Hypothesis</h3>
        <p className="text-cream-600 dark:text-cream-400">{indicator.hypothesis}</p>
        {indicator.economicRationale && (
          <div className="mt-4 pt-4 border-t border-cream-100 dark:border-night-700">
            <h4 className="text-sm font-medium text-cream-500 dark:text-cream-400 mb-1">
              Economic Rationale
            </h4>
            <p className="text-cream-600 dark:text-cream-400">{indicator.economicRationale}</p>
          </div>
        )}
      </div>

      {/* IC Performance Chart */}
      <ICChart history={icHistory} isLoading={icLoading} />

      {/* Validation Report */}
      <ValidationReport report={validationReport} isLoading={false} />

      {/* Code & Metadata */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">Details</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-cream-500 dark:text-cream-400">Generated</dt>
            <dd className="text-cream-900 dark:text-cream-100">
              {new Date(indicator.generatedAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-cream-500 dark:text-cream-400">Generated By</dt>
            <dd className="text-cream-900 dark:text-cream-100">{indicator.generatedBy}</dd>
          </div>
          {indicator.promotedAt && (
            <div>
              <dt className="text-cream-500 dark:text-cream-400">Promoted</dt>
              <dd className="text-cream-900 dark:text-cream-100">
                {new Date(indicator.promotedAt).toLocaleString()}
              </dd>
            </div>
          )}
          {indicator.retiredAt && (
            <div>
              <dt className="text-cream-500 dark:text-cream-400">Retired</dt>
              <dd className="text-cream-900 dark:text-cream-100">
                {new Date(indicator.retiredAt).toLocaleString()}
              </dd>
            </div>
          )}
          {indicator.codeHash && (
            <div>
              <dt className="text-cream-500 dark:text-cream-400">Code Hash</dt>
              <dd className="text-cream-900 dark:text-cream-100 font-mono text-xs">
                {indicator.codeHash}
              </dd>
            </div>
          )}
          {indicator.prUrl && (
            <div className="col-span-2">
              <dt className="text-cream-500 dark:text-cream-400">Pull Request</dt>
              <dd>
                <a
                  href={indicator.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {indicator.prUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Paper Trading Period */}
      {indicator.paperTradingStart && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Paper Trading Period
          </h3>
          <div className="text-sm text-cream-600 dark:text-cream-400">
            <span>Started: {new Date(indicator.paperTradingStart).toLocaleDateString()}</span>
            {indicator.paperTradingEnd && (
              <span className="ml-4">
                Ended: {new Date(indicator.paperTradingEnd).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
