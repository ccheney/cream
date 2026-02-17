"use client";

/**
 * Decisions Page - Timeline of trading decisions grouped by cycle
 *
 * Supports deep linking via ?cycle=<cycleId> query param to auto-expand
 * and scroll to a specific cycle group.
 */

import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { SourceLogo } from "@/components/ui/source-logo";
import { useDecisions } from "@/hooks/queries";
import type { DecisionAction, DecisionStatus } from "@/lib/api/types";
import { buildTickerLogoUrl } from "@/lib/config";

const formatSizeUnit = (unit: string): string => {
	const map: Record<string, string> = {
		PCT_EQUITY: "% equity",
		SHARES: "shares",
		CONTRACTS: "contracts",
		DOLLARS: "",
	};
	return map[unit] ?? unit.toLowerCase().replace(/_/g, " ");
};

const formatSize = (size: number, unit: string): string => {
	if (unit === "DOLLARS") {
		return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(size);
	}
	return `${size} ${formatSizeUnit(unit)}`;
};

interface Decision {
	id: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: string;
	size: number;
	sizeUnit: string;
	entry: number | null;
	stop: number | null;
	target: number | null;
	status: DecisionStatus;
	consensusCount: number;
	pnl: number | null;
	createdAt: string;
}

interface CycleGroup {
	cycleId: string;
	timestamp: string;
	decisions: Decision[];
}

function groupDecisionsByCycle(decisions: Decision[]): CycleGroup[] {
	const groups = new Map<string, Decision[]>();

	for (const decision of decisions) {
		const existing = groups.get(decision.cycleId);
		if (existing) {
			existing.push(decision);
		} else {
			groups.set(decision.cycleId, [decision]);
		}
	}

	return Array.from(groups.entries())
		.map(([cycleId, decisions]) => ({
			cycleId,
			timestamp: decisions[0]?.createdAt ?? "",
			decisions: decisions.sort((a, b) => a.symbol.localeCompare(b.symbol)),
		}))
		.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export default function DecisionsPage() {
	const {
		actionFilter,
		cycleGroups,
		decisions,
		highlightedCycleId,
		isLoading,
		setActionFilter,
		setStatusFilter,
		statusFilter,
	} = useDecisionTimelineData();
	const { collapseAll, expandAll, expandedCycles, setCycleRef, toggleCycle } = useCycleExpansion(
		highlightedCycleId,
		cycleGroups,
	);

	return (
		<div className="space-y-6">
			<DecisionsHeader
				actionFilter={actionFilter}
				statusFilter={statusFilter}
				setActionFilter={setActionFilter}
				setStatusFilter={setStatusFilter}
			/>
			<DecisionTimelinePanel
				collapseAll={collapseAll}
				cycleGroups={cycleGroups}
				decisionsTotal={decisions?.total ?? 0}
				expandAll={expandAll}
				expandedCycles={expandedCycles}
				isLoading={isLoading}
				setCycleRef={setCycleRef}
				toggleCycle={toggleCycle}
			/>
		</div>
	);
}

function useDecisionTimelineData() {
	const searchParams = useSearchParams();
	const highlightedCycleId = searchParams.get("cycle");
	const [actionFilter, setActionFilter] = useState<DecisionAction | "all">("all");
	const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");
	const { data: decisions, isLoading } = useDecisions({
		action: actionFilter === "all" ? undefined : actionFilter,
		status: statusFilter === "all" ? undefined : statusFilter,
		limit: 100,
	});
	const cycleGroups = useMemo(
		() => (decisions?.items ? groupDecisionsByCycle(decisions.items) : []),
		[decisions?.items],
	);

	return {
		actionFilter,
		cycleGroups,
		decisions,
		highlightedCycleId,
		isLoading,
		setActionFilter,
		setStatusFilter,
		statusFilter,
	};
}

function useCycleExpansion(highlightedCycleId: string | null, cycleGroups: CycleGroup[]) {
	const cycleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const hasScrolled = useRef(false);
	const [expandedCycles, setExpandedCycles] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (!highlightedCycleId || cycleGroups.length === 0 || hasScrolled.current) {
			return;
		}

		setExpandedCycles((prev) => new Set([...prev, highlightedCycleId]));
		const timeoutId = setTimeout(() => {
			const element = cycleRefs.current.get(highlightedCycleId);
			if (!element) {
				return;
			}
			element.scrollIntoView({ behavior: "smooth", block: "start" });
			hasScrolled.current = true;
		}, 100);

		return () => clearTimeout(timeoutId);
	}, [highlightedCycleId, cycleGroups]);

	const toggleCycle = (cycleId: string) => {
		setExpandedCycles((prev) => {
			const next = new Set(prev);
			next.has(cycleId) ? next.delete(cycleId) : next.add(cycleId);
			return next;
		});
	};

	const setCycleRef = (cycleId: string, element: HTMLDivElement | null) => {
		element ? cycleRefs.current.set(cycleId, element) : cycleRefs.current.delete(cycleId);
	};

	return {
		collapseAll: () => setExpandedCycles(new Set()),
		expandAll: () => setExpandedCycles(new Set(cycleGroups.map((group) => group.cycleId))),
		expandedCycles,
		setCycleRef,
		toggleCycle,
	};
}

function DecisionsHeader({
	actionFilter,
	setActionFilter,
	setStatusFilter,
	statusFilter,
}: {
	actionFilter: DecisionAction | "all";
	setActionFilter: (value: DecisionAction | "all") => void;
	setStatusFilter: (value: DecisionStatus | "all") => void;
	statusFilter: DecisionStatus | "all";
}) {
	return (
		<div className="flex items-center justify-between">
			<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Decisions</h1>
			<div className="flex items-center gap-2">
				<FilterSelect
					value={actionFilter}
					onChange={(value) => setActionFilter(value as DecisionAction | "all")}
					options={["all", "BUY", "SELL", "HOLD", "CLOSE"]}
					labels={["All Actions", "BUY", "SELL", "HOLD", "CLOSE"]}
				/>
				<FilterSelect
					value={statusFilter}
					onChange={(value) => setStatusFilter(value as DecisionStatus | "all")}
					options={["all", "PENDING", "APPROVED", "EXECUTED", "REJECTED", "FAILED"]}
					labels={["All Status", "Pending", "Approved", "Executed", "Rejected", "Failed"]}
				/>
			</div>
		</div>
	);
}

function FilterSelect({
	labels,
	onChange,
	options,
	value,
}: {
	labels: string[];
	onChange: (value: string) => void;
	options: string[];
	value: string;
}) {
	return (
		<select
			value={value}
			onChange={(event) => onChange(event.target.value)}
			className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
		>
			{options.map((option, index) => (
				<option key={option} value={option}>
					{labels[index] ?? option}
				</option>
			))}
		</select>
	);
}

function DecisionTimelinePanel({
	collapseAll,
	cycleGroups,
	decisionsTotal,
	expandAll,
	expandedCycles,
	isLoading,
	setCycleRef,
	toggleCycle,
}: {
	collapseAll: () => void;
	cycleGroups: CycleGroup[];
	decisionsTotal: number;
	expandAll: () => void;
	expandedCycles: Set<string>;
	isLoading: boolean;
	setCycleRef: (cycleId: string, element: HTMLDivElement | null) => void;
	toggleCycle: (cycleId: string) => void;
}) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<TimelineHeader
				cycleCount={cycleGroups.length}
				decisionsTotal={decisionsTotal}
				expandAll={expandAll}
				collapseAll={collapseAll}
			/>
			<TimelineBody
				cycleGroups={cycleGroups}
				expandedCycles={expandedCycles}
				isLoading={isLoading}
				setCycleRef={setCycleRef}
				toggleCycle={toggleCycle}
			/>
		</div>
	);
}

function TimelineHeader({
	collapseAll,
	cycleCount,
	decisionsTotal,
	expandAll,
}: {
	collapseAll: () => void;
	cycleCount: number;
	decisionsTotal: number;
	expandAll: () => void;
}) {
	return (
		<div className="p-4 border-b border-cream-200 dark:border-night-700">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						Decision Timeline
					</h2>
					{cycleCount > 0 && (
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={expandAll}
								className="text-xs text-stone-500 dark:text-night-300 hover:text-stone-700 dark:hover:text-night-100"
							>
								Expand all
							</button>
							<span className="text-cream-300 dark:text-night-600">|</span>
							<button
								type="button"
								onClick={collapseAll}
								className="text-xs text-stone-500 dark:text-night-300 hover:text-stone-700 dark:hover:text-night-100"
							>
								Collapse all
							</button>
						</div>
					)}
				</div>
				<span className="text-sm text-stone-500 dark:text-night-300">
					{decisionsTotal} decisions in {cycleCount} cycles
				</span>
			</div>
		</div>
	);
}

function TimelineBody({
	cycleGroups,
	expandedCycles,
	isLoading,
	setCycleRef,
	toggleCycle,
}: {
	cycleGroups: CycleGroup[];
	expandedCycles: Set<string>;
	isLoading: boolean;
	setCycleRef: (cycleId: string, element: HTMLDivElement | null) => void;
	toggleCycle: (cycleId: string) => void;
}) {
	if (isLoading) {
		return (
			<div className="p-4 space-y-4">
				{[1, 2, 3, 4, 5].map((item) => (
					<div key={item} className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		);
	}

	if (cycleGroups.length === 0) {
		return (
			<div className="p-8 text-center text-stone-400 dark:text-night-400">
				No decisions to display
			</div>
		);
	}

	return (
		<div className="divide-y divide-cream-100 dark:divide-night-700">
			{cycleGroups.map((group) => (
				<CycleGroupCard
					key={group.cycleId}
					ref={(element) => setCycleRef(group.cycleId, element)}
					group={group}
					isExpanded={expandedCycles.has(group.cycleId)}
					onToggle={() => toggleCycle(group.cycleId)}
				/>
			))}
		</div>
	);
}

const CycleGroupCard = forwardRef<
	HTMLDivElement,
	{
		group: CycleGroup;
		isExpanded: boolean;
		onToggle: () => void;
	}
>(function CycleGroupCard({ group, isExpanded, onToggle }, ref) {
	const actionCounts = useMemo(() => {
		const counts = { BUY: 0, SELL: 0, HOLD: 0, CLOSE: 0 };
		for (const d of group.decisions) {
			if (d.action in counts) {
				counts[d.action as keyof typeof counts]++;
			}
		}
		return counts;
	}, [group.decisions]);

	const statusCounts = useMemo(() => {
		const counts = { EXECUTED: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, FAILED: 0 };
		for (const d of group.decisions) {
			if (d.status in counts) {
				counts[d.status as keyof typeof counts]++;
			}
		}
		return counts;
	}, [group.decisions]);

	return (
		<div ref={ref}>
			<button
				type="button"
				onClick={onToggle}
				className="w-full p-4 flex items-center justify-between hover:bg-cream-50 dark:hover:bg-white/[0.02] transition-colors text-left"
			>
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<svg
							aria-hidden="true"
							className={`w-4 h-4 text-stone-400 dark:text-night-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
						<div>
							<div className="font-medium text-stone-900 dark:text-night-50">
								{format(new Date(group.timestamp), "MMM d, yyyy 'at' h:mm a")}
							</div>
							<div className="text-sm text-stone-500 dark:text-night-300">
								{formatDistanceToNow(new Date(group.timestamp), { addSuffix: true })}
							</div>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{/* Action summary badges */}
					<div className="flex items-center gap-1.5">
						{actionCounts.BUY > 0 && (
							<span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
								{actionCounts.BUY} BUY
							</span>
						)}
						{actionCounts.SELL > 0 && (
							<span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
								{actionCounts.SELL} SELL
							</span>
						)}
						{actionCounts.HOLD > 0 && (
							<span className="px-2 py-0.5 text-xs font-medium rounded bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400">
								{actionCounts.HOLD} HOLD
							</span>
						)}
						{actionCounts.CLOSE > 0 && (
							<span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
								{actionCounts.CLOSE} CLOSE
							</span>
						)}
					</div>

					{/* Status summary */}
					<div className="text-sm text-stone-500 dark:text-night-300">
						{group.decisions.length} decision{group.decisions.length !== 1 ? "s" : ""}
						{statusCounts.EXECUTED > 0 && (
							<span className="ml-1 text-green-600 dark:text-green-400">
								({statusCounts.EXECUTED} executed)
							</span>
						)}
					</div>
				</div>
			</button>

			{isExpanded && (
				<div className="border-t border-cream-100 dark:border-night-700 bg-cream-50/50 dark:bg-black/20">
					{group.decisions.map((decision) => (
						<DecisionCard key={decision.id} decision={decision} />
					))}
				</div>
			)}
		</div>
	);
});

function DecisionCard({
	decision,
}: {
	decision: {
		id: string;
		cycleId: string;
		symbol: string;
		action: DecisionAction;
		direction: string;
		size: number;
		sizeUnit: string;
		entry: number | null;
		stop: number | null;
		target: number | null;
		status: DecisionStatus;
		consensusCount: number;
		pnl: number | null;
		createdAt: string;
	};
}) {
	const actionColors = {
		BUY: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		SELL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
		HOLD: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400",
		CLOSE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	};

	const statusColors = {
		PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
		APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
		EXECUTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
		FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};

	const formatPrice = (price: number | null) =>
		price
			? new Intl.NumberFormat("en-US", {
					style: "currency",
					currency: "USD",
				}).format(price)
			: "--";

	const logoUrl = buildTickerLogoUrl(decision.symbol);

	return (
		<Link
			href={`/decisions/${decision.id}`}
			className="block p-4 hover:bg-cream-100 dark:hover:bg-white/[0.03] transition-colors"
		>
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-3">
					<span
						className={`px-2.5 py-1 text-sm font-medium rounded ${actionColors[decision.action]}`}
					>
						{decision.action}
					</span>
					<div className="flex items-center gap-2">
						<SourceLogo logoUrl={logoUrl} domain={decision.symbol} size="md" fallback="company" />
						<span className="text-lg font-semibold text-stone-900 dark:text-night-50">
							{decision.symbol}
						</span>
						<span className="text-sm text-stone-500 dark:text-night-300">{decision.direction}</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[decision.status]}`}
					>
						{decision.status}
					</span>
					<span className="text-sm text-stone-500 dark:text-night-300">
						{formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
					</span>
				</div>
			</div>

			<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
				<div>
					<span className="text-stone-500 dark:text-night-300">Size</span>
					<div className="font-medium text-stone-900 dark:text-night-50">
						{formatSize(decision.size, decision.sizeUnit)}
					</div>
				</div>
				{decision.entry && (
					<div>
						<span className="text-stone-500 dark:text-night-300">Entry</span>
						<div className="font-medium text-stone-900 dark:text-night-50">
							{formatPrice(decision.entry)}
						</div>
					</div>
				)}
				{decision.stop && (
					<div>
						<span className="text-stone-500 dark:text-night-300">Stop</span>
						<div className="font-medium text-red-600">{formatPrice(decision.stop)}</div>
					</div>
				)}
				{decision.target && (
					<div>
						<span className="text-stone-500 dark:text-night-300">Target</span>
						<div className="font-medium text-green-600">{formatPrice(decision.target)}</div>
					</div>
				)}
				<div>
					<span className="text-stone-500 dark:text-night-300">Consensus</span>
					<div className="font-medium text-stone-900 dark:text-night-50">
						{decision.consensusCount}/8 agents
					</div>
				</div>
			</div>

			{decision.pnl !== null && (
				<div className="mt-2 text-sm">
					<span className="text-stone-500 dark:text-night-300">P&L: </span>
					<span className={`font-medium ${decision.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
						{decision.pnl >= 0 ? "+" : ""}
						{formatPrice(decision.pnl)}
					</span>
				</div>
			)}
		</Link>
	);
}
