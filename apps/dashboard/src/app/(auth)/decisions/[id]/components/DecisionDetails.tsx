// biome-ignore-all lint/suspicious/noArrayIndexKey: Factor lists use stable indices
"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { DecisionDetail } from "@/lib/api/types";
import { formatPrice, formatSize, formatStrategy, formatTimeHorizon } from "./utils";

export interface DecisionDetailsProps {
	decision: DecisionDetail;
}

function formatThesisState(state: string | null): string {
	if (!state) {
		return "—";
	}
	return state.charAt(0) + state.slice(1).toLowerCase();
}

function formatPositionIntent(intent: string): string {
	return intent
		.replace(/_/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DecisionDetails({ decision }: DecisionDetailsProps): React.ReactElement {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Decision Details
			</h2>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Size</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{formatSize(decision.size, decision.sizeUnit)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Strategy</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{formatStrategy(decision.strategyFamily)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Time Horizon</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{formatTimeHorizon(decision.timeHorizon)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Thesis State</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{formatThesisState(decision.thesisState)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Consensus</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{decision.consensusCount}/8 agents
					</div>
				</div>
				{decision.entry && (
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Entry Price</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{formatPrice(decision.entry)}
						</div>
					</div>
				)}
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Created</span>
					<div className="text-lg font-medium text-stone-900 dark:text-night-50">
						{formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
					</div>
				</div>
			</div>

			<RiskLevelsSection decision={decision} />
			<OptionLegsSection decision={decision} />
			<RationaleSection decision={decision} />
			<DecisionLogicSection decision={decision} />
			<MemoryReferencesSection decision={decision} />
			<RelatedThesisSection decision={decision} />
		</div>
	);
}

function RiskLevelsSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
	const hasStopLoss = decision.stopLoss || decision.stop;
	const hasTakeProfit = decision.takeProfit || decision.target;

	if (!hasStopLoss && !hasTakeProfit) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Risk Levels</h3>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
				{(decision.stopLoss || decision.stop) && (
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Stop Loss</span>
						<div className="text-lg font-medium text-red-600">
							{formatPrice(decision.stopLoss?.price ?? decision.stop)}
						</div>
						{decision.stopLoss?.type && (
							<span className="text-xs text-stone-400 dark:text-night-400">
								{decision.stopLoss.type}
							</span>
						)}
					</div>
				)}
				{(decision.takeProfit || decision.target) && (
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Take Profit</span>
						<div className="text-lg font-medium text-green-600">
							{formatPrice(decision.takeProfit?.price ?? decision.target)}
						</div>
					</div>
				)}
				{decision.netLimitPrice && (
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Net Limit Price</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{formatPrice(decision.netLimitPrice)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function OptionLegsSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
	if (!decision.legs || decision.legs.length === 0) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Option Legs</h3>
			<div className="overflow-x-auto">
				<table className="min-w-full text-sm">
					<thead>
						<tr className="text-left text-stone-500 dark:text-night-300">
							<th className="pr-4 py-2 font-medium">Symbol</th>
							<th className="pr-4 py-2 font-medium">Qty</th>
							<th className="pr-4 py-2 font-medium">Intent</th>
						</tr>
					</thead>
					<tbody>
						{decision.legs.map((leg, i) => (
							<tr key={`leg-${i}`} className="border-t border-cream-100 dark:border-night-700">
								<td className="pr-4 py-2 font-mono text-stone-900 dark:text-night-50">
									{leg.symbol}
								</td>
								<td className="pr-4 py-2">
									<span className={leg.ratioQty > 0 ? "text-green-600" : "text-red-600"}>
										{leg.ratioQty > 0 ? "+" : ""}
										{leg.ratioQty}
									</span>
								</td>
								<td className="pr-4 py-2 text-stone-700 dark:text-night-100">
									{formatPositionIntent(leg.positionIntent)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function RationaleSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
	if (!decision.bullishFactors?.length && !decision.bearishFactors?.length) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Rationale</h3>
			<div className="grid md:grid-cols-2 gap-4">
				<div>
					<h4 className="text-xs font-medium text-green-600 mb-2">Bullish Factors</h4>
					<ul className="space-y-1">
						{(decision.bullishFactors ?? []).map((factor, i) => (
							<li
								key={`bull-${i}`}
								className="text-sm text-stone-700 dark:text-night-100 flex items-start gap-2"
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
								className="text-sm text-stone-700 dark:text-night-100 flex items-start gap-2"
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

function DecisionLogicSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
	if (!decision.decisionLogic) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Decision Logic</h3>
			<p className="text-sm text-stone-700 dark:text-night-100 whitespace-pre-wrap">
				{decision.decisionLogic}
			</p>
		</div>
	);
}

function MemoryReferencesSection({ decision }: DecisionDetailsProps): React.ReactElement | null {
	if (!decision.memoryReferences || decision.memoryReferences.length === 0) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">
				Memory References
			</h3>
			<div className="flex flex-wrap gap-2">
				{decision.memoryReferences.map((ref, i) => (
					<span
						key={`mem-${i}`}
						className="px-2 py-1 text-xs font-mono bg-cream-100 dark:bg-night-700 text-stone-600 dark:text-night-200 rounded"
					>
						{ref}
					</span>
				))}
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
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-2">Related Thesis</h3>
			<Link
				href={`/theses/${decision.thesis.id}`}
				className="inline-flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-night-700 rounded-md text-sm text-stone-700 dark:text-night-100 hover:bg-cream-100 dark:hover:bg-night-600"
			>
				<span className="font-medium">{decision.thesis.symbol}</span>
				<span>&ndash;</span>
				<span>{decision.thesis.title}</span>
			</Link>
		</div>
	);
}
