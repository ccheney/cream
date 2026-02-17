import { z } from "zod";

import {
	CorporateIndicatorsSchema,
	LiquidityIndicatorsSchema,
	MarketContextSchema,
	OptionsIndicatorsSchema,
	PriceIndicatorsSchema,
	QualityIndicatorsSchema,
	SentimentIndicatorsSchema,
	ShortInterestIndicatorsSchema,
	SnapshotMetadataSchema,
	ValueIndicatorsSchema,
} from "./indicator-schemas";

export const IndicatorSnapshotSchema = z.object({
	symbol: z.string(),
	timestamp: z.number(),
	price: PriceIndicatorsSchema,
	liquidity: LiquidityIndicatorsSchema,
	options: OptionsIndicatorsSchema,
	value: ValueIndicatorsSchema,
	quality: QualityIndicatorsSchema,
	short_interest: ShortInterestIndicatorsSchema,
	sentiment: SentimentIndicatorsSchema,
	corporate: CorporateIndicatorsSchema,
	market: MarketContextSchema,
	metadata: SnapshotMetadataSchema,
});

export type IndicatorSnapshot = z.infer<typeof IndicatorSnapshotSchema>;
