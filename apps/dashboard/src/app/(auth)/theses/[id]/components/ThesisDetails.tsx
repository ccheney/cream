"use client";

/**
 * Thesis Details Component
 *
 * Displays thesis details including core thesis, metrics, catalysts,
 * invalidation conditions, supporting evidence, and history timeline.
 */

import { format, formatDistanceToNow } from "date-fns";
import { Clock, Target, TrendingDown, TrendingUp } from "lucide-react";
import { formatPrice } from "./hooks.js";
import type { MetricCardProps, SupportingEvidence, ThesisDetailsProps } from "./types.js";

export function ThesisDetails({ thesis, history }: ThesisDetailsProps) {
  return (
    <>
      <CoreThesis text={thesis.thesis} />

      <KeyMetrics
        timeHorizon={thesis.timeHorizon}
        confidence={thesis.confidence}
        targetPrice={thesis.targetPrice}
        stopPrice={thesis.stopPrice}
      />

      {thesis.catalysts && thesis.catalysts.length > 0 && <Catalysts items={thesis.catalysts} />}

      {thesis.invalidationConditions && thesis.invalidationConditions.length > 0 && (
        <InvalidationConditions items={thesis.invalidationConditions} />
      )}

      {thesis.supportingEvidence && thesis.supportingEvidence.length > 0 && (
        <SupportingEvidenceSection items={thesis.supportingEvidence} />
      )}

      {history && history.length > 0 && <HistoryTimeline history={history} />}

      <Metadata
        agentSource={thesis.agentSource}
        createdAt={thesis.createdAt}
        updatedAt={thesis.updatedAt}
        expiresAt={thesis.expiresAt}
      />
    </>
  );
}

function CoreThesis({ text }: { text: string }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Core Thesis</h2>
      <p className="text-cream-700 dark:text-cream-300 leading-relaxed">{text}</p>
    </div>
  );
}

interface KeyMetricsProps {
  timeHorizon: string;
  confidence: number;
  targetPrice: number | null;
  stopPrice: number | null;
}

function KeyMetrics({ timeHorizon, confidence, targetPrice, stopPrice }: KeyMetricsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard
        icon={<Clock className="w-5 h-5 text-blue-500" />}
        label="Time Horizon"
        value={timeHorizon}
      />
      <MetricCard
        icon={<Target className="w-5 h-5 text-cream-500" />}
        label="Confidence"
        value={`${(confidence * 100).toFixed(0)}%`}
      />
      <MetricCard
        icon={<TrendingUp className="w-5 h-5 text-green-500" />}
        label="Target Price"
        value={formatPrice(targetPrice)}
        valueColor="text-green-600"
      />
      <MetricCard
        icon={<TrendingDown className="w-5 h-5 text-red-500" />}
        label="Stop Price"
        value={formatPrice(stopPrice)}
        valueColor="text-red-600"
      />
    </div>
  );
}

function MetricCard({ icon, label, value, valueColor }: MetricCardProps) {
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

function Catalysts({ items }: { items: string[] }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Catalysts</h2>
      <ul className="space-y-2">
        {items.map((catalyst, i) => (
          <li key={`catalyst-${catalyst.slice(0, 20)}-${i}`} className="flex items-start gap-2">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-cream-700 dark:text-cream-300">{catalyst}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InvalidationConditions({ items }: { items: string[] }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">
        Invalidation Conditions
      </h2>
      <ul className="space-y-2">
        {items.map((condition, i) => (
          <li key={`condition-${condition.slice(0, 20)}-${i}`} className="flex items-start gap-2">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-cream-700 dark:text-cream-300">{condition}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupportingEvidenceSection({ items }: { items: SupportingEvidence[] }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">
        Supporting Evidence
      </h2>
      <div className="space-y-3">
        {items.map((evidence, i) => (
          <EvidenceCard
            key={`evidence-${evidence.type}-${evidence.summary.slice(0, 20)}-${i}`}
            evidence={evidence}
          />
        ))}
      </div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: SupportingEvidence }) {
  return (
    <div className="p-3 rounded-lg bg-cream-50 dark:bg-night-750 border border-cream-100 dark:border-night-700">
      <div className="flex items-center justify-between mb-1">
        <EvidenceTypeBadge type={evidence.type} />
        <span className="text-xs text-cream-500">
          Weight: {(evidence.weight * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-sm text-cream-700 dark:text-cream-300">{evidence.summary}</p>
    </div>
  );
}

function EvidenceTypeBadge({ type }: { type: string }) {
  let className = "px-2 py-0.5 text-xs font-medium rounded ";

  if (type === "technical") {
    className += "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  } else if (type === "fundamental") {
    className += "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
  } else if (type === "sentiment") {
    className += "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  } else {
    className += "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400";
  }

  return <span className={className}>{type}</span>;
}

interface HistoryEvent {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  timestamp: string;
}

function HistoryTimeline({ history }: { history: HistoryEvent[] }) {
  return (
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
  );
}

interface MetadataProps {
  agentSource: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

function Metadata({ agentSource, createdAt, updatedAt, expiresAt }: MetadataProps) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-3">Details</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-cream-500 dark:text-cream-400">Agent Source</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">{agentSource}</div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Created</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">
            {format(new Date(createdAt), "MMM d, yyyy HH:mm")}
          </div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Updated</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">
            {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
          </div>
        </div>
        {expiresAt && (
          <div>
            <span className="text-cream-500 dark:text-cream-400">Expires</span>
            <div className="font-medium text-cream-900 dark:text-cream-100">
              {format(new Date(expiresAt), "MMM d, yyyy")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
