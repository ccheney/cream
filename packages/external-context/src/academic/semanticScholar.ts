/**
 * Semantic Scholar API Client
 *
 * Client for querying the Semantic Scholar Academic Graph API.
 * Used to fetch academic papers for grounding research hypotheses.
 *
 * @see https://api.semanticscholar.org/api-docs/
 */

import { log } from "../logger.js";

// ============================================
// Types
// ============================================

/**
 * Semantic Scholar paper response
 */
export interface SemanticScholarPaper {
  /** Semantic Scholar paper ID */
  paperId: string;
  /** Paper title */
  title: string;
  /** Abstract text */
  abstract?: string;
  /** Publication year */
  year?: number;
  /** Number of citations */
  citationCount?: number;
  /** Number of influential citations */
  influentialCitationCount?: number;
  /** External IDs (DOI, ArXiv, etc.) */
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    MAG?: string;
    PubMed?: string;
    DBLP?: string;
    CorpusId?: number;
  };
  /** Publication venue */
  venue?: string;
  /** Open access PDF URL */
  openAccessPdf?: {
    url: string;
    status: string;
  };
  /** Authors */
  authors?: Array<{
    authorId: string;
    name: string;
  }>;
  /** URL to Semantic Scholar page */
  url?: string;
}

/**
 * Search response from Semantic Scholar
 */
export interface SemanticScholarSearchResponse {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

/**
 * Semantic Scholar client configuration
 */
export interface SemanticScholarConfig {
  /** API key for higher rate limits (optional) */
  apiKey?: string;
  /** Base URL for the API */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Retry attempts on failure */
  retries?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: Required<SemanticScholarConfig> = {
  apiKey: "",
  baseUrl: "https://api.semanticscholar.org/graph/v1",
  timeoutMs: 30000,
  retries: 3,
};

/**
 * Fields to request from the API
 */
const PAPER_FIELDS = [
  "paperId",
  "title",
  "abstract",
  "year",
  "citationCount",
  "influentialCitationCount",
  "externalIds",
  "venue",
  "openAccessPdf",
  "authors",
  "url",
].join(",");

/**
 * Rate limiting: Wait time between requests (ms)
 * Public API: 1000 requests/second shared among all users
 * With API key: 100 requests/second dedicated
 */
const REQUEST_DELAY_MS = 100;

// ============================================
// Semantic Scholar Client
// ============================================

/**
 * Semantic Scholar API Client
 *
 * Provides methods for searching and fetching academic papers.
 */
export class SemanticScholarClient {
  private readonly config: Required<SemanticScholarConfig>;
  private lastRequestTime = 0;

  constructor(config: SemanticScholarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Check for API key in environment
    if (!this.config.apiKey) {
      const envKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
      if (envKey) {
        this.config.apiKey = envKey;
      }
    }
  }

  /**
   * Rate limit helper - ensures we don't exceed API limits
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make an API request with retry logic
   */
  private async request<T>(url: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      await this.rateLimit();

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (this.config.apiKey) {
          headers["x-api-key"] = this.config.apiKey;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = response.headers.get("Retry-After");
            const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 5000;
            log.warn({ attempt, waitMs }, "Rate limited by Semantic Scholar, waiting...");
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(`Semantic Scholar API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.name === "AbortError") {
          log.warn({ attempt }, "Semantic Scholar request timed out");
        } else {
          log.warn({ attempt, error: lastError.message }, "Semantic Scholar request failed");
        }

        // Exponential backoff
        if (attempt < this.config.retries - 1) {
          const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  /**
   * Search for papers by keyword query
   *
   * @param query - Search query (searches title and abstract)
   * @param options - Search options
   * @returns List of matching papers
   */
  async searchPapers(
    query: string,
    options: {
      /** Maximum results to return (default: 10) */
      limit?: number;
      /** Results offset for pagination */
      offset?: number;
      /** Filter by publication year range */
      yearRange?: { min?: number; max?: number };
      /** Filter to open access papers only */
      openAccessOnly?: boolean;
      /** Sort field and order */
      sort?: "relevance" | "citationCount:desc" | "citationCount:asc" | "year:desc" | "year:asc";
    } = {}
  ): Promise<SemanticScholarPaper[]> {
    const {
      limit = 10,
      offset = 0,
      yearRange,
      openAccessOnly = false,
      sort = "relevance",
    } = options;

    // Build query parameters
    const params = new URLSearchParams({
      query,
      fields: PAPER_FIELDS,
      limit: String(limit),
      offset: String(offset),
    });

    // Add year filter if specified
    if (yearRange?.min || yearRange?.max) {
      let yearFilter = "";
      if (yearRange.min && yearRange.max) {
        yearFilter = `${yearRange.min}-${yearRange.max}`;
      } else if (yearRange.min) {
        yearFilter = `${yearRange.min}-`;
      } else if (yearRange.max) {
        yearFilter = `-${yearRange.max}`;
      }
      params.set("year", yearFilter);
    }

    // Add open access filter
    if (openAccessOnly) {
      params.set("openAccessPdf", "true");
    }

    // Add sort
    if (sort !== "relevance") {
      params.set("sort", sort);
    }

    const url = `${this.config.baseUrl}/paper/search?${params.toString()}`;
    log.debug({ query, limit, offset }, "Searching Semantic Scholar");

    const response = await this.request<SemanticScholarSearchResponse>(url);
    return response.data;
  }

  /**
   * Get a paper by its Semantic Scholar ID
   */
  async getPaperById(paperId: string): Promise<SemanticScholarPaper | null> {
    const url = `${this.config.baseUrl}/paper/${encodeURIComponent(paperId)}?fields=${PAPER_FIELDS}`;

    try {
      return await this.request<SemanticScholarPaper>(url);
    } catch (error) {
      log.warn(
        { paperId, error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch paper"
      );
      return null;
    }
  }

  /**
   * Get a paper by DOI
   */
  async getPaperByDOI(doi: string): Promise<SemanticScholarPaper | null> {
    return this.getPaperById(`DOI:${doi}`);
  }

  /**
   * Get a paper by ArXiv ID
   */
  async getPaperByArxiv(arxivId: string): Promise<SemanticScholarPaper | null> {
    return this.getPaperById(`ARXIV:${arxivId}`);
  }

  /**
   * Search for papers related to quantitative finance topics
   */
  async searchFinancePapers(
    topic: string,
    options: { limit?: number; recentYears?: number } = {}
  ): Promise<SemanticScholarPaper[]> {
    const { limit = 10, recentYears } = options;

    // Add finance-specific context to improve relevance
    const enhancedQuery = `${topic} finance stock market investing`;

    const yearRange = recentYears
      ? { min: new Date().getFullYear() - recentYears, max: new Date().getFullYear() }
      : undefined;

    return this.searchPapers(enhancedQuery, {
      limit,
      yearRange,
      sort: "citationCount:desc",
    });
  }

  /**
   * Get paper recommendations based on a source paper
   */
  async getRecommendations(
    paperId: string,
    options: { limit?: number } = {}
  ): Promise<SemanticScholarPaper[]> {
    const { limit = 10 } = options;

    const url = `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(paperId)}?fields=${PAPER_FIELDS}&limit=${limit}`;

    try {
      const response = await this.request<{ recommendedPapers: SemanticScholarPaper[] }>(url);
      return response.recommendedPapers;
    } catch (error) {
      log.warn(
        { paperId, error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch recommendations"
      );
      return [];
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a Semantic Scholar client
 */
export function createSemanticScholarClient(config?: SemanticScholarConfig): SemanticScholarClient {
  return new SemanticScholarClient(config);
}
