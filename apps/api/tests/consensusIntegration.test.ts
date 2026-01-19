/**
 * Consensus Loop Integration Tests
 *
 * Tests the full consensus loop flow as it integrates with the trading cycle,
 * including:
 * - Agent approval flow with realistic agent outputs
 * - Plan revision based on rejection feedback
 * - Timeout handling with mock async operations
 * - Multi-iteration consensus reaching
 * - Integration with trading cycle context
 */

import { describe, expect, it } from "bun:test";
import type { CriticOutput, DecisionPlan, RiskManagerOutput } from "@cream/agents";
import {
	ConsensusGate,
	type ConsensusResult,
	createApprovedCriticOutput,
	createApprovedRiskOutput,
	runConsensusLoop,
} from "@cream/agents";

// ============================================
// Test Fixtures - Realistic Trading Plans
// ============================================

function createRealisticTradingPlan(options?: {
	cycleId?: string;
	symbol?: string;
	action?: "BUY" | "SELL" | "HOLD" | "CLOSE";
	positionSizePct?: number;
}): DecisionPlan {
	const {
		cycleId = `cycle-${Date.now()}`,
		symbol = "AAPL",
		action = "BUY",
		positionSizePct = 5,
	} = options ?? {};

	return {
		cycleId,
		timestamp: new Date().toISOString(),
		decisions: [
			{
				decisionId: `dec-${symbol.toLowerCase()}-${Date.now()}`,
				instrumentId: symbol,
				action,
				direction: action === "SELL" || action === "CLOSE" ? "SHORT" : "LONG",
				size: { value: positionSizePct, unit: "PCT_EQUITY" },
				stopLoss: { price: 170, type: "FIXED" },
				takeProfit: { price: 195 },
				strategyFamily: "EQUITY_LONG",
				timeHorizon: "SWING",
				rationale: {
					summary: `${action} ${symbol} based on technical breakout`,
					bullishFactors: [
						"Price above 20-day SMA",
						"RSI at 55 (neutral with momentum)",
						"Volume confirming breakout",
					],
					bearishFactors: ["Approaching resistance at 185"],
					decisionLogic: "Weight of evidence favors entry with defined risk parameters",
					memoryReferences: ["mem-similar-setup-001"],
				},
				thesisState: action === "BUY" ? "ENTERED" : "MANAGING",
			},
		],
		portfolioNotes: `Initiating ${action} position in ${symbol}`,
	};
}

// ============================================
// Mock Agent Functions (Simulating Real Agents)
// ============================================

interface MockAgentConfig {
	riskApproves: boolean;
	criticApproves: boolean;
	riskDelay?: number;
	criticDelay?: number;
	riskViolations?: RiskManagerOutput["violations"];
}

function createMockApprovalFunction(config: MockAgentConfig) {
	return async (
		_plan: DecisionPlan
	): Promise<{ riskManager: RiskManagerOutput; critic: CriticOutput }> => {
		// Simulate async agent execution
		if (config.riskDelay) {
			await new Promise((resolve) => setTimeout(resolve, config.riskDelay));
		}
		if (config.criticDelay) {
			await new Promise((resolve) => setTimeout(resolve, config.criticDelay));
		}

		const riskManager: RiskManagerOutput = config.riskApproves
			? createApprovedRiskOutput("All risk parameters within limits")
			: {
					verdict: "REJECT",
					violations: config.riskViolations ?? [
						{
							constraint: "max_position_pct",
							current_value: 15,
							limit: 10,
							severity: "CRITICAL",
							affected_decisions: ["dec-1"],
						},
					],
					required_changes: [
						{
							decisionId: "dec-1",
							change: "Reduce position size to comply with limits",
							reason: "Position size exceeds maximum allowed",
						},
					],
					risk_notes: "Position sizing violation detected",
				};

		const critic: CriticOutput = config.criticApproves
			? createApprovedCriticOutput()
			: {
					verdict: "REJECT",
					violations: [
						{
							constraint: "rationale_consistency",
							current_value: "Only bullish factors listed",
							limit: "Bearish signals acknowledged",
							severity: "WARNING",
							affected_decisions: ["dec-1"],
						},
					],
					required_changes: [
						{
							decisionId: "dec-1",
							change: "Add risk-reward analysis to rationale",
							reason: "Missing risk-reward calculation",
						},
					],
					notes: "Rationale doesn't match market conditions",
				};

		return { riskManager, critic };
	};
}

function createMockRevisionFunction(improvements: string[] = []) {
	let revisionCount = 0;

	return async (plan: DecisionPlan, rejectionReasons: string[]): Promise<DecisionPlan> => {
		revisionCount++;

		// Create revised plan with updated rationale
		const revisedPlan: DecisionPlan = {
			...plan,
			decisions: plan.decisions.map((decision) => ({
				...decision,
				rationale: {
					...decision.rationale,
					summary: `${decision.rationale.summary} [Revised ${revisionCount}x: ${rejectionReasons.slice(0, 2).join(", ")}]`,
					decisionLogic: improvements[revisionCount - 1] ?? decision.rationale.decisionLogic,
				},
				// Reduce position size if that was the issue
				size: rejectionReasons.some((r) => r.includes("position"))
					? { value: Math.max(1, decision.size.value - 2), unit: decision.size.unit }
					: decision.size,
			})),
			portfolioNotes: `${plan.portfolioNotes} [Revision ${revisionCount}]`,
		};

		return revisedPlan;
	};
}

// ============================================
// Integration Tests
// ============================================

describe("Consensus Loop Integration", () => {
	describe("Happy Path - Immediate Approval", () => {
		it("should approve plan when both agents approve on first try", async () => {
			const gate = new ConsensusGate({ logRejections: false });
			const plan = createRealisticTradingPlan({ symbol: "MSFT" });

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.iterations).toBe(1);
			expect(result.plan.decisions).toHaveLength(1);
			expect(result.plan.decisions[0]?.instrumentId).toBe("MSFT");
			expect(result.rejectionReasons).toHaveLength(0);
		});

		it("should preserve original plan when approved", async () => {
			const gate = new ConsensusGate({ logRejections: false });
			const originalPlan = createRealisticTradingPlan({
				symbol: "GOOGL",
				positionSizePct: 7,
			});

			const result = await runConsensusLoop(
				gate,
				originalPlan,
				createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.plan.decisions[0]?.size.value).toBe(7);
			expect(result.plan.decisions[0]?.instrumentId).toBe("GOOGL");
		});
	});

	describe("Revision Flow - Risk Manager Rejection", () => {
		it("should revise and retry when risk manager rejects", async () => {
			const gate = new ConsensusGate({ maxIterations: 3, logRejections: false });
			// Start at 12% so after 1 revision (reducing by 2) it becomes 10% and gets approved
			const plan = createRealisticTradingPlan({ positionSizePct: 12 });
			let callCount = 0;

			const result = await runConsensusLoop(
				gate,
				plan,
				async (currentPlan) => {
					callCount++;
					// Approve after position size is reduced below 10%
					const positionSize = currentPlan.decisions[0]?.size.value ?? 15;
					const riskApproves = positionSize <= 10;

					return {
						riskManager: riskApproves
							? createApprovedRiskOutput()
							: {
									verdict: "REJECT",
									violations: [
										{
											constraint: "max_position_pct",
											current_value: positionSize,
											limit: 10,
											severity: "CRITICAL",
											affected_decisions: ["dec-1"],
										},
									],
									required_changes: [
										{
											decisionId: "dec-1",
											change: "Reduce position size",
											reason: "Exceeds 10% limit",
										},
									],
									risk_notes: `Position at ${positionSize}%, max is 10%`,
								},
						critic: createApprovedCriticOutput(),
					};
				},
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.iterations).toBeGreaterThan(1);
			expect(callCount).toBeGreaterThan(1);
			// Position size should have been reduced
			expect(result.plan.decisions[0]?.size.value).toBeLessThanOrEqual(10);
		});

		it("should include revision history in plan notes", async () => {
			const gate = new ConsensusGate({ maxIterations: 3, logRejections: false });
			const plan = createRealisticTradingPlan();
			let approveOnSecond = false;

			const result = await runConsensusLoop(
				gate,
				plan,
				async () => {
					const shouldApprove = approveOnSecond;
					approveOnSecond = true;
					return {
						riskManager: shouldApprove
							? createApprovedRiskOutput()
							: {
									verdict: "REJECT",
									violations: [],
									required_changes: [],
									risk_notes: "Initial rejection",
								},
						critic: createApprovedCriticOutput(),
					};
				},
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.plan.portfolioNotes).toContain("Revision");
		});
	});

	describe("Revision Flow - Critic Rejection", () => {
		it("should revise when critic finds inconsistencies", async () => {
			const gate = new ConsensusGate({ maxIterations: 3, logRejections: false });
			const plan = createRealisticTradingPlan();
			let callCount = 0;

			const result = await runConsensusLoop(
				gate,
				plan,
				async () => {
					callCount++;
					// Critic approves on second try
					return {
						riskManager: createApprovedRiskOutput(),
						critic:
							callCount > 1
								? createApprovedCriticOutput()
								: {
										verdict: "REJECT",
										violations: [
											{
												constraint: "risk_reward_ratio",
												current_value: "Not specified",
												limit: "3:1 minimum",
												severity: "WARNING",
												affected_decisions: ["dec-1"],
											},
										],
										required_changes: [
											{
												decisionId: "dec-1",
												change: "Add explicit risk-reward calculation",
												reason: "Missing risk-reward ratio",
											},
										],
										notes: "Missing risk-reward ratio documentation",
									},
					};
				},
				createMockRevisionFunction(["Added risk-reward analysis: 3:1 based on stop/target"])
			);

			expect(result.approved).toBe(true);
			expect(result.iterations).toBe(2);
		});
	});

	describe("Max Iterations - NO_TRADE Fallback", () => {
		it("should return NO_TRADE after max iterations exceeded", async () => {
			const gate = new ConsensusGate({ maxIterations: 2, logRejections: false });
			const plan = createRealisticTradingPlan({ symbol: "NVDA" });

			const result = await runConsensusLoop(
				gate,
				plan,
				// Always reject
				createMockApprovalFunction({ riskApproves: false, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(false);
			expect(result.iterations).toBe(2);
			expect(result.plan.decisions).toHaveLength(0);
			expect(result.plan.portfolioNotes).toContain("NO_TRADE");
		});

		it("should preserve cycle ID in NO_TRADE plan", async () => {
			const cycleId = "cycle-integration-test-123";
			const gate = new ConsensusGate({ maxIterations: 1, logRejections: false });
			const plan = createRealisticTradingPlan({ cycleId });

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: false, criticApproves: false }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(false);
			expect(result.plan.cycleId).toBe(cycleId);
		});

		it("should collect all rejection reasons across iterations", async () => {
			const gate = new ConsensusGate({ maxIterations: 2, logRejections: false });
			const plan = createRealisticTradingPlan();

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({
					riskApproves: false,
					criticApproves: false,
					riskViolations: [
						{
							constraint: "concentration",
							current_value: "50%",
							limit: "30%",
							severity: "WARNING",
							affected_decisions: ["dec-1"],
						},
					],
				}),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(false);
			expect(result.rejectionReasons.length).toBeGreaterThan(0);
		});
	});

	describe("Dual Rejection Handling", () => {
		it("should handle both agents rejecting simultaneously", async () => {
			const gate = new ConsensusGate({ maxIterations: 3, logRejections: false });
			const plan = createRealisticTradingPlan();
			let iteration = 0;

			const result = await runConsensusLoop(
				gate,
				plan,
				async () => {
					iteration++;
					// Both approve on third try
					const approve = iteration >= 3;
					return {
						riskManager: approve
							? createApprovedRiskOutput()
							: {
									verdict: "REJECT",
									violations: [
										{
											constraint: "volatility",
											current_value: "high",
											limit: "normal",
											severity: "WARNING",
											affected_decisions: ["dec-1"],
										},
									],
									required_changes: [],
									risk_notes: "High volatility period",
								},
						critic: approve
							? createApprovedCriticOutput()
							: {
									verdict: "REJECT",
									violations: [
										{
											constraint: "volatility_acknowledgment",
											current_value: "Not acknowledged",
											limit: "Must acknowledge volatility",
											severity: "WARNING",
											affected_decisions: ["dec-1"],
										},
									],
									required_changes: [],
									notes: "Missing volatility acknowledgment",
								},
					};
				},
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.iterations).toBe(3);
		});
	});

	describe("Timeout Handling", () => {
		it("should treat slow agent as rejection", async () => {
			const gate = new ConsensusGate({
				maxIterations: 2,
				logRejections: false,
				timeout: { perAgentMs: 10, totalMs: 5000 },
			});
			const plan = createRealisticTradingPlan();

			const result = await runConsensusLoop(
				gate,
				plan,
				// Simulate slow agent that takes longer than timeout
				createMockApprovalFunction({
					riskApproves: true,
					criticApproves: true,
					riskDelay: 50, // Takes 50ms but timeout is 10ms
				}),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(false);
			expect(result.plan.portfolioNotes).toContain("NO_TRADE");
		});
	});

	describe("Multi-Decision Plans", () => {
		it("should handle plans with multiple decisions", async () => {
			const gate = new ConsensusGate({ logRejections: false });
			const plan: DecisionPlan = {
				cycleId: "multi-decision-cycle",
				timestamp: new Date().toISOString(),
				decisions: [
					{
						decisionId: "dec-aapl",
						instrumentId: "AAPL",
						action: "BUY",
						direction: "LONG",
						size: { value: 3, unit: "PCT_EQUITY" },
						stopLoss: { price: 170, type: "FIXED" },
						takeProfit: { price: 195 },
						strategyFamily: "EQUITY_LONG",
						timeHorizon: "SWING",
						rationale: {
							summary: "Buy AAPL",
							bullishFactors: ["Uptrend"],
							bearishFactors: [],
							decisionLogic: "Entry",
							memoryReferences: [],
						},
						thesisState: "ENTERED",
					},
					{
						decisionId: "dec-msft",
						instrumentId: "MSFT",
						action: "HOLD",
						direction: "LONG",
						size: { value: 5, unit: "PCT_EQUITY" },
						strategyFamily: "EQUITY_LONG",
						timeHorizon: "POSITION",
						rationale: {
							summary: "Hold MSFT",
							bullishFactors: ["Strong fundamentals"],
							bearishFactors: [],
							decisionLogic: "Maintain",
							memoryReferences: [],
						},
						thesisState: "MANAGING",
					},
				],
				portfolioNotes: "Multi-position portfolio",
			};

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.plan.decisions).toHaveLength(2);
			expect(result.plan.decisions.map((d) => d.instrumentId)).toEqual(["AAPL", "MSFT"]);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty decision plan", async () => {
			const gate = new ConsensusGate({ logRejections: false });
			const plan: DecisionPlan = {
				cycleId: "empty-cycle",
				timestamp: new Date().toISOString(),
				decisions: [],
				portfolioNotes: "No trades today",
			};

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.plan.decisions).toHaveLength(0);
		});

		it("should handle revision function that returns same plan", async () => {
			const gate = new ConsensusGate({ maxIterations: 2, logRejections: false });
			const plan = createRealisticTradingPlan();

			// Revision function that doesn't actually change anything
			const noOpRevision = async (p: DecisionPlan) => p;

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: false, criticApproves: true }),
				noOpRevision
			);

			// Should still fail after max iterations since plan never improves
			expect(result.approved).toBe(false);
		});

		it("should handle CLOSE action appropriately", async () => {
			const gate = new ConsensusGate({ logRejections: false });
			const plan = createRealisticTradingPlan({ action: "CLOSE" });

			const result = await runConsensusLoop(
				gate,
				plan,
				createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
				createMockRevisionFunction()
			);

			expect(result.approved).toBe(true);
			expect(result.plan.decisions[0]?.action).toBe("CLOSE");
		});
	});
});

// ============================================
// Consensus Result Validation Tests
// ============================================

describe("ConsensusResult Structure", () => {
	it("should return valid ConsensusResult on approval", async () => {
		const gate = new ConsensusGate({ logRejections: false });
		const plan = createRealisticTradingPlan();

		const result: ConsensusResult = await runConsensusLoop(
			gate,
			plan,
			createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
			createMockRevisionFunction()
		);

		expect(result).toHaveProperty("approved");
		expect(result).toHaveProperty("plan");
		expect(result).toHaveProperty("iterations");
		expect(result).toHaveProperty("riskManagerVerdict");
		expect(result).toHaveProperty("criticVerdict");
		expect(result).toHaveProperty("rejectionReasons");
		expect(typeof result.approved).toBe("boolean");
		expect(typeof result.iterations).toBe("number");
		expect(Array.isArray(result.rejectionReasons)).toBe(true);
	});

	it("should include accurate verdicts on rejection", async () => {
		const gate = new ConsensusGate({ maxIterations: 1, logRejections: false });
		const plan = createRealisticTradingPlan();

		const result = await runConsensusLoop(
			gate,
			plan,
			createMockApprovalFunction({ riskApproves: false, criticApproves: true }),
			createMockRevisionFunction()
		);

		expect(result.approved).toBe(false);
		expect(result.riskManagerVerdict).toBe("REJECT");
		expect(result.criticVerdict).toBe("APPROVE");
	});
});

// ============================================
// Performance Tests
// ============================================

describe("Consensus Loop Performance", () => {
	it("should complete within reasonable time for simple approval", async () => {
		const gate = new ConsensusGate({ logRejections: false });
		const plan = createRealisticTradingPlan();
		const startTime = Date.now();

		await runConsensusLoop(
			gate,
			plan,
			createMockApprovalFunction({ riskApproves: true, criticApproves: true }),
			createMockRevisionFunction()
		);

		const elapsed = Date.now() - startTime;
		expect(elapsed).toBeLessThan(100); // Should complete in <100ms
	});

	it("should complete all iterations within timeout", async () => {
		const gate = new ConsensusGate({
			maxIterations: 5,
			logRejections: false,
			timeout: { perAgentMs: 30000, totalMs: 10000 },
		});
		const plan = createRealisticTradingPlan();
		const startTime = Date.now();

		await runConsensusLoop(
			gate,
			plan,
			createMockApprovalFunction({
				riskApproves: false,
				criticApproves: true,
				riskDelay: 5, // Small delay per iteration
			}),
			createMockRevisionFunction()
		);

		const elapsed = Date.now() - startTime;
		expect(elapsed).toBeLessThan(10000); // Should respect total timeout
	});
});
