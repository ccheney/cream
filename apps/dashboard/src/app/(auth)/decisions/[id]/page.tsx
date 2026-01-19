"use client";

/**
 * Decision Detail Page
 *
 * Shows complete decision information including:
 * - Decision header with symbol, action, status
 * - Agent votes grid with confidence scores
 * - Citations list with expandable sources
 * - Execution timeline
 * - Related thesis link
 */

import { useParams, useRouter } from "next/navigation";
import { useDecisionDetail } from "@/hooks/queries";
import {
	AgentVotesGrid,
	ApprovalSection,
	CitationsSection,
	DecisionDetails,
	DecisionHeader,
	ErrorState,
	ExecutionSection,
	LoadingState,
} from "./components/index";

export default function DecisionDetailPage(): React.ReactElement {
	const params = useParams();
	const router = useRouter();
	const id = params.id as string;

	const { data: decision, isLoading, error } = useDecisionDetail(id);

	if (isLoading) {
		return <LoadingState />;
	}

	if (error || !decision) {
		return <ErrorState onNavigateBack={() => router.push("/decisions")} />;
	}

	return (
		<div className="space-y-6">
			<DecisionHeader decision={decision} onBack={() => router.back()} />
			<DecisionDetails decision={decision} />
			<ApprovalSection
				riskApproval={decision.riskApproval}
				criticApproval={decision.criticApproval}
			/>
			<AgentVotesGrid outputs={decision.agentOutputs} />
			<CitationsSection citations={decision.citations} />
			<ExecutionSection execution={decision.execution} />
		</div>
	);
}
