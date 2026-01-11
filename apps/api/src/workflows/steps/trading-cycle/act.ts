/**
 * Act Phase
 *
 * Constraint checking and order submission for the trading cycle workflow.
 */

import { create } from "@bufbuild/protobuf";
import type { ExecutionContext } from "@cream/domain";
import { isBacktest } from "@cream/domain";
import { InstrumentSchema, InstrumentType } from "@cream/schema-gen/cream/v1/common";

import { ExecutionEngineError, getExecutionEngineClient, OrderSide } from "../../../grpc/index.js";
import type { WorkflowDecisionPlan } from "./types.js";

// ============================================
// Constraint Checking
// ============================================

/**
 * Check constraints for the trading plan.
 *
 * In BACKTEST mode, returns a simple pass/fail based on approval.
 * In PAPER/LIVE mode, calls the Rust execution engine for constraint validation.
 */
export async function checkConstraints(
  approved: boolean,
  _plan: WorkflowDecisionPlan,
  ctx?: ExecutionContext
): Promise<{ passed: boolean; violations: string[] }> {
  if (!approved) {
    return { passed: false, violations: ["Plan not approved by agents"] };
  }

  if (ctx && isBacktest(ctx)) {
    return { passed: true, violations: [] };
  }

  try {
    const client = getExecutionEngineClient();

    const [accountResponse, positionsResponse] = await Promise.all([
      client.getAccountState({}),
      client.getPositions({}),
    ]);

    const response = await client.checkConstraints({
      accountState: accountResponse.accountState,
      positions: positionsResponse.positions,
    });

    return {
      passed: response.approved,
      violations: response.violations.map((v) => v.message),
    };
  } catch (error) {
    const message = error instanceof ExecutionEngineError ? error.message : String(error);
    return { passed: false, violations: [`Execution engine error: ${message}`] };
  }
}

// ============================================
// Order Submission
// ============================================

/**
 * Submit orders for approved decisions.
 *
 * In BACKTEST mode, returns mock order IDs without executing.
 * In PAPER/LIVE mode, calls the Rust execution engine to submit orders.
 */
export async function submitOrders(
  constraintsPassed: boolean,
  plan: WorkflowDecisionPlan,
  cycleId: string,
  ctx?: ExecutionContext
): Promise<{ submitted: boolean; orderIds: string[]; errors: string[] }> {
  if (!constraintsPassed) {
    return { submitted: false, orderIds: [], errors: ["Constraints not passed"] };
  }

  const actionableDecisions = plan.decisions.filter((d) => d.action !== "HOLD");

  if (actionableDecisions.length === 0) {
    return { submitted: true, orderIds: [], errors: [] };
  }

  if (ctx && isBacktest(ctx)) {
    const mockOrderIds = actionableDecisions.map(
      (d) => `mock-${d.instrumentId}-${cycleId}-${Date.now()}`
    );
    return { submitted: true, orderIds: mockOrderIds, errors: [] };
  }

  const client = getExecutionEngineClient();
  const orderIds: string[] = [];
  const errors: string[] = [];

  for (const decision of actionableDecisions) {
    try {
      const response = await client.submitOrder({
        instrument: create(InstrumentSchema, {
          instrumentId: decision.instrumentId,
          instrumentType: InstrumentType.EQUITY,
        }),
        side: decision.action === "BUY" ? OrderSide.BUY : OrderSide.SELL,
        quantity: decision.size.value,
        orderType: 1,
        timeInForce: 0,
        clientOrderId: decision.decisionId,
        cycleId,
      });

      if (response.orderId) {
        orderIds.push(response.orderId);
      }
      if (response.errorMessage) {
        errors.push(`${decision.instrumentId}: ${response.errorMessage}`);
      }
    } catch (error) {
      const message = error instanceof ExecutionEngineError ? error.message : String(error);
      errors.push(`${decision.instrumentId}: ${message}`);
    }
  }

  return {
    submitted: orderIds.length > 0 || errors.length === 0,
    orderIds,
    errors,
  };
}
