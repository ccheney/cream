/**
 * SEC EDGAR Client
 *
 * Wrapper around sec-edgar-toolkit providing a simplified interface
 * for fetching SEC filings.
 */

import {
	type CompanyTicker,
	EdgarClient as ToolkitClient,
	type EdgarClientConfig as ToolkitConfig,
} from "sec-edgar-toolkit";
import type { Company, Filing, FilingType } from "./types.js";

// ============================================
// Configuration
// ============================================

export interface EdgarClientConfig {
	/** User-Agent string for SEC API requests. Required by SEC. */
	userAgent?: string;
	/** Delay between requests in seconds. Default: 0.1 (100ms) */
	rateLimitDelay?: number;
	/** Request timeout in milliseconds. Default: 30000 */
	timeout?: number;
}

function getDefaultUserAgent(): string {
	if (!Bun.env.OPERATOR_EMAIL) {
		throw new Error("OPERATOR_EMAIL environment variable is required for SEC EDGAR API requests");
	}
	return `Cream/1.0 (${Bun.env.OPERATOR_EMAIL})`;
}

// ============================================
// Parameters
// ============================================

export interface GetFilingsParams {
	/** Ticker symbol or CIK */
	tickerOrCik: string;
	/** Filter by filing types */
	filingTypes?: FilingType[];
	/** Start date (inclusive) */
	startDate?: Date;
	/** End date (inclusive) */
	endDate?: Date;
	/** Maximum number of filings to return */
	limit?: number;
}

// ============================================
// Client Class
// ============================================

/**
 * SEC EDGAR API client.
 *
 * @example
 * ```typescript
 * const client = new EdgarClient();
 * const company = await client.lookupCompany("AAPL");
 * const filings = await client.getFilings({ tickerOrCik: "AAPL", filingTypes: ["10-K"], limit: 5 });
 * const html = await client.getFilingHtml(filings[0]);
 * ```
 */
export class EdgarClient {
	private client: ToolkitClient;

	constructor(config?: EdgarClientConfig) {
		const toolkitConfig: ToolkitConfig = {
			userAgent: config?.userAgent ?? getDefaultUserAgent(),
			rateLimitDelay: config?.rateLimitDelay ?? 0.1,
			timeout: config?.timeout ?? 30000,
		};
		this.client = new ToolkitClient(toolkitConfig);
	}

	/**
	 * Look up a company by ticker or CIK.
	 *
	 * @param tickerOrCik - Ticker symbol (e.g., "AAPL") or CIK (e.g., "0000320193")
	 * @returns Company if found, null otherwise
	 */
	async lookupCompany(tickerOrCik: string): Promise<Company | null> {
		// Try ticker lookup first
		let companyTicker: CompanyTicker | null = null;

		if (/^\d+$/.test(tickerOrCik)) {
			// It's a CIK
			companyTicker = await this.client.getCompanyByCik(tickerOrCik);
		} else {
			// It's a ticker
			companyTicker = await this.client.getCompanyByTicker(tickerOrCik);
		}

		if (!companyTicker) {
			return null;
		}

		return {
			cik: companyTicker.cik_str,
			name: companyTicker.title,
			ticker: companyTicker.ticker || undefined,
			exchange: companyTicker.exchange || undefined,
		};
	}

	/**
	 * Get filings for a company with optional filtering.
	 *
	 * @param params - Query parameters
	 * @returns Array of filings matching the criteria
	 */
	async getFilings(params: GetFilingsParams): Promise<Filing[]> {
		const company = await this.lookupCompany(params.tickerOrCik);
		if (!company) {
			throw new Error(`Company not found: ${params.tickerOrCik}`);
		}

		const submissions = await this.client.getCompanySubmissions(company.cik);
		const recentFilings = submissions.filings?.recent;

		if (!recentFilings) {
			throw new Error(`No filings found for company: ${params.tickerOrCik}`);
		}

		const filings: Filing[] = [];
		const forms = recentFilings.form as string[] | undefined;
		const accessionNumbers = recentFilings.accessionNumber as string[] | undefined;
		const filingDates = recentFilings.filingDate as string[] | undefined;
		const primaryDocuments = recentFilings.primaryDocument as string[] | undefined;

		if (!forms || !accessionNumbers || !filingDates) {
			throw new Error(`Invalid filing data structure for company: ${params.tickerOrCik}`);
		}

		const formTypeSet = params.filingTypes ? new Set(params.filingTypes) : null;

		for (let i = 0; i < forms.length; i++) {
			// Check limit
			if (params.limit && filings.length >= params.limit) {
				break;
			}

			const formType = forms[i];
			const accessionNumber = accessionNumbers[i];
			const filedDateStr = filingDates[i];

			// Skip if missing required fields
			if (!formType || !accessionNumber || !filedDateStr) {
				continue;
			}

			// Filter by form type
			if (formTypeSet && !formTypeSet.has(formType as FilingType)) {
				continue;
			}

			// Parse date
			const filedDate = new Date(filedDateStr);

			// Filter by date range
			if (params.startDate && filedDate < params.startDate) {
				continue;
			}
			if (params.endDate && filedDate > params.endDate) {
				continue;
			}

			filings.push({
				accessionNumber,
				filingType: formType as FilingType,
				filedDate,
				company,
				primaryDocument: primaryDocuments?.[i] ?? `${accessionNumber}.htm`,
			});
		}

		return filings;
	}

	/**
	 * Get the HTML content of a filing.
	 *
	 * @param filing - The filing to fetch HTML for
	 * @returns HTML content as a string
	 */
	async getFilingHtml(filing: Filing): Promise<string> {
		const url = this.getFilingUrl(filing);
		const response = await fetch(url, {
			headers: {
				"User-Agent": getDefaultUserAgent(),
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch filing: ${response.status} ${response.statusText}`);
		}

		return response.text();
	}

	/**
	 * Get the download URL for a filing.
	 *
	 * @param filing - The filing
	 * @returns SEC Archives URL for the filing
	 */
	getFilingUrl(filing: Filing): string {
		const cikUnpadded = filing.company.cik.replace(/^0+/, "");
		const accessionClean = filing.accessionNumber.replace(/-/g, "");
		return `https://www.sec.gov/Archives/edgar/data/${cikUnpadded}/${accessionClean}/${filing.primaryDocument}`;
	}
}
