import { z } from "zod";

export const OpraQuoteMessageSchema = z.object({
	T: z.literal("q"),
	S: z.string().describe("Option symbol (OCC format)"),
	t: z.string().describe("Quote timestamp (RFC-3339)"),
	bx: z.string().optional().describe("Bid exchange code"),
	bp: z.number().describe("Bid price"),
	bs: z.number().describe("Bid size (contracts)"),
	ax: z.string().optional().describe("Ask exchange code"),
	ap: z.number().describe("Ask price"),
	as: z.number().describe("Ask size (contracts)"),
	c: z.string().optional().describe("Quote condition"),
});
export type OpraQuoteMessage = z.infer<typeof OpraQuoteMessageSchema>;

export const OpraTradeMessageSchema = z.object({
	T: z.literal("t"),
	S: z.string().describe("Option symbol (OCC format)"),
	t: z.string().describe("Trade timestamp (RFC-3339)"),
	p: z.number().describe("Trade price"),
	s: z.number().describe("Trade size (contracts)"),
	x: z.string().optional().describe("Exchange code"),
	c: z.string().optional().describe("Trade condition"),
});
export type OpraTradeMessage = z.infer<typeof OpraTradeMessageSchema>;
