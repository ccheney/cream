import type React from "react";
import type { StoreCyclePhase } from "../types";
import { OODAPhaseCard } from "./OODAPhaseCard";

interface OODAPhaseGridProps {
	currentPhase: StoreCyclePhase | undefined;
	isRunning: boolean;
	isLoading: boolean;
}

const PHASES = ["Observe", "Orient", "Decide", "Act"] as const;

export function OODAPhaseGrid({
	currentPhase,
	isRunning,
	isLoading,
}: OODAPhaseGridProps): React.JSX.Element {
	return (
		<div className="grid grid-cols-4 gap-4 mt-6">
			{PHASES.map((phase) => (
				<OODAPhaseCard
					key={phase}
					phase={phase}
					currentPhase={currentPhase}
					isRunning={isRunning}
					isLoading={isLoading}
				/>
			))}
		</div>
	);
}
