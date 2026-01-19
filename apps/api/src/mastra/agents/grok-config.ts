/**
 * Grok Search Configuration for the Grounding Agent.
 *
 * Configures xAI's live search tools for web, news, and X.com searches.
 * Uses xai.tools API for streaming tool call visibility.
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

let _grokModel: string | null = null;

export function getGrokModelId(): string {
	if (!_grokModel) {
		_grokModel = getGrokModel();
	}
	return _grokModel;
}

export function createGrokModel(): LanguageModel {
	return xai(getGrokModelId());
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

export interface GrokToolsOptions {
	fromDate?: string;
	toDate?: string;
}

export type GrokTools = {
	web_search: ReturnType<typeof xai.tools.webSearch>;
	x_search: ReturnType<typeof xai.tools.xSearch>;
};

/**
 * Create xAI tools for streaming tool call visibility.
 * Uses xai.tools API which emits tool-call events that can be displayed in UI.
 */
export function createGrokTools(options: GrokToolsOptions = {}): GrokTools {
	const { fromDate, toDate } = options;

	return {
		web_search: xai.tools.webSearch(),
		x_search: xai.tools.xSearch({
			...(fromDate && { fromDate }),
			...(toDate && { toDate }),
		}),
	};
}

/**
 * Get the Grok responses model for use with xai.tools.
 * The responses model is required for server-side tool execution.
 */
export function createGrokResponsesModel(): LanguageModel {
	return xai.responses(getGrokModelId());
}
