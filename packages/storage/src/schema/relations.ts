/**
 * Drizzle Relations
 *
 * Defines relationships between tables for type-safe joins and nested queries.
 */
import { relations } from "drizzle-orm";
import { account, session, twoFactor, user } from "./auth";
import { agentOutputs, cycleEvents, cycles, decisions, orders } from "./core-trading";
import { thesisState, thesisStateHistory } from "./thesis";
import { alertSettings, userPreferences } from "./user-settings";

// Decision relations
export const decisionsRelations = relations(decisions, ({ many, one }) => ({
	agentOutputs: many(agentOutputs),
	orders: many(orders),
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

// Thesis state relations
export const thesisStateRelations = relations(thesisState, ({ many }) => ({
	history: many(thesisStateHistory),
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
