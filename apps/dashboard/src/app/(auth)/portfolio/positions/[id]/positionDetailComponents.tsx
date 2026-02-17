"use client";

import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { DecisionSummary, PositionDetail, Trade } from "@/lib/api/types";

interface PositionRiskFieldProps {
	label: string;
	valueLabel: string;
	isEditing: boolean;
	draftValue: string;
	onDraftChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
	onEdit: () => void;
	inputClassName?: string;
}

function formatPrice(price: number | null): string {
	return price
		? new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(price)
		: "--";
}

function formatPct(value: number | null): string {
	return value !== null ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}

function formatDate(value: string): string {
	const date = new Date(value);
	return `${formatDateTime(date)}\u00a0\u00b7\u00a0${format(date, "MMM d, yyyy HH:mm")}`;
}

function formatDateTime(value: Date): string {
	return formatDistanceToNow(value, { addSuffix: true });
}

export function PositionLoadingState() {
	return (
		<div className="space-y-6">
			<div className="h-8 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			<div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			<div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
		</div>
	);
}

export function PositionNotFoundState({ onBack }: { onBack: () => void }) {
	return (
		<div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
			<h2 className="text-lg font-semibold text-red-800 dark:text-red-200">Position not found</h2>
			<p className="mt-2 text-sm text-red-600 dark:text-red-300">
				The position you&apos;re looking for doesn&apos;t exist or has been closed.
			</p>
			<button
				type="button"
				onClick={onBack}
				className="mt-4 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
			>
				Back to Portfolio
			</button>
		</div>
	);
}

export function PositionHeader({
	symbol,
	side,
	onBack,
	onClose,
	isClosing,
}: {
	symbol: string;
	side: "LONG" | "SHORT";
	onBack: () => void;
	onClose: () => void;
	isClosing: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<button
					type="button"
					onClick={onBack}
					className="p-2 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
					aria-label="Go back"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fillRule="evenodd"
							d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">{symbol}</h1>
					<span
						className={`px-3 py-1 text-sm font-medium rounded ${
							side === "LONG"
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
						}`}
					>
						{side}
					</span>
				</div>
			</div>
			<button
				type="button"
				onClick={onClose}
				disabled={isClosing}
				className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
			>
				{isClosing ? "Closing..." : "Close Position"}
			</button>
		</div>
	);
}

export function PositionRiskField({
	label,
	valueLabel,
	isEditing,
	draftValue,
	onDraftChange,
	onSave,
	onCancel,
	onEdit,
	inputClassName,
}: PositionRiskFieldProps) {
	return (
		<div className="flex items-center justify-between">
			<div>
				<span className="text-sm text-stone-500 dark:text-night-300">{label}</span>
				{isEditing ? (
					<div className="flex items-center gap-2 mt-1">
						<input
							type="number"
							value={draftValue}
							onChange={(e) => onDraftChange(e.target.value)}
							className={`w-24 px-2 py-1 text-sm border border-cream-200 dark:border-night-600 rounded bg-white dark:bg-night-700 text-stone-900 dark:text-night-50 ${inputClassName ?? ""}`}
							placeholder="0.00"
						/>
						<button
							type="button"
							onClick={onSave}
							className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded"
						>
							Save
						</button>
						<button
							type="button"
							onClick={onCancel}
							className="px-2 py-1 text-xs bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400 rounded"
						>
							Cancel
						</button>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{valueLabel}
						</div>
						<button
							type="button"
							onClick={onEdit}
							className="text-xs text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
						>
							Edit
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

export function PositionDetailRows({ position }: { position: PositionDetail }) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
			<div>
				<span className="text-sm text-stone-500 dark:text-night-300">Quantity</span>
				<div className="text-lg font-medium text-stone-900 dark:text-night-50">
					{position.qty} shares
				</div>
			</div>
			<div>
				<span className="text-sm text-stone-500 dark:text-night-300">Avg Entry</span>
				<div className="text-lg font-medium text-stone-900 dark:text-night-50">
					{formatPrice(position.avgEntry)}
				</div>
			</div>
			<div>
				<span className="text-sm text-stone-500 dark:text-night-300">Current Price</span>
				<div className="text-lg font-medium text-stone-900 dark:text-night-50">
					{formatPrice(position.currentPrice)}
				</div>
			</div>
			<div>
				<span className="text-sm text-stone-500 dark:text-night-300">Market Value</span>
				<div className="text-lg font-medium text-stone-900 dark:text-night-50">
					{formatPrice(position.marketValue)}
				</div>
			</div>
		</div>
	);
}

export function PositionStats({ position }: { position: PositionDetail }) {
	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">
				Profit &amp; Loss
			</h3>
			<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Unrealized P&L</span>
					<div
						className={`text-xl font-semibold ${
							(position.unrealizedPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"
						}`}
					>
						{(position.unrealizedPnl ?? 0) >= 0 ? "+" : ""}
						{formatPrice(position.unrealizedPnl)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">P&L %</span>
					<div
						className={`text-xl font-semibold ${
							(position.unrealizedPnlPct ?? 0) >= 0 ? "text-green-600" : "text-red-600"
						}`}
					>
						{formatPct(position.unrealizedPnlPct)}
					</div>
				</div>
				<div>
					<span className="text-sm text-stone-500 dark:text-night-300">Days Held</span>
					<div className="text-xl font-semibold text-stone-900 dark:text-night-50">
						{position.daysHeld} days
					</div>
				</div>
			</div>
		</div>
	);
}

export function PositionRiskPanel({
	position,
	isEditingStop,
	isEditingTarget,
	stopValue,
	targetValue,
	onStopValueChange,
	onTargetValueChange,
	onSaveStop,
	onSaveTarget,
	onOpenStop,
	onOpenTarget,
	onCancelStop,
	onCancelTarget,
}: {
	position: PositionDetail;
	isEditingStop: boolean;
	isEditingTarget: boolean;
	stopValue: string;
	targetValue: string;
	onStopValueChange: (value: string) => void;
	onTargetValueChange: (value: string) => void;
	onSaveStop: () => void;
	onSaveTarget: () => void;
	onOpenStop: () => void;
	onOpenTarget: () => void;
	onCancelStop: () => void;
	onCancelTarget: () => void;
}) {
	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Risk Levels</h3>
			<div className="grid grid-cols-2 gap-6">
				<div>
					<PositionRiskField
						label="Stop Loss"
						valueLabel={formatPrice(position.stop)}
						isEditing={isEditingStop}
						draftValue={stopValue}
						onDraftChange={onStopValueChange}
						onSave={onSaveStop}
						onCancel={onCancelStop}
						onEdit={onOpenStop}
						inputClassName="text-red-600"
					/>
				</div>
				<div>
					<PositionRiskField
						label="Take Profit"
						valueLabel={formatPrice(position.target)}
						isEditing={isEditingTarget}
						draftValue={targetValue}
						onDraftChange={onTargetValueChange}
						onSave={onSaveTarget}
						onCancel={onCancelTarget}
						onEdit={onOpenTarget}
						inputClassName="text-green-600"
					/>
				</div>
			</div>
		</div>
	);
}

export function PositionRelatedThesis({ thesis }: { thesis: PositionDetail["thesis"] }) {
	if (!thesis) {
		return null;
	}

	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-2">Related Thesis</h3>
			<Link
				href={`/theses/${thesis.id}`}
				className="inline-flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-night-700 rounded-md text-sm text-stone-700 dark:text-night-100 hover:bg-cream-100 dark:hover:bg-night-600"
			>
				<span className="font-medium">{thesis.symbol}</span>
				<span>&ndash;</span>
				<span>{thesis.title}</span>
			</Link>
		</div>
	);
}

export function PositionOpenedTime({ openedAt }: { openedAt: string }) {
	return (
		<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
			<div className="text-sm text-stone-500 dark:text-night-300">
				Opened {formatDistanceToNow(new Date(openedAt), { addSuffix: true })} &bull;{" "}
				{formatDate(openedAt)}
			</div>
		</div>
	);
}

interface PositionDetailContentProps {
	position: PositionDetail;
	onBack: () => void;
	onClose: () => void;
	isClosing: boolean;
	isEditingStop: boolean;
	isEditingTarget: boolean;
	stopValue: string;
	targetValue: string;
	onStopValueChange: (value: string) => void;
	onTargetValueChange: (value: string) => void;
	onSaveStop: () => void;
	onSaveTarget: () => void;
	onOpenStop: () => void;
	onOpenTarget: () => void;
	onCancelStop: () => void;
	onCancelTarget: () => void;
}

export function TradeHistoryPanel({ trades }: { trades: Trade[] }) {
	if (trades.length === 0) {
		return null;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Trade History ({trades.length})
			</h2>
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead className="bg-cream-50 dark:bg-night-700">
						<tr className="text-left text-sm text-stone-500 dark:text-night-300">
							<th className="px-4 py-3 font-medium">Time</th>
							<th className="px-4 py-3 font-medium">Side</th>
							<th className="px-4 py-3 font-medium text-right">Qty</th>
							<th className="px-4 py-3 font-medium text-right">Price</th>
							<th className="px-4 py-3 font-medium text-right">P&L</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-cream-100 dark:divide-night-700">
						{trades.map((trade) => (
							<TradeRow key={trade.id} trade={trade} />
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export function DecisionsPanel({ decisions }: { decisions: DecisionSummary[] }) {
	if (decisions.length === 0) {
		return null;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Related Decisions ({decisions.length})
			</h2>
			<div className="space-y-2">
				{decisions.map((decision) => (
					<DecisionLink key={decision.id} decision={decision} />
				))}
			</div>
		</div>
	);
}

export function PositionDetailContent({
	position,
	onBack,
	onClose,
	isClosing,
	isEditingStop,
	isEditingTarget,
	stopValue,
	targetValue,
	onStopValueChange,
	onTargetValueChange,
	onSaveStop,
	onSaveTarget,
	onOpenStop,
	onOpenTarget,
	onCancelStop,
	onCancelTarget,
}: PositionDetailContentProps) {
	return (
		<div className="space-y-6">
			<PositionHeader
				symbol={position.symbol}
				side={position.side}
				onBack={onBack}
				onClose={onClose}
				isClosing={isClosing}
			/>
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
					Position Details
				</h2>
				<PositionDetailRows position={position} />
				<PositionStats position={position} />
				<PositionRiskPanel
					position={position}
					isEditingStop={isEditingStop}
					isEditingTarget={isEditingTarget}
					stopValue={stopValue}
					targetValue={targetValue}
					onStopValueChange={onStopValueChange}
					onTargetValueChange={onTargetValueChange}
					onSaveStop={onSaveStop}
					onSaveTarget={onSaveTarget}
					onOpenStop={onOpenStop}
					onOpenTarget={onOpenTarget}
					onCancelStop={onCancelStop}
					onCancelTarget={onCancelTarget}
				/>
				<PositionRelatedThesis thesis={position.thesis} />
				<PositionOpenedTime openedAt={position.openedAt} />
			</div>
			<TradeHistoryPanel trades={position.trades ?? []} />
			<DecisionsPanel decisions={position.relatedDecisions ?? []} />
		</div>
	);
}

function TradeRow({ trade }: { trade: Trade }) {
	const rowPrice = (price: number) =>
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(price);

	return (
		<tr className="text-sm">
			<td className="px-4 py-3 text-stone-500 dark:text-night-300">
				{format(new Date(trade.timestamp), "MMM d, yyyy HH:mm:ss")}
			</td>
			<td className="px-4 py-3">
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${
						trade.side === "BUY"
							? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
							: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
					}`}
				>
					{trade.side}
				</span>
			</td>
			<td className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50">
				{trade.qty}
			</td>
			<td className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50">
				{rowPrice(trade.price)}
			</td>
			<td
				className={`px-4 py-3 text-right font-mono ${
					trade.pnl === null
						? "text-stone-400 dark:text-night-400"
						: trade.pnl >= 0
							? "text-green-600"
							: "text-red-600"
				}`}
			>
				{trade.pnl !== null ? (
					<>
						{trade.pnl >= 0 ? "+" : ""}
						{rowPrice(trade.pnl)}
					</>
				) : (
					"--"
				)}
			</td>
		</tr>
	);
}

export function DecisionLink({ decision }: { decision: DecisionSummary }) {
	const statusColors: Record<string, string> = {
		PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
		APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
		EXECUTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
		FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};

	const actionColors: Record<string, string> = {
		BUY: "text-green-600",
		SELL: "text-red-600",
		HOLD: "text-stone-600 dark:text-night-200",
		CLOSE: "text-amber-600",
	};

	return (
		<Link
			href={`/decisions/${decision.id}`}
			className="flex items-center justify-between p-3 bg-cream-50 dark:bg-night-700 rounded-lg hover:bg-cream-100 dark:hover:bg-night-600"
		>
			<div className="flex items-center gap-3">
				<span
					className={`font-medium ${actionColors[decision.action] || "text-stone-600 dark:text-night-200"}`}
				>
					{decision.action}
				</span>
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[decision.status] || ""}`}
				>
					{decision.status}
				</span>
			</div>
			<span className="text-sm text-stone-500 dark:text-night-300">
				{formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
			</span>
		</Link>
	);
}
