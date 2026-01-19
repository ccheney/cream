/**
 * Drizzle Relations
 *
 * Defines relationships between tables for type-safe joins and nested queries.
 */
import { relations } from "drizzle-orm";
import { account, session, twoFactor, user } from "./auth";
import {
	agentOutputs,
	cycleEvents,
	cycles,
	decisions,
	orders,
	positionHistory,
	positions,
} from "./core-trading";
import {
	indicatorIcHistory,
	indicatorPaperSignals,
	indicators,
	indicatorTrials,
} from "./indicators";
import { thesisState, thesisStateHistory } from "./thesis";
import { alertSettings, userPreferences } from "./user-settings";

// Decision relations
export const decisionsRelations = relations(decisions, ({ many, one }) => ({
	agentOutputs: many(agentOutputs),
	orders: many(orders),
	positions: many(positions),
	cycle: one(cycles, {
		fields: [decisions.cycleId],
		references: [cycles.id],
	}),
}));

// Agent outputs relations
export const agentOutputsRelations = relations(agentOutputs, ({ one }) => ({
	decision: one(decisions, {
		fields: [agentOutputs.decisionId],
		references: [decisions.id],
	}),
}));

// Orders relations
export const ordersRelations = relations(orders, ({ one }) => ({
	decision: one(decisions, {
		fields: [orders.decisionId],
		references: [decisions.id],
	}),
}));

// Positions relations
export const positionsRelations = relations(positions, ({ one, many }) => ({
	decision: one(decisions, {
		fields: [positions.decisionId],
		references: [decisions.id],
	}),
	thesis: one(thesisState, {
		fields: [positions.thesisId],
		references: [thesisState.thesisId],
	}),
	history: many(positionHistory),
}));

// Position history relations
export const positionHistoryRelations = relations(positionHistory, ({ one }) => ({
	position: one(positions, {
		fields: [positionHistory.positionId],
		references: [positions.id],
	}),
}));

// Cycles relations
export const cyclesRelations = relations(cycles, ({ many }) => ({
	events: many(cycleEvents),
	decisions: many(decisions),
}));

// Cycle events relations
export const cycleEventsRelations = relations(cycleEvents, ({ one }) => ({
	cycle: one(cycles, {
		fields: [cycleEvents.cycleId],
		references: [cycles.id],
	}),
}));

// Indicator relations
export const indicatorsRelations = relations(indicators, ({ many, one }) => ({
	trials: many(indicatorTrials),
	icHistory: many(indicatorIcHistory),
	paperSignals: many(indicatorPaperSignals),
	similarTo: one(indicators, {
		fields: [indicators.similarTo],
		references: [indicators.id],
		relationName: "similarIndicators",
	}),
	replaces: one(indicators, {
		fields: [indicators.replaces],
		references: [indicators.id],
		relationName: "replacedIndicators",
	}),
}));

// Indicator trials relations
export const indicatorTrialsRelations = relations(indicatorTrials, ({ one }) => ({
	indicator: one(indicators, {
		fields: [indicatorTrials.indicatorId],
		references: [indicators.id],
	}),
}));

// Indicator IC history relations
export const indicatorIcHistoryRelations = relations(indicatorIcHistory, ({ one }) => ({
	indicator: one(indicators, {
		fields: [indicatorIcHistory.indicatorId],
		references: [indicators.id],
	}),
}));

// Indicator paper signals relations
export const indicatorPaperSignalsRelations = relations(indicatorPaperSignals, ({ one }) => ({
	indicator: one(indicators, {
		fields: [indicatorPaperSignals.indicatorId],
		references: [indicators.id],
	}),
}));

// Thesis state relations
export const thesisStateRelations = relations(thesisState, ({ many }) => ({
	history: many(thesisStateHistory),
	positions: many(positions),
}));

// Thesis state history relations
export const thesisStateHistoryRelations = relations(thesisStateHistory, ({ one }) => ({
	thesis: one(thesisState, {
		fields: [thesisStateHistory.thesisId],
		references: [thesisState.thesisId],
	}),
}));

// User relations
export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	twoFactor: one(twoFactor),
	alertSettings: one(alertSettings),
	preferences: one(userPreferences),
}));

// Session relations
export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.user_id],
		references: [user.id],
	}),
}));

// Account relations
export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.user_id],
		references: [user.id],
	}),
}));

// Two factor relations
export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.user_id],
		references: [user.id],
	}),
}));

// Alert settings relations
export const alertSettingsRelations = relations(alertSettings, ({ one }) => ({
	user: one(user, {
		fields: [alertSettings.userId],
		references: [user.id],
	}),
}));

// User preferences relations
export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
	user: one(user, {
		fields: [userPreferences.userId],
		references: [user.id],
	}),
}));
