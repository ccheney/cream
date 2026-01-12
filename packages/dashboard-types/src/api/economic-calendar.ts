/**
 * Economic Calendar API Types
 *
 * Types for economic calendar events (FOMC meetings, employment reports, CPI, etc.).
 */

import { z } from "zod";

// ============================================
// Event Impact
// ============================================

export const EconomicEventImpactSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type EconomicEventImpact = z.infer<typeof EconomicEventImpactSchema>;

// ============================================
// Event Category
// ============================================

export const EconomicEventCategorySchema = z.enum([
  "INTEREST_RATE",
  "EMPLOYMENT",
  "INFLATION",
  "GDP",
  "CONSUMER",
  "HOUSING",
  "MANUFACTURING",
  "TRADE",
  "SPEECH",
  "OTHER",
]);
export type EconomicEventCategory = z.infer<typeof EconomicEventCategorySchema>;

// ============================================
// Economic Calendar Event
// ============================================

export const EconomicCalendarEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  date: z.string(),
  time: z.string().optional(),
  country: z.string(),
  impact: EconomicEventImpactSchema,
  category: EconomicEventCategorySchema,
  previous: z.string().optional(),
  forecast: z.string().optional(),
  actual: z.string().optional(),
  unit: z.string().optional(),
  source: z.string().optional(),
});

export type EconomicCalendarEvent = z.infer<typeof EconomicCalendarEventSchema>;

// ============================================
// FOMC Meeting
// ============================================

export const FOMCMeetingSchema = z.object({
  date: z.string(),
  type: z.enum(["SCHEDULED", "UNSCHEDULED"]),
  isStatementRelease: z.boolean(),
  isPressConference: z.boolean(),
  isProjectionsRelease: z.boolean(),
});

export type FOMCMeeting = z.infer<typeof FOMCMeetingSchema>;

// ============================================
// Economic Calendar Response
// ============================================

export const EconomicCalendarResponseSchema = z.object({
  events: z.array(EconomicCalendarEventSchema),
  startDate: z.string(),
  endDate: z.string(),
  count: z.number(),
});

export type EconomicCalendarResponse = z.infer<typeof EconomicCalendarResponseSchema>;

// ============================================
// Upcoming Events Response
// ============================================

export const UpcomingEventsResponseSchema = z.object({
  events: z.array(EconomicCalendarEventSchema),
  nextHighImpact: EconomicCalendarEventSchema.nullable(),
  fomcMeetings: z.array(FOMCMeetingSchema),
});

export type UpcomingEventsResponse = z.infer<typeof UpcomingEventsResponseSchema>;
