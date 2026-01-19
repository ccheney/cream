"use client";

import { SourceLogo } from "@/components/ui/source-logo";
import type { DecisionDetail } from "@/lib/api/types";
import { buildTickerLogoUrl } from "@/lib/config";
import { BackButton } from "./BackButton";
import { actionColors, statusColors } from "./utils";

export interface DecisionHeaderProps {
	decision: DecisionDetail;
	onBack: () => void;
}

export function DecisionHeader({ decision, onBack }: DecisionHeaderProps): React.ReactElement {
	const logoUrl = buildTickerLogoUrl(decision.symbol);

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<BackButton onClick={onBack} />
				<div className="flex items-center gap-3">
					<span
						className={`px-3 py-1.5 text-sm font-medium rounded ${actionColors[decision.action]}`}
					>
						{decision.action}
					</span>
					<SourceLogo logoUrl={logoUrl} domain={decision.symbol} size="lg" fallback="company" />
					<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
						{decision.symbol}
					</h1>
					<span className="text-lg text-stone-500 dark:text-night-300">{decision.direction}</span>
				</div>
			</div>
			<span className={`px-3 py-1.5 text-sm font-medium rounded ${statusColors[decision.status]}`}>
				{decision.status}
			</span>
		</div>
	);
}
