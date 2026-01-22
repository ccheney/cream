/**
 * OptionsChainRow Component
 *
 * Single row in the options chain table showing call and put at same strike.
 * Supports flash animations on quote updates and hover for greeks.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { memo, useCallback, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { usePriceFlash } from "@/components/ui/use-price-flash";
import type { OptionsContract } from "@/lib/api/types";

export interface OptionsChainRowProps {
	strike: number;
	call: OptionsContract | null;
	put: OptionsContract | null;
	isAtm: boolean;
	underlyingPrice: number | null;
	previousCallPrice?: number;
	previousPutPrice?: number;
	onContractClick?: (contract: OptionsContract, type: "call" | "put") => void;
	"data-testid"?: string;
}

function formatPrice(value: number | string | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}
	const num = typeof value === "string" ? Number.parseFloat(value) : value;
	if (Number.isNaN(num)) {
		return "—";
	}
	return num.toFixed(2);
}

function formatVolume(value: number | string | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}
	const num = typeof value === "string" ? Number.parseFloat(value) : value;
	if (Number.isNaN(num)) {
		return "—";
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
}

function formatOI(value: number | string | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}
	const num = typeof value === "string" ? Number.parseFloat(value) : value;
	if (Number.isNaN(num)) {
		return "—";
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
}

interface ContractCellProps {
	contract: OptionsContract | null;
	type: "call" | "put";
	previousPrice?: number;
	onClick?: (contract: OptionsContract, type: "call" | "put") => void;
	isAtm: boolean;
}

const ContractCell = memo(function ContractCell({
	contract,
	type,
	previousPrice,
	onClick,
	isAtm,
}: ContractCellProps) {
	const [isHovered, setIsHovered] = useState(false);
	const { flash } = usePriceFlash(contract?.last ?? 0, previousPrice);

	const handleClick = useCallback(() => {
		if (contract && onClick) {
			onClick(contract, type);
		}
	}, [contract, type, onClick]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if ((e.key === "Enter" || e.key === " ") && contract && onClick) {
				e.preventDefault();
				onClick(contract, type);
			}
		},
		[contract, type, onClick],
	);

	if (!contract) {
		return (
			<div className="flex items-center justify-center px-2 py-1.5 text-cream-300 dark:text-night-600">
				—
			</div>
		);
	}

	const flashClasses = flash.isFlashing
		? flash.direction === "up"
			? "animate-flash-profit"
			: "animate-flash-loss"
		: "";

	const itmClass =
		type === "call" ? "bg-green-50/50 dark:bg-green-900/20" : "bg-red-50/50 dark:bg-red-900/20";

	return (
		// biome-ignore lint/a11y/useSemanticElements: Options chain cell with complex hover state and click behavior
		<div
			className={`
        grid grid-cols-5 gap-1 px-2 py-1.5 text-xs font-mono
        cursor-pointer transition-colors duration-150
        hover:bg-cream-100 dark:hover:bg-night-700
        ${isAtm ? itmClass : ""}
        ${flashClasses}
      `}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			role="button"
			tabIndex={0}
			aria-label={`${type} option at strike, bid ${formatPrice(contract.bid)}, ask ${formatPrice(contract.ask)}`}
		>
			<span className="text-right text-green-600 dark:text-green-400">
				{formatPrice(contract.bid)}
			</span>

			<span className="text-right text-red-600 dark:text-red-400">{formatPrice(contract.ask)}</span>

			<span className="text-right text-stone-700 dark:text-night-200">
				{contract.last !== null ? (
					<AnimatedNumber value={contract.last} format="decimal" decimals={2} />
				) : (
					"—"
				)}
			</span>

			<span className="text-right text-stone-500 dark:text-night-300">
				{formatVolume(contract.volume)}
			</span>

			<span className="text-right text-stone-500 dark:text-night-300">
				{formatOI(contract.openInterest)}
			</span>

			{isHovered && (
				<span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
			)}
		</div>
	);
});

export const OptionsChainRow = memo(function OptionsChainRow({
	strike,
	call,
	put,
	isAtm,
	underlyingPrice,
	previousCallPrice,
	previousPutPrice,
	onContractClick,
	"data-testid": testId,
}: OptionsChainRowProps) {
	const callItm = underlyingPrice !== null && strike < underlyingPrice;
	const putItm = underlyingPrice !== null && strike > underlyingPrice;

	return (
		<div
			className={`
        grid grid-cols-[1fr_auto_1fr] items-center
        border-b border-cream-100 dark:border-night-700
        ${isAtm ? "bg-primary/10 dark:bg-primary/20" : ""}
      `}
			data-testid={testId}
		>
			<div className={callItm && !isAtm ? "bg-green-50/30 dark:bg-green-900/10" : ""}>
				<ContractCell
					contract={call}
					type="call"
					previousPrice={previousCallPrice}
					onClick={onContractClick}
					isAtm={isAtm}
				/>
			</div>

			<div
				className={`
          px-4 py-1.5 min-w-[80px] text-center font-mono text-sm font-semibold
          border-x border-cream-200 dark:border-night-600
          ${
						isAtm
							? "bg-primary text-white"
							: "bg-cream-50 dark:bg-night-800 text-stone-700 dark:text-night-200"
					}
        `}
			>
				{isAtm && <span className="mr-1 text-xs">★</span>}
				{formatPrice(strike)}
			</div>

			<div className={putItm && !isAtm ? "bg-red-50/30 dark:bg-red-900/10" : ""}>
				<ContractCell
					contract={put}
					type="put"
					previousPrice={previousPutPrice}
					onClick={onContractClick}
					isAtm={isAtm}
				/>
			</div>
		</div>
	);
});

export default OptionsChainRow;
