/**
 * Grok Search Configuration for the Grounding Agent.
 *
 * Configures xAI's live search parameters for web, news, and X.com searches.
 * Uses providerOptions.xai.searchParameters with the Vercel AI SDK.
 */

import { xai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";

export interface WebSearchSource {
	type: "web";
	allowedWebsites?: string[];
	blockedWebsites?: string[];
}

export interface NewsSearchSource {
	type: "news";
	country?: string;
	excludedWebsites?: string[];
	safeSearch?: boolean;
}

export interface XSearchSource {
	type: "x";
	includedXHandles?: string[];
	excludedXHandles?: string[];
	postFavoriteCount?: number;
	postViewCount?: number;
}

export type GrokSearchSource = WebSearchSource | NewsSearchSource | XSearchSource;

export interface GrokSearchOptions {
	sources?: GrokSearchSource[];
	maxSearchResults?: number;
	fromDate?: string;
	toDate?: string;
}

function getGrokModel(): string {
	const model = Bun.env.XAI_MODEL;
	if (!model) {
		throw new Error("XAI_MODEL environment variable is required");
	}
	return model;
}

export const GROK_MODEL = getGrokModel();

export function createGrokModel(): LanguageModel {
	return xai(GROK_MODEL);
}

export const DEFAULT_TRADING_SOURCES: GrokSearchSource[] = [
	{ type: "web" },
	{ type: "news", country: "US" },
	{ type: "x", postFavoriteCount: 10, postViewCount: 100 },
];

export function createGrokSearchConfig(options: GrokSearchOptions = {}) {
	const { sources = DEFAULT_TRADING_SOURCES, maxSearchResults = 20, fromDate, toDate } = options;

	const searchParameters: Record<string, unknown> = {
		mode: "on",
		returnCitations: true,
		maxSearchResults,
		sources,
	};

	if (fromDate) {
		searchParameters.fromDate = fromDate;
	}
	if (toDate) {
		searchParameters.toDate = toDate;
	}

	return { searchParameters };
}
