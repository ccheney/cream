import { z } from "zod";

/**
 * Autonomous scanner configuration.
 */
export const ScannerConfigSchema = z.object({
	minPrice: z.number().min(0).default(5.0),
	minAvgVolume: z.number().int().min(0).default(100_000),
	volumeSpikeThreshold: z.number().min(1).default(3.0),
	priceMoveThreshold: z.number().min(0).default(2.0),
	gapThreshold: z.number().min(0).default(2.0),
	maxCandidates: z.number().int().min(1).default(10),
	cooldownSeconds: z.number().int().min(0).default(300),
	enabled: z.boolean().default(true),
});

export type ScannerConfig = z.infer<typeof ScannerConfigSchema>;
