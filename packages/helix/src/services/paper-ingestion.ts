/**
 * Paper Ingestion Service
 *
 * Ingests academic papers from Semantic Scholar into HelixDB.
 * Creates AcademicPaper nodes with embedded abstracts for semantic search.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { AcademicPaper } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";

// ============================================
// Types
// ============================================

/**
 * Paper input from external API (e.g., Semantic Scholar)
 */
export interface PaperInput {
	/** Paper identifier (S2 ID, DOI, or ArXiv ID) */
	paperId: string;
	/** Paper title */
	title: string;
	/** Authors as formatted string */
	authors: string;
	/** Abstract text (will be embedded) */
	abstract: string;
	/** URL to paper (Semantic Scholar, DOI, or ArXiv) */
	url?: string;
	/** Publication year */
	publicationYear?: number;
	/** Citation count */
	citationCount?: number;
}

/**
 * Ingestion result
 */
export interface PaperIngestionResult {
	papersIngested: number;
	duplicatesSkipped: number;
	embeddingsGenerated: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

/**
 * Ingestion options
 */
export interface PaperIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to check for duplicates (default: true) */
	checkDuplicates?: boolean;
	/** Batch size for operations (default: 20) */
	batchSize?: number;
}

// ============================================
// Seed Papers - Foundational Research
// ============================================

/**
 * Foundational papers for seeding the knowledge base.
 * These are seminal works in quantitative finance, organized by domain.
 */
export const SEED_PAPERS: PaperInput[] = [
	// ============================================
	// Portfolio Theory & Asset Pricing
	// ============================================
	{
		paperId: "markowitz-1952",
		title: "Portfolio Selection",
		authors: "Harry Markowitz",
		abstract:
			"The process of selecting a portfolio may be divided into two stages. The first stage starts with observation and experience and ends with beliefs about the future performances of available securities. The second stage starts with the relevant beliefs about future performances and ends with the choice of portfolio. This paper is concerned with the second stage. We first consider the rule that the investor does (or should) maximize discounted expected, or anticipated, returns. We next consider the rule that the investor does (or should) consider expected return a desirable thing and variance of return an undesirable thing.",
		url: "https://doi.org/10.2307/2975974",
		publicationYear: 1952,
		citationCount: 45000,
	},
	{
		paperId: "sharpe-1964",
		title: "Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk",
		authors: "William F. Sharpe",
		abstract:
			"This paper derives conditions for equilibrium in capital asset markets by aggregating the portfolio decisions of individual investors according to mean-variance preferences. The resulting equilibrium prices of assets are shown to depend on their systematic risk as measured by the covariance of returns with the market portfolio. This relationship provides the foundation for the Capital Asset Pricing Model (CAPM).",
		url: "https://doi.org/10.1111/j.1540-6261.1964.tb02865.x",
		publicationYear: 1964,
		citationCount: 20000,
	},
	{
		paperId: "fama-french-1992",
		title: "The Cross-Section of Expected Stock Returns",
		authors: "Eugene F. Fama, Kenneth R. French",
		abstract:
			"Two easily measured variables, size and book-to-market equity, combine to capture the cross-sectional variation in average stock returns associated with market beta, size, leverage, book-to-market equity, and earnings-price ratios. Moreover, when the tests allow for variation in beta that is unrelated to size, the relation between market beta and average return is flat, even when beta is the only explanatory variable.",
		url: "https://doi.org/10.1111/j.1540-6261.1992.tb04398.x",
		publicationYear: 1992,
		citationCount: 20000,
	},
	{
		paperId: "fama-french-2015",
		title: "A Five-Factor Asset Pricing Model",
		authors: "Eugene F. Fama, Kenneth R. French",
		abstract:
			"A five-factor model directed at capturing the size, value, profitability, and investment patterns in average stock returns performs better than the three-factor model of Fama and French (1993). The five-factor model's main problem is its failure to capture the low average returns on small stocks whose returns behave like those of firms that invest a lot despite low profitability.",
		url: "https://doi.org/10.1016/j.jfineco.2014.10.010",
		publicationYear: 2015,
		citationCount: 8000,
	},
	{
		paperId: "carhart-1997",
		title: "On Persistence in Mutual Fund Performance",
		authors: "Mark M. Carhart",
		abstract:
			"Using a sample free of survivorship bias, I demonstrate that common factors in stock returns and investment expenses almost completely explain persistence in equity mutual funds' mean and risk-adjusted returns. Hendricks, Patel, and Zeckhauser's (1993) hot hands result is mainly driven by the one-year momentum effect of Jegadeesh and Titman (1993), but individual funds do not earn higher returns from following the momentum strategy.",
		url: "https://doi.org/10.1111/j.1540-6261.1997.tb03808.x",
		publicationYear: 1997,
		citationCount: 7500,
	},

	// ============================================
	// Momentum & Market Anomalies
	// ============================================
	{
		paperId: "jegadeesh-titman-1993",
		title: "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency",
		authors: "Narasimhan Jegadeesh, Sheridan Titman",
		abstract:
			"This paper documents that strategies which buy stocks that have performed well in the past and sell stocks that have performed poorly in the past generate significant positive returns over 3- to 12-month holding periods. We find that the profitability of these strategies are not due to their systematic risk or to delayed stock price reactions to common factors.",
		url: "https://doi.org/10.1111/j.1540-6261.1993.tb04702.x",
		publicationYear: 1993,
		citationCount: 12000,
	},
	{
		paperId: "debondt-thaler-1985",
		title: "Does the Stock Market Overreact?",
		authors: "Werner F.M. De Bondt, Richard Thaler",
		abstract:
			"Research in experimental psychology suggests that, in violation of Bayes rule, most people tend to overreact to unexpected and dramatic news events. This study of market efficiency investigates whether such behavior affects stock prices. The empirical evidence, based on CRSP monthly return data, is consistent with the overreaction hypothesis. Substantial weak form market inefficiencies are discovered.",
		url: "https://doi.org/10.1111/j.1540-6261.1985.tb05004.x",
		publicationYear: 1985,
		citationCount: 8000,
	},
	{
		paperId: "asness-moskowitz-pedersen-2013",
		title: "Value and Momentum Everywhere",
		authors: "Clifford S. Asness, Tobias J. Moskowitz, Lasse Heje Pedersen",
		abstract:
			"We find consistent value and momentum return premia across eight diverse markets and asset classes, and a strong common factor structure among their returns. Value and momentum returns correlate more strongly across asset classes than passive exposures to the asset classes, but value and momentum are negatively correlated with each other, both within and across asset classes.",
		url: "https://doi.org/10.1111/jofi.12021",
		publicationYear: 2013,
		citationCount: 1355,
	},
	{
		paperId: "mclean-pontiff-2016",
		title: "Does Academic Research Destroy Stock Return Predictability?",
		authors: "R. David McLean, Jeffrey Pontiff",
		abstract:
			"We study the out-of-sample and post-publication return predictability of 97 variables shown to predict cross-sectional stock returns. Portfolio returns are 26% lower out-of-sample and 58% lower post-publication. The out-of-sample decline is similar in magnitude to post-publication declines, suggesting that the publication process reveals overfit signals.",
		url: "https://doi.org/10.1111/jofi.12365",
		publicationYear: 2016,
		citationCount: 1500,
	},

	// ============================================
	// Options Pricing & Volatility
	// ============================================
	{
		paperId: "black-scholes-1973",
		title: "The Pricing of Options and Corporate Liabilities",
		authors: "Fischer Black, Myron Scholes",
		abstract:
			"If options are correctly priced in the market, it should not be possible to make sure profits by creating portfolios of long and short positions in options and their underlying stocks. Using this principle, a theoretical valuation formula for options is derived.",
		url: "https://doi.org/10.1086/260062",
		publicationYear: 1973,
		citationCount: 35000,
	},
	{
		paperId: "merton-1973",
		title: "Theory of Rational Option Pricing",
		authors: "Robert C. Merton",
		abstract:
			"The long history of the theory of option pricing began in 1900 when the French mathematician Louis Bachelier deduced an option pricing formula based on the assumption that stock prices follow a Brownian motion with zero drift. This paper extends the Black-Scholes model to include cases of stochastic interest rates and shows how to price options when the underlying asset pays dividends.",
		url: "https://doi.org/10.2307/3003143",
		publicationYear: 1973,
		citationCount: 12000,
	},
	{
		paperId: "heston-1993",
		title: "A Closed-Form Solution for Options with Stochastic Volatility with Applications to Bond and Currency Options",
		authors: "Steven L. Heston",
		abstract:
			"I use a new technique to derive a closed-form solution for the price of a European call option on an asset with stochastic volatility. The model allows arbitrary correlation between volatility and spot-asset returns. I introduce stochastic interest rates and show how to apply the model to bond options and foreign currency options.",
		url: "https://doi.org/10.1093/rfs/6.2.327",
		publicationYear: 1993,
		citationCount: 10000,
	},
	{
		paperId: "engle-1982",
		title: "Autoregressive Conditional Heteroscedasticity with Estimates of the Variance of United Kingdom Inflation",
		authors: "Robert F. Engle",
		abstract:
			"Traditional econometric models assume a constant one-period forecast variance. To generalize this implausible assumption, a new class of stochastic processes called autoregressive conditional heteroscedastic (ARCH) processes are introduced. These are mean zero, serially uncorrelated processes with nonconstant variances conditional on the past, but constant unconditional variances.",
		url: "https://doi.org/10.2307/1912773",
		publicationYear: 1982,
		citationCount: 25000,
	},
	{
		paperId: "bollerslev-1986",
		title: "Generalized Autoregressive Conditional Heteroskedasticity",
		authors: "Tim Bollerslev",
		abstract:
			"A natural generalization of the ARCH (Autoregressive Conditional Heteroskedastic) process introduced in Engle (1982) to allow for past conditional variances in the current conditional variance equation is proposed. Stationarity conditions and autocorrelation structure for this new class of parametric models are derived. Maximum likelihood estimation and testing are also considered.",
		url: "https://doi.org/10.1016/0304-4076(86)90063-1",
		publicationYear: 1986,
		citationCount: 20000,
	},

	// ============================================
	// Market Microstructure & Execution
	// ============================================
	{
		paperId: "kyle-1985",
		title: "Continuous Auctions and Insider Trading",
		authors: "Albert S. Kyle",
		abstract:
			"A dynamic model of insider trading with sequential auctions, structured to resemble a sequential equilibrium, is used to examine the informational content of prices, the liquidity characteristics of a speculative market, and the value of private information to an insider. The analysis develops a theory of market depth and provides conditions under which markets are informationally efficient.",
		url: "https://doi.org/10.2307/1913210",
		publicationYear: 1985,
		citationCount: 10000,
	},
	{
		paperId: "almgren-chriss-2001",
		title: "Optimal Execution of Portfolio Transactions",
		authors: "Robert Almgren, Neil Chriss",
		abstract:
			"We consider the execution of portfolio transactions with the aim of minimizing a combination of volatility risk and transaction costs arising from permanent and temporary market impact. For a simple linear cost model, we explicitly construct the efficient frontier in the space of time-dependent liquidation strategies, which have minimum expected cost for a given level of risk.",
		url: "https://doi.org/10.21314/JOR.2001.041",
		publicationYear: 2001,
		citationCount: 3000,
	},
	{
		paperId: "avellaneda-stoikov-2008",
		title: "High-Frequency Trading in a Limit Order Book",
		authors: "Marco Avellaneda, Sasha Stoikov",
		abstract:
			"We study a stock dealer's strategy for submitting bid and ask quotes in a limit order book. The agent faces inventory risk due to the diffusive nature of the stock's mid-price and transactions risk due to a Poisson arrival of market orders. We derive the optimal bid and ask quotes by computing a personal indifference valuation for the stock given current inventory, then calibrating quotes to the market's limit order book.",
		url: "https://doi.org/10.1080/14697680701381228",
		publicationYear: 2008,
		citationCount: 528,
	},

	// ============================================
	// Behavioral Finance & Decision Making
	// ============================================
	{
		paperId: "kahneman-tversky-1979",
		title: "Prospect Theory: An Analysis of Decision under Risk",
		authors: "Daniel Kahneman, Amos Tversky",
		abstract:
			"This paper presents a critique of expected utility theory as a descriptive model of decision making under risk, and develops an alternative model, called prospect theory. Choices among risky prospects exhibit several pervasive effects that are inconsistent with the basic tenets of utility theory. People underweight outcomes that are merely probable in comparison with outcomes that are obtained with certainty.",
		url: "https://doi.org/10.2307/1914185",
		publicationYear: 1979,
		citationCount: 37000,
	},
	{
		paperId: "barberis-thaler-2003",
		title: "A Survey of Behavioral Finance",
		authors: "Nicholas Barberis, Richard Thaler",
		abstract:
			"Behavioral finance argues that some financial phenomena can be better understood using models in which some agents are not fully rational. We discuss two common themes in behavioral finance: limits to arbitrage and psychology.",
		url: "https://doi.org/10.1016/S1574-0102(03)01027-6",
		publicationYear: 2003,
		citationCount: 6000,
	},

	// ============================================
	// Risk Management
	// ============================================
	{
		paperId: "artzner-1999",
		title: "Coherent Measures of Risk",
		authors: "Philippe Artzner, Freddy Delbaen, Jean-Marc Eber, David Heath",
		abstract:
			"In this paper we study both market risks and nonmarket risks, without complete markets assumption, and propose a definition of coherent risk measures. We examine the measures of risk provided and the related actions required by banking regulators. We characterize coherent risk measures and present the representation theorem.",
		url: "https://doi.org/10.1111/1467-9965.00068",
		publicationYear: 1999,
		citationCount: 8000,
	},
	{
		paperId: "rockafellar-uryasev-2000",
		title: "Optimization of Conditional Value-at-Risk",
		authors: "R. Tyrrell Rockafellar, Stanislav Uryasev",
		abstract:
			"A new approach to optimizing or hedging a portfolio of financial instruments to reduce risk is presented and tested on applications. It focuses on minimizing Conditional Value-at-Risk (CVaR) rather than minimizing Value-at-Risk (VaR), but portfolios with low CVaR necessarily have low VaR as well. CVaR can be expressed as a linear programming problem for discrete distributions.",
		url: "https://doi.org/10.21314/JOR.2000.038",
		publicationYear: 2000,
		citationCount: 6000,
	},
	{
		paperId: "kelly-1956",
		title: "A New Interpretation of Information Rate",
		authors: "John L. Kelly Jr.",
		abstract:
			"If the input symbols to a communication channel represent the outcomes of a chance event on which bets are available at odds consistent with their probabilities, then the capacity of the channel can be related to the maximum rate of growth of the bettor's fortune. This maximum rate is achieved by a strategy that maximizes the expected value of the logarithm of wealth.",
		url: "https://doi.org/10.1002/j.1538-7305.1956.tb03809.x",
		publicationYear: 1956,
		citationCount: 3000,
	},

];

// ============================================
// Helper Functions
// ============================================

/**
 * Convert PaperInput to HelixDB AcademicPaper
 */
function toPaperNode(input: PaperInput): AcademicPaper {
	return {
		paper_id: input.paperId,
		title: input.title,
		authors: input.authors,
		paper_abstract: input.abstract,
		url: input.url,
		publication_year: input.publicationYear,
		citation_count: input.citationCount ?? 0,
	};
}

/**
 * Calculate relevance score for a paper
 * Used for ranking search results
 */
export function calculatePaperRelevanceScore(paper: PaperInput): number {
	let score = 0;

	// Citation count (log-scaled to prevent domination)
	if (paper.citationCount && paper.citationCount > 0) {
		score += Math.log10(paper.citationCount + 1) * 10;
	}

	// Recency bonus (papers < 5 years old)
	if (paper.publicationYear) {
		const currentYear = new Date().getFullYear();
		const age = currentYear - paper.publicationYear;
		if (age <= 5) {
			score += (5 - age) * 5; // Up to 25 points for very recent papers
		}
	}

	// Abstract quality (longer abstracts tend to be more informative)
	if (paper.abstract && paper.abstract.length > 200) {
		score += 5;
	}

	return Math.round(score * 100) / 100;
}

// ============================================
// Main Service Class
// ============================================

/**
 * Paper Ingestion Service
 *
 * Ingests academic papers into HelixDB with embeddings.
 */
export class PaperIngestionService {
	private embeddingClient: EmbeddingClient | null = null;

	constructor(private readonly client: HelixClient) {}

	/**
	 * Get or create embedding client (lazy initialization)
	 */
	private getEmbeddingClient(): EmbeddingClient {
		if (!this.embeddingClient) {
			this.embeddingClient = new EmbeddingClient(DEFAULT_EMBEDDING_CONFIG);
		}
		return this.embeddingClient;
	}

	/**
	 * Check if a paper already exists
	 */
	private async paperExists(paperId: string): Promise<boolean> {
		try {
			const result = await this.client.query<Array<{ paper_id: string }>>("GetPaperById", {
				paper_id: paperId,
			});
			return result.data.length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Upsert a single paper
	 */
	private async upsertPaper(
		paper: AcademicPaper,
		embedding?: number[]
	): Promise<{ success: boolean; error?: string }> {
		try {
			await this.client.query("InsertAcademicPaper", {
				paper_id: paper.paper_id,
				title: paper.title,
				authors: paper.authors,
				paper_abstract: paper.paper_abstract,
				url: paper.url ?? "",
				publication_year: paper.publication_year ?? 0,
				citation_count: paper.citation_count ?? 0,
				embedding,
				embedding_model_version: DEFAULT_EMBEDDING_CONFIG.model,
			});
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Ingest a batch of papers
	 */
	async ingestPapers(
		papers: PaperInput[],
		options: PaperIngestionOptions = {}
	): Promise<PaperIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];

		const { generateEmbeddings = true, checkDuplicates = true, batchSize = 20 } = options;

		if (papers.length === 0) {
			return {
				papersIngested: 0,
				duplicatesSkipped: 0,
				embeddingsGenerated: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
			};
		}

		// Step 1: Check for duplicates
		let papersToIngest = papers;
		let duplicatesSkipped = 0;

		if (checkDuplicates) {
			const uniquePapers: PaperInput[] = [];

			for (const paper of papers) {
				const exists = await this.paperExists(paper.paperId);
				if (exists) {
					duplicatesSkipped++;
				} else {
					uniquePapers.push(paper);
				}
			}

			papersToIngest = uniquePapers;

			if (duplicatesSkipped > 0) {
				warnings.push(`Skipped ${duplicatesSkipped} existing papers`);
			}
		}

		if (papersToIngest.length === 0) {
			return {
				papersIngested: 0,
				duplicatesSkipped,
				embeddingsGenerated: 0,
				executionTimeMs: performance.now() - startTime,
				warnings,
				errors: [],
			};
		}

		// Step 2: Convert to HelixDB format
		const paperNodes = papersToIngest.map(toPaperNode);

		// Step 3: Generate embeddings from abstracts
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = papersToIngest.map((p) => `${p.title}\n\n${p.abstract}`);
				const validTexts = textsToEmbed.filter((t) => t.length > 10);

				if (validTexts.length > 0) {
					const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

					let validIndex = 0;
					for (let i = 0; i < textsToEmbed.length; i++) {
						const text = textsToEmbed[i];
						if (text && text.length > 10) {
							const embedding = result.embeddings[validIndex];
							const paper = papersToIngest[i];
							if (embedding && paper) {
								embeddings.set(paper.paperId, embedding.values);
								embeddingsGenerated++;
							}
							validIndex++;
						}
					}
				}
			} catch (error) {
				warnings.push(
					`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		}

		// Step 4: Upsert papers
		let papersIngested = 0;

		for (let i = 0; i < paperNodes.length; i += batchSize) {
			const batch = paperNodes.slice(i, i + batchSize);

			for (const paper of batch) {
				const embedding = embeddings.get(paper.paper_id);
				const result = await this.upsertPaper(paper, embedding);

				if (result.success) {
					papersIngested++;
				} else {
					errors.push(`Failed to ingest ${paper.paper_id}: ${result.error}`);
				}
			}
		}

		return {
			papersIngested,
			duplicatesSkipped,
			embeddingsGenerated,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
		};
	}

	/**
	 * Ingest a single paper
	 */
	async ingestPaper(
		paper: PaperInput,
		options: PaperIngestionOptions = {}
	): Promise<PaperIngestionResult> {
		return this.ingestPapers([paper], options);
	}

	/**
	 * Ingest the seed papers (foundational research)
	 */
	async ingestSeedPapers(): Promise<PaperIngestionResult> {
		return this.ingestPapers(SEED_PAPERS);
	}

	/**
	 * Search for similar papers by text query
	 */
	async searchPapers(
		queryText: string,
		limit = 10
	): Promise<
		Array<{
			paperId: string;
			title: string;
			authors: string;
			similarity: number;
			citationCount: number;
		}>
	> {
		try {
			const result = await this.client.query<
				Array<{
					paper_id: string;
					title: string;
					authors: string;
					similarity: number;
					citation_count: number;
				}>
			>("SearchAcademicPapers", { query_text: queryText, limit });

			return result.data.map((r) => ({
				paperId: r.paper_id,
				title: r.title,
				authors: r.authors,
				similarity: r.similarity,
				citationCount: r.citation_count,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get a paper by ID
	 */
	async getPaperById(paperId: string): Promise<{
		paperId: string;
		title: string;
		authors: string;
		abstract: string;
		url?: string;
		publicationYear?: number;
		citationCount: number;
	} | null> {
		try {
			const result = await this.client.query<
				Array<{
					paper_id: string;
					title: string;
					authors: string;
					paper_abstract: string;
					url: string;
					publication_year: number;
					citation_count: number;
				}>
			>("GetPaperById", { paper_id: paperId });

			if (result.data.length === 0) {
				return null;
			}

			const paper = result.data[0];
			return paper
				? {
						paperId: paper.paper_id,
						title: paper.title,
						authors: paper.authors,
						abstract: paper.paper_abstract,
						url: paper.url || undefined,
						publicationYear: paper.publication_year || undefined,
						citationCount: paper.citation_count,
					}
				: null;
		} catch {
			return null;
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a PaperIngestionService instance
 */
export function createPaperIngestionService(client: HelixClient): PaperIngestionService {
	return new PaperIngestionService(client);
}

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
	toPaperNode,
	calculatePaperRelevanceScore,
};
