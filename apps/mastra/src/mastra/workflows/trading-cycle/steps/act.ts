/**
 * Act Step
 *
 * Eighth and final step in the OODA trading cycle. Submits approved orders
 * and returns the final workflow result.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import {
	ApprovalSchema,
	DecisionPlanSchema,
	type ThesisUpdateSchema,
	WorkflowResultSchema,
} from "../schemas.js";

// ============================================
// Schemas
// ============================================

const ActInputSchema = z.object({
	cycleId: z.string().describe("Unique identifier for this trading cycle"),
	approved: z.boolean().describe("Whether the decision plan was approved"),
	iterations: z.number().describe("Number of consensus iterations"),
	decisionPlan: DecisionPlanSchema.optional().describe("Decision plan from trader step"),
	riskApproval: ApprovalSchema.optional().describe("Risk manager approval"),
	criticApproval: ApprovalSchema.optional().describe("Critic approval"),
	mode: z.enum(["STUB", "LLM"]).optional().describe("Execution mode"),
});

// ============================================
// Step Definition
// ============================================

export const actStep = createStep({
	id: "act-execute",
	description: "Submit orders and finalize workflow result",
	inputSchema: ActInputSchema,
	outputSchema: WorkflowResultSchema,
	execute: async ({ inputData }) => {
		const { cycleId, approved, iterations, decisionPlan, riskApproval, criticApproval, mode } =
			inputData;

		let orderSubmission = {
			submitted: false,
			orderIds: [] as string[],
			errors: [] as string[],
		};

		const thesisUpdates: z.infer<typeof ThesisUpdateSchema>[] = [];

		if (approved && decisionPlan) {
			const constraintCheck = await checkConstraints(decisionPlan);

			if (constraintCheck.passed) {
				orderSubmission = await submitOrders(cycleId, decisionPlan);

				for (const decision of decisionPlan.decisions) {
					thesisUpdates.push({
						thesisId: `thesis-${decision.instrumentId}`,
						instrumentId: decision.instrumentId,
						fromState: null,
						toState: decision.thesisState,
						action: decision.action,
						reason: decision.rationale.summary,
					});
				}
			} else {
				orderSubmission.errors = constraintCheck.violations;
			}
		}

		return {
			cycleId,
			approved,
			iterations,
			orderSubmission,
			decisionPlan,
			riskApproval,
			criticApproval,
			mode: mode ?? "STUB",
			configVersion: null,
			thesisUpdates: thesisUpdates.length > 0 ? thesisUpdates : undefined,
			thesisMemoryIngestion: undefined,
		};
	},
});

// ============================================
// Helper Functions
// ============================================

interface ConstraintCheckResult {
	passed: boolean;
	violations: string[];
}

async function checkConstraints(
	decisionPlan: z.infer<typeof DecisionPlanSchema>,
): Promise<ConstraintCheckResult> {
	const violations: string[] = [];

	for (const decision of decisionPlan.decisions) {
		if (decision.action === "BUY" && !decision.stopLoss) {
			violations.push(`${decision.instrumentId}: Buy order missing stop loss`);
		}

		if (decision.confidence < 0.3) {
			violations.push(`${decision.instrumentId}: Confidence too low (${decision.confidence})`);
		}
	}

	return {
		passed: violations.length === 0,
		violations,
	};
}

interface OrderSubmissionResult {
	submitted: boolean;
	orderIds: string[];
	errors: string[];
}

async function submitOrders(
	cycleId: string,
	decisionPlan: z.infer<typeof DecisionPlanSchema>,
): Promise<OrderSubmissionResult> {
	const orderIds: string[] = [];
	const errors: string[] = [];

	for (const decision of decisionPlan.decisions) {
		if (decision.action === "HOLD") {
			continue;
		}

		try {
			const orderId = `${cycleId}-${decision.instrumentId}-${Date.now()}`;
			orderIds.push(orderId);
		} catch (err) {
			errors.push(
				`Failed to submit order for ${decision.instrumentId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return {
		submitted: orderIds.length > 0,
		orderIds,
		errors,
	};
}
