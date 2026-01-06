"use client";

/**
 * Thesis Detail Page
 *
 * Displays detailed thesis information including:
 * - Thesis header (symbol, direction, status, confidence)
 * - Lifecycle timeline
 * - Supporting evidence and citations
 * - Catalysts and invalidation conditions
 * - Related positions and decisions
 * - Edit/close actions for admins
 *
 * @see docs/plans/ui/03-views.md lines 807-880
 */

import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useInvalidateThesis,
  useRealizeThesis,
  useThesis,
  useThesisHistory,
} from "@/hooks/queries";

export default function ThesisDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: thesis, isLoading: thesisLoading } = useThesis(id);
  const { data: history } = useThesisHistory(id);
  const invalidateThesis = useInvalidateThesis();
  const realizeThesis = useRealizeThesis();

  const [showInvalidateModal, setShowInvalidateModal] = useState(false);
  const [showRealizeModal, setShowRealizeModal] = useState(false);
  const [invalidationReason, setInvalidationReason] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [exitNotes, setExitNotes] = useState("");

  const formatPct = (value: number | null) =>
    value !== null ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "--";

  const formatPrice = (value: number | null) => (value !== null ? `$${value.toFixed(2)}` : "--");

  const handleInvalidate = async () => {
    if (invalidationReason.trim()) {
      await invalidateThesis.mutateAsync({ id, reason: invalidationReason });
      setShowInvalidateModal(false);
      setInvalidationReason("");
    }
  };

  const handleRealize = async () => {
    const price = parseFloat(exitPrice);
    if (!Number.isNaN(price)) {
      await realizeThesis.mutateAsync({
        id,
        exitPrice: price,
        notes: exitNotes || undefined,
      });
      setShowRealizeModal(false);
      setExitPrice("");
      setExitNotes("");
    }
  };

  if (thesisLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!thesis) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-cream-500 dark:text-cream-400">Thesis not found</p>
        <Link href="/theses" className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
          ← Back to theses
        </Link>
      </div>
    );
  }

  const DirectionIcon = thesis.direction === "BULLISH" ? TrendingUp : TrendingDown;
  const directionColor = thesis.direction === "BULLISH" ? "text-green-600" : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/theses"
            className="p-2 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono font-semibold text-cream-900 dark:text-cream-100">
              {thesis.symbol}
            </span>
            <DirectionIcon className={`w-6 h-6 ${directionColor}`} />
            <span
              className={`px-3 py-1 text-sm font-medium rounded ${
                thesis.direction === "BULLISH"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : thesis.direction === "BEARISH"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
              }`}
            >
              {thesis.direction}
            </span>
            <span
              className={`px-3 py-1 text-sm font-medium rounded ${
                thesis.status === "ACTIVE"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                  : thesis.status === "REALIZED"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : thesis.status === "INVALIDATED"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
              }`}
            >
              {thesis.status}
            </span>
          </div>
        </div>
        {thesis.status === "ACTIVE" && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowRealizeModal(true)}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Realize
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowInvalidateModal(true)}>
              <XCircle className="w-4 h-4 mr-1" />
              Invalidate
            </Button>
          </div>
        )}
      </div>

      {/* P&L Summary */}
      {thesis.pnlPct !== null && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-cream-500 dark:text-cream-400">Current P&L</div>
              <div
                className={`text-3xl font-semibold ${thesis.pnlPct >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatPct(thesis.pnlPct)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-cream-500 dark:text-cream-400">Entry → Current</div>
              <div className="text-lg font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(thesis.entryPrice)} → {formatPrice(thesis.currentPrice)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Core Thesis */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Core Thesis</h2>
        <p className="text-cream-700 dark:text-cream-300 leading-relaxed">{thesis.thesis}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Clock className="w-5 h-5 text-blue-500" />}
          label="Time Horizon"
          value={thesis.timeHorizon}
        />
        <MetricCard
          icon={<Target className="w-5 h-5 text-cream-500" />}
          label="Confidence"
          value={`${(thesis.confidence * 100).toFixed(0)}%`}
        />
        <MetricCard
          icon={<TrendingUp className="w-5 h-5 text-green-500" />}
          label="Target Price"
          value={formatPrice(thesis.targetPrice)}
          valueColor="text-green-600"
        />
        <MetricCard
          icon={<TrendingDown className="w-5 h-5 text-red-500" />}
          label="Stop Price"
          value={formatPrice(thesis.stopPrice)}
          valueColor="text-red-600"
        />
      </div>

      {/* Catalysts */}
      {thesis.catalysts && thesis.catalysts.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Catalysts</h2>
          <ul className="space-y-2">
            {thesis.catalysts.map((catalyst, i) => (
              <li key={`catalyst-${catalyst.slice(0, 20)}-${i}`} className="flex items-start gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-cream-700 dark:text-cream-300">{catalyst}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invalidation Conditions */}
      {thesis.invalidationConditions && thesis.invalidationConditions.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">
            Invalidation Conditions
          </h2>
          <ul className="space-y-2">
            {thesis.invalidationConditions.map((condition, i) => (
              <li
                key={`condition-${condition.slice(0, 20)}-${i}`}
                className="flex items-start gap-2"
              >
                <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-cream-700 dark:text-cream-300">{condition}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Supporting Evidence */}
      {thesis.supportingEvidence && thesis.supportingEvidence.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">
            Supporting Evidence
          </h2>
          <div className="space-y-3">
            {thesis.supportingEvidence.map((evidence, i) => (
              <div
                key={`evidence-${evidence.type}-${evidence.summary.slice(0, 20)}-${i}`}
                className="p-3 rounded-lg bg-cream-50 dark:bg-night-750 border border-cream-100 dark:border-night-700"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      evidence.type === "technical"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        : evidence.type === "fundamental"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                          : evidence.type === "sentiment"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                    }`}
                  >
                    {evidence.type}
                  </span>
                  <span className="text-xs text-cream-500">
                    Weight: {(evidence.weight * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-cream-700 dark:text-cream-300">{evidence.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History/Timeline */}
      {history && history.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">
            History Timeline
          </h2>
          <div className="space-y-3">
            {history.map((event, i) => (
              <div key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-cream-400 dark:bg-cream-600" />
                  {i < history.length - 1 && (
                    <div className="w-px flex-1 bg-cream-200 dark:bg-night-700" />
                  )}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-cream-900 dark:text-cream-100">
                      {event.field} changed
                    </span>
                    <span className="text-xs text-cream-500">
                      {format(new Date(event.timestamp), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <p className="text-sm text-cream-600 dark:text-cream-400 mt-1">
                    {String(event.oldValue)} → {String(event.newValue)}
                  </p>
                  {event.reason && (
                    <p className="text-xs text-cream-500 mt-1">Reason: {event.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-cream-500 dark:text-cream-400">Agent Source</span>
            <div className="font-medium text-cream-900 dark:text-cream-100">
              {thesis.agentSource}
            </div>
          </div>
          <div>
            <span className="text-cream-500 dark:text-cream-400">Created</span>
            <div className="font-medium text-cream-900 dark:text-cream-100">
              {format(new Date(thesis.createdAt), "MMM d, yyyy HH:mm")}
            </div>
          </div>
          <div>
            <span className="text-cream-500 dark:text-cream-400">Updated</span>
            <div className="font-medium text-cream-900 dark:text-cream-100">
              {formatDistanceToNow(new Date(thesis.updatedAt), { addSuffix: true })}
            </div>
          </div>
          {thesis.expiresAt && (
            <div>
              <span className="text-cream-500 dark:text-cream-400">Expires</span>
              <div className="font-medium text-cream-900 dark:text-cream-100">
                {format(new Date(thesis.expiresAt), "MMM d, yyyy")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invalidate Modal */}
      {showInvalidateModal && (
        <Modal title="Invalidate Thesis" onClose={() => setShowInvalidateModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-cream-600 dark:text-cream-400">
              This will mark the thesis as invalidated. Please provide a reason.
            </p>
            <div>
              <label
                htmlFor="invalidation-reason"
                className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
              >
                Reason for invalidation
              </label>
              <textarea
                id="invalidation-reason"
                value={invalidationReason}
                onChange={(e) => setInvalidationReason(e.target.value)}
                rows={3}
                className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
                placeholder="e.g., Price broke below key support level"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowInvalidateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleInvalidate}
                disabled={!invalidationReason.trim() || invalidateThesis.isPending}
              >
                {invalidateThesis.isPending ? "Invalidating..." : "Confirm Invalidate"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Realize Modal */}
      {showRealizeModal && (
        <Modal title="Realize Thesis" onClose={() => setShowRealizeModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-cream-600 dark:text-cream-400">
              Mark this thesis as realized. Enter the exit price to calculate final P&L.
            </p>
            <div>
              <label
                htmlFor="exit-price"
                className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
              >
                Exit Price
              </label>
              <input
                id="exit-price"
                type="number"
                step="0.01"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
                placeholder="e.g., 185.50"
              />
            </div>
            <div>
              <label
                htmlFor="exit-notes"
                className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
              >
                Notes (optional)
              </label>
              <textarea
                id="exit-notes"
                value={exitNotes}
                onChange={(e) => setExitNotes(e.target.value)}
                rows={2}
                className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
                placeholder="e.g., Catalyst played out as expected"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowRealizeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRealize}
                disabled={!exitPrice || realizeThesis.isPending}
              >
                {realizeThesis.isPending ? "Realizing..." : "Confirm Realize"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-cream-500 dark:text-cream-400">{label}</span>
      </div>
      <div
        className={`text-xl font-semibold ${valueColor ?? "text-cream-900 dark:text-cream-100"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-label="Close modal"
      />
      <div className="relative bg-white dark:bg-night-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
