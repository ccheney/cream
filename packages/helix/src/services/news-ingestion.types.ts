export interface NewsItemInput {
	itemId: string;
	headline: string;
	bodyText: string;
	publishedAt: Date;
	source: string;
	relatedSymbols: string[];
	sentimentScore: number;
}

export interface NewsIngestionResult {
	itemsIngested: number;
	edgesCreated: number;
	embeddingsGenerated: number;
	duplicatesSkipped: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

export interface NewsIngestionOptions {
	generateEmbeddings?: boolean;
	createCompanyEdges?: boolean;
	deduplicateByHeadline?: boolean;
	deduplicationThreshold?: number;
	batchSize?: number;
}
