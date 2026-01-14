/**
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

export const IndicatorName = z.enum([
	"rsi",
	"stochastic",
	"sma",
	"ema",
	"atr",
	"bollinger_bands",
	"volume_sma",
]);
export type IndicatorName = z.infer<typeof IndicatorName>;

/** Standard: 14 period, >70 overbought, <30 oversold */
export const RSIParamsSchema = z.object({
	period: z.number().int().positive().default(14),
});

/** %K = fast line, %D = signal line */
export const StochasticParamsSchema = z.object({
	k_period: z.number().int().positive().default(14),
	d_period: z.number().int().positive().default(3),
	slow: z.boolean().default(true),
});

export const SMAParamsSchema = z.object({
	periods: z.array(z.number().int().positive()).min(1).default([20, 50, 200]),
});

export const EMAParamsSchema = z.object({
	periods: z.array(z.number().int().positive()).min(1).default([9, 21]),
});

export const ATRParamsSchema = z.object({
	period: z.number().int().positive().default(14),
});

/** Standard: 20-period SMA, +/- 2 standard deviations */
export const BollingerBandsParamsSchema = z.object({
	period: z.number().int().positive().default(20),
	std_dev: z.number().positive().default(2.0),
});

export const VolumeSMAParamsSchema = z.object({
	period: z.number().int().positive().default(20),
});

/** Flexible indicator config - params validated at runtime based on name */
export const IndicatorConfigSchema = z.object({
	name: z.string().min(1),
	params: z.record(z.string(), z.unknown()),
	timeframes: z.array(z.string()).min(1),
});
export type IndicatorConfig = z.infer<typeof IndicatorConfigSchema>;

export const IndicatorsConfigSchema = z.array(IndicatorConfigSchema);
export type IndicatorsConfig = z.infer<typeof IndicatorsConfigSchema>;

export const RSIIndicatorConfigSchema = z.object({
	name: z.literal("rsi"),
	params: RSIParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type RSIIndicatorConfig = z.infer<typeof RSIIndicatorConfigSchema>;

export const StochasticIndicatorConfigSchema = z.object({
	name: z.literal("stochastic"),
	params: StochasticParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type StochasticIndicatorConfig = z.infer<typeof StochasticIndicatorConfigSchema>;

export const SMAIndicatorConfigSchema = z.object({
	name: z.literal("sma"),
	params: SMAParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type SMAIndicatorConfig = z.infer<typeof SMAIndicatorConfigSchema>;

export const EMAIndicatorConfigSchema = z.object({
	name: z.literal("ema"),
	params: EMAParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type EMAIndicatorConfig = z.infer<typeof EMAIndicatorConfigSchema>;

export const ATRIndicatorConfigSchema = z.object({
	name: z.literal("atr"),
	params: ATRParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type ATRIndicatorConfig = z.infer<typeof ATRIndicatorConfigSchema>;

export const BollingerBandsIndicatorConfigSchema = z.object({
	name: z.literal("bollinger_bands"),
	params: BollingerBandsParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type BollingerBandsIndicatorConfig = z.infer<typeof BollingerBandsIndicatorConfigSchema>;

export const VolumeSMAIndicatorConfigSchema = z.object({
	name: z.literal("volume_sma"),
	params: VolumeSMAParamsSchema,
	timeframes: z.array(z.string()).min(1),
});
export type VolumeSMAIndicatorConfig = z.infer<typeof VolumeSMAIndicatorConfigSchema>;

export const TypedIndicatorConfigSchema = z.union([
	RSIIndicatorConfigSchema,
	StochasticIndicatorConfigSchema,
	SMAIndicatorConfigSchema,
	EMAIndicatorConfigSchema,
	ATRIndicatorConfigSchema,
	BollingerBandsIndicatorConfigSchema,
	VolumeSMAIndicatorConfigSchema,
]);
export type TypedIndicatorConfig = z.infer<typeof TypedIndicatorConfigSchema>;
