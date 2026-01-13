/**
 * Tavily API Client
 *
 * Adapter for web search using the Tavily API.
 * Follows the FMPClient pattern for consistent error handling, retries, and configuration.
 *
 * @see https://docs.tavily.com/documentation/api-reference/endpoint/search
 */

import { z } from "zod";

// ============================================
// Schemas
// ============================================

/**
 * Search result from Tavily
 */
export const TavilyResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
  published_date: z.string().optional(),
  raw_content: z.string().nullable().optional(),
});
export type TavilyResult = z.infer<typeof TavilyResultSchema>;

/**
 * Tavily search response
 */
export const TavilyResponseSchema = z.object({
  query: z.string(),
  results: z.array(TavilyResultSchema),
  response_time: z.number(),
  answer: z.string().nullable().optional(),
  follow_up_questions: z.array(z.string()).nullable().optional(),
});
export type TavilyResponse = z.infer<typeof TavilyResponseSchema>;

/**
 * Tavily error response
 */
export const TavilyErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type TavilyError = z.infer<typeof TavilyErrorSchema>;

// ============================================
// Types
// ============================================

/**
 * Tavily API configuration
 */
export interface TavilyClientConfig {
  /** API key */
  apiKey: string;
  /** Base URL (defaults to production) */
  baseUrl?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retries?: number;
  /** Retry delay in ms */
  retryDelay?: number;
}

/**
 * Default Tavily configuration
 */
const DEFAULT_CONFIG: Required<Omit<TavilyClientConfig, "apiKey">> = {
  baseUrl: "https://api.tavily.com",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

/**
 * Topic categories for search
 */
export type TavilyTopic = "general" | "news" | "finance";

/**
 * Time range filter
 */
export type TavilyTimeRange = "day" | "week" | "month" | "year";

/**
 * Search depth options
 */
export type TavilySearchDepth = "basic" | "advanced" | "fast" | "ultra-fast";

/**
 * Raw content format
 */
export type TavilyRawContentFormat = boolean | "markdown" | "text";

/**
 * Search parameters
 */
export interface TavilySearchParams {
  /** Search query */
  query: string;
  /** Topic category */
  topic?: TavilyTopic;
  /** Filter by time range */
  timeRange?: TavilyTimeRange;
  /** Maximum number of results (1-20) */
  maxResults?: number;
  /** Only include results from these domains (max 300) */
  includeDomains?: string[];
  /** Exclude results from these domains (max 150) */
  excludeDomains?: string[];
  /** Include raw content in results */
  includeRawContent?: TavilyRawContentFormat;
  /** Search depth */
  searchDepth?: TavilySearchDepth;
  /** Include AI-generated answer */
  includeAnswer?: boolean;
}

/**
 * Client result type - either success or error
 */
export type TavilyClientResult =
  | { success: true; data: TavilyResponse }
  | { success: false; error: string; retryable: boolean };

// ============================================
// Tavily Client Implementation
// ============================================

/**
 * Tavily API Client
 *
 * Provides web search functionality with retry logic, timeout handling,
 * and Zod validation of API responses.
 */
export class TavilyClient {
  private readonly config: Required<TavilyClientConfig>;

  constructor(config: TavilyClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Perform a web search using Tavily
   *
   * @param params - Search parameters
   * @returns Search results or error
   */
  async search(params: TavilySearchParams): Promise<TavilyClientResult> {
    const {
      query,
      topic,
      timeRange,
      maxResults,
      includeDomains,
      excludeDomains,
      includeRawContent,
      searchDepth,
      includeAnswer,
    } = params;

    // Validate params
    if (!query || query.trim().length === 0) {
      return { success: false, error: "Query cannot be empty", retryable: false };
    }

    if (maxResults !== undefined && (maxResults < 1 || maxResults > 20)) {
      return { success: false, error: "maxResults must be between 1 and 20", retryable: false };
    }

    if (includeDomains && includeDomains.length > 300) {
      return {
        success: false,
        error: "includeDomains cannot exceed 300 entries",
        retryable: false,
      };
    }

    if (excludeDomains && excludeDomains.length > 150) {
      return {
        success: false,
        error: "excludeDomains cannot exceed 150 entries",
        retryable: false,
      };
    }

    // Build request body
    const body: Record<string, unknown> = {
      api_key: this.config.apiKey,
      query: query.trim(),
    };

    if (topic) {
      body.topic = topic;
    }
    if (timeRange) {
      body.time_range = timeRange;
    }
    if (maxResults !== undefined) {
      body.max_results = maxResults;
    }
    if (includeDomains && includeDomains.length > 0) {
      body.include_domains = includeDomains;
    }
    if (excludeDomains && excludeDomains.length > 0) {
      body.exclude_domains = excludeDomains;
    }
    if (includeRawContent !== undefined) {
      body.include_raw_content = includeRawContent;
    }
    if (searchDepth) {
      body.search_depth = searchDepth;
    }
    if (includeAnswer !== undefined) {
      body.include_answer = includeAnswer;
    }

    return this.request(body);
  }

  /**
   * Make a request to the Tavily API with retries
   */
  private async request(body: Record<string, unknown>): Promise<TavilyClientResult> {
    const url = `${this.config.baseUrl}/search`;
    let lastError = "Unknown error";

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });

        clearTimeout(timeoutId);

        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          lastError = `Tavily API error: ${response.status} ${response.statusText} - ${errorText}`;

          // Don't retry on 4xx errors (except 429 rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            return { success: false, error: lastError, retryable: false };
          }

          // Retry on 5xx and 429
          throw new Error(lastError);
        }

        // Parse and validate response
        const data = await response.json();
        const parsed = TavilyResponseSchema.safeParse(data);

        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid Tavily response: ${parsed.error.message}`,
            retryable: false,
          };
        }

        return { success: true, data: parsed.data };
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            lastError = `Request timeout after ${this.config.timeout}ms`;
          } else {
            lastError = error.message;
          }
        } else {
          lastError = String(error);
        }

        // Wait before retry with exponential backoff
        if (attempt < this.config.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay * 2 ** attempt)
          );
        }
      }
    }

    return { success: false, error: lastError, retryable: true };
  }

  /**
   * Check if the client is configured with an API key
   */
  hasApiKey(): boolean {
    return this.config.apiKey.length > 0;
  }
}

/**
 * Create a TavilyClient from environment
 *
 * @returns TavilyClient or null if no API key is configured
 */
export function createTavilyClientFromEnv(): TavilyClient | null {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new TavilyClient({ apiKey });
}
