/**
 * Trading types (orders, decisions, theses).
 */

export type DecisionAction = "BUY" | "SELL" | "HOLD" | "CLOSE";
export type Direction = "LONG" | "SHORT" | "FLAT";
export type SizeUnit = "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
export type TimeHorizon = "SCALP" | "DAY" | "SWING" | "POSITION";

export interface Decision {
	id: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: Direction;
	size: number;
	sizeUnit: SizeUnit;
	entry: number | null;
	stop: number | null;
	target: number | null;
	status: DecisionStatus;
	consensusCount: number;
	pnl: number | null;
	createdAt: string;
}

export interface AgentOutput {
	agentType: string;
	vote: "APPROVE" | "REJECT";
	confidence: number;
	reasoning: string;
	processingTimeMs: number;
	createdAt: string;
}

export interface Citation {
	id: string;
	url: string;
	title: string;
	source: string;
	snippet: string;
	relevanceScore: number;
	fetchedAt: string;
}

export type OrderStatus =
	| "NEW"
	| "ACCEPTED"
	| "PARTIALLY_FILLED"
	| "FILLED"
	| "CANCELED"
	| "REJECTED";

export type AlpacaOrderStatus =
	| "new"
	| "accepted"
	| "pending_new"
	| "accepted_for_bidding"
	| "stopped"
	| "rejected"
	| "suspended"
	| "calculated"
	| "pending_cancel"
	| "pending_replace"
	| "done_for_day"
	| "canceled"
	| "expired"
	| "replaced"
	| "partially_filled"
	| "filled";

export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
export type OrderSide = "buy" | "sell";
export type TimeInForce = "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";

export interface Order {
	id: string;
	clientOrderId: string;
	symbol: string;
	qty: number;
	filledQty: number;
	side: OrderSide;
	type: OrderType;
	timeInForce: TimeInForce;
	status: AlpacaOrderStatus;
	limitPrice: number | null;
	stopPrice: number | null;
	filledAvgPrice: number | null;
	createdAt: string;
	updatedAt: string;
	submittedAt: string | null;
	filledAt: string | null;
}

export interface OrdersResponse {
	orders: Order[];
	count: number;
}

export interface OrdersFilters {
	status?: "open" | "closed" | "all";
	limit?: number;
	direction?: "asc" | "desc";
	symbols?: string;
	side?: OrderSide;
	nested?: boolean;
}

export interface ExecutionDetail {
	orderId: string;
	brokerOrderId: string;
	broker: "ALPACA";
	status: OrderStatus;
	filledQty: number;
	avgFillPrice: number;
	slippage: number;
	commissions: number;
	timestamps: {
		submitted: string;
		accepted: string | null;
		filled: string | null;
	};
}

export interface ThesisSummary {
	id: string;
	symbol: string;
	title: string;
}

export interface ApprovalViolation {
	constraint?: string;
	current_value?: string | number;
	limit?: string | number;
	severity?: string;
	affected_decisions?: string[];
}

export interface ApprovalRequiredChange {
	decisionId: string;
	change: string;
	reason?: string;
}

export interface ApprovalDetail {
	verdict: "APPROVE" | "REJECT";
	notes?: string;
	violations?: ApprovalViolation[];
	requiredChanges?: ApprovalRequiredChange[];
}

export interface StopLoss {
	price: number;
	type: "FIXED" | "TRAILING";
}

export interface TakeProfit {
	price: number;
}

export interface OptionLeg {
	symbol: string;
	ratioQty: number;
	positionIntent: "BUY_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_OPEN" | "SELL_TO_CLOSE";
}

export interface DecisionDetail extends Decision {
	strategyFamily: string | null;
	timeHorizon: TimeHorizon | null;
	rationale: string | null;
	bullishFactors: string[];
	bearishFactors: string[];
	agentOutputs: AgentOutput[];
	citations: Citation[];
	execution: ExecutionDetail | null;
	thesis: ThesisSummary | null;
	riskApproval?: ApprovalDetail;
	criticApproval?: ApprovalDetail;
	// Full decision details
	stopLoss: StopLoss | null;
	takeProfit: TakeProfit | null;
	thesisState: string | null;
	decisionLogic: string | null;
	memoryReferences: string[];
	legs: OptionLeg[];
	netLimitPrice: number | null;
	originalAction: string | null;
}

export interface DecisionFilters {
	symbol?: string;
	action?: DecisionAction;
	dateFrom?: string;
	dateTo?: string;
	status?: DecisionStatus;
	limit?: number;
	offset?: number;
}

export interface DecisionSummary {
	id: string;
	action: DecisionAction;
	status: DecisionStatus;
	createdAt: string;
}

export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";
export type ThesisStatus = "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED";
export type ThesisResult = "WIN" | "LOSS";

export interface ThesisListItem {
	id: string;
	symbol: string;
	title: string;
	state: ThesisState;
	result: ThesisResult | null;
	returnPct: number | null;
	createdAt: string;
	updatedAt: string;
}

export interface StateTransition {
	fromState: string;
	toState: string;
	reason: string;
	timestamp: string;
}

export interface Position {
	id: string;
	symbol: string;
	side: "LONG" | "SHORT";
	qty: number;
	avgEntry: number;
	currentPrice: number;
	lastdayPrice: number | null;
	marketValue: number;
	unrealizedPnl: number;
	unrealizedPnlPct: number;
	stop: number | null;
	target: number | null;
	thesisId: string | null;
	daysHeld: number;
	openedAt: string;
}

export interface ThesisDetail extends ThesisListItem {
	narrative: string;
	entryTrigger: string;
	invalidation: string;
	bullishFactors: string[];
	bearishFactors: string[];
	positions: Position[];
	decisions: DecisionSummary[];
	stateHistory: StateTransition[];
}

export interface CreateThesisRequest {
	symbol: string;
	title: string;
	narrative: string;
	entryTrigger: string;
	invalidation: string;
	bullishFactors: string[];
	bearishFactors: string[];
}

export interface UpdateThesisRequest {
	title?: string;
	narrative?: string;
	entryTrigger?: string;
	invalidation?: string;
	bullishFactors?: string[];
	bearishFactors?: string[];
}

export interface ThesisTransitionRequest {
	toState: ThesisState;
	reason: string;
}

export interface ThesisFilters {
	symbol?: string;
	state?: ThesisStatus;
	limit?: number;
	offset?: number;
}
