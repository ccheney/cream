/**
 * Morning Newspaper Service
 *
 * Compiles overnight MacroWatchEntries into a concise digest for
 * injection into the OODA Orient phase before market open.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";
import type {
	CreateMorningNewspaperInput,
	MacroWatchEntry,
	NewspaperSections,
} from "@cream/storage";

const log = createNodeLogger({ service: "newspaper", level: "info" });

// ============================================
// Types
// ============================================

/**
 * Compiled newspaper content ready for LLM consumption
 */
export interface NewspaperContent {
	date: string;
	compiledAt: string;
	summary: string;
	sections: {
		macro: string;
		universe: string;
		predictionMarkets: string;
		economicCalendar: string;
	};
	entryCount: number;
}

// ============================================
// Newspaper Compiler
// ============================================

/**
 * Compile overnight entries into a morning newspaper.
 *
 * @param entries - MacroWatchEntry records from overnight
 * @param universeSymbols - Current trading universe for filtering
 * @returns Compiled newspaper sections
 */
export function compileNewspaper(
	entries: MacroWatchEntry[],
	universeSymbols: string[]
): NewspaperSections {
	const universeSet = new Set(universeSymbols.map((s) => s.toUpperCase()));

	// Categorize entries
	const newsEntries = entries.filter((e) => e.category === "NEWS");
	const predictionEntries = entries.filter((e) => e.category === "PREDICTION");
	const economicEntries = entries.filter((e) => e.category === "ECONOMIC");
	const moverEntries = entries.filter((e) => e.category === "MOVER");

	// Build macro section (market-wide news)
	const macroHeadlines = newsEntries
		.filter((e) => !e.symbols.some((s) => universeSet.has(s.toUpperCase())))
		.slice(0, 5)
		.map((e) => `• ${e.headline} [${e.source}]`);

	// Build universe section (news about holdings)
	const universeHeadlines = newsEntries
		.filter((e) => e.symbols.some((s) => universeSet.has(s.toUpperCase())))
		.slice(0, 10)
		.map((e) => `• ${e.symbols.join(", ")}: ${e.headline}`);

	// Add mover entries for universe symbols
	const universeMovers = moverEntries
		.filter((e) => e.symbols.some((s) => universeSet.has(s.toUpperCase())))
		.slice(0, 5)
		.map((e) => `• ${e.headline}`);

	// Build prediction markets section
	// Prefer comprehensive summaries over individual entries
	const predictionHeadlines: string[] = [];

	// First, check for a comprehensive summary entry
	const comprehensiveEntry = predictionEntries.find((e) => {
		const metadata = e.metadata as Record<string, unknown> | undefined;
		return metadata?.isComprehensive === true;
	});

	if (comprehensiveEntry) {
		// Use the comprehensive summary with detailed breakdown
		const metadata = comprehensiveEntry.metadata as Record<string, unknown>;
		predictionHeadlines.push(`• ${comprehensiveEntry.headline}`);
		if (typeof metadata.details === "string") {
			const details = metadata.details.split("\n").filter((l: string) => l.trim());
			for (const detail of details) {
				predictionHeadlines.push(detail);
			}
		}
	} else {
		// Fallback: use individual entries (legacy behavior)
		// Deduplicate by headline to avoid duplicates
		const seenHeadlines = new Set<string>();
		for (const entry of predictionEntries.slice(0, 5)) {
			if (!seenHeadlines.has(entry.headline)) {
				seenHeadlines.add(entry.headline);
				predictionHeadlines.push(`• ${entry.headline}`);
			}
		}
	}

	// Build economic calendar section
	const economicHeadlines = economicEntries.slice(0, 5).map((e) => `• ${e.headline}`);

	return {
		macro: macroHeadlines.length > 0 ? macroHeadlines : ["No significant macro developments"],
		universe:
			[...universeHeadlines, ...universeMovers].length > 0
				? [...universeHeadlines, ...universeMovers]
				: ["No significant universe developments"],
		predictionMarkets:
			predictionHeadlines.length > 0
				? predictionHeadlines
				: ["No significant prediction market changes"],
		economicCalendar:
			economicHeadlines.length > 0 ? economicHeadlines : ["No economic releases expected today"],
	};
}

/**
 * Format newspaper sections for LLM consumption.
 *
 * @param sections - Compiled newspaper sections
 * @returns Formatted text ready for prompt injection
 */
export function formatNewspaperForLLM(sections: NewspaperSections): string {
	return `## Morning Newspaper: Overnight Market Developments

### Macro Headlines
${sections.macro.join("\n")}

### Universe News (Holdings & Watchlist)
${sections.universe.join("\n")}

### Prediction Markets
${sections.predictionMarkets.join("\n")}

### Economic Calendar
${sections.economicCalendar.join("\n")}
`;
}

/**
 * Create a NewspaperContent object from entries.
 *
 * @param entries - MacroWatchEntry records
 * @param universeSymbols - Trading universe symbols
 * @returns NewspaperContent ready for storage or LLM
 */
export function createNewspaperContent(
	entries: MacroWatchEntry[],
	universeSymbols: string[]
): NewspaperContent {
	const sections = compileNewspaper(entries, universeSymbols);
	const formattedSections = {
		macro: sections.macro.join("\n"),
		universe: sections.universe.join("\n"),
		predictionMarkets: sections.predictionMarkets.join("\n"),
		economicCalendar: sections.economicCalendar.join("\n"),
	};

	const now = new Date();
	const date = now.toISOString().slice(0, 10);

	return {
		date,
		compiledAt: now.toISOString(),
		summary: formatNewspaperForLLM(sections),
		sections: formattedSections,
		entryCount: entries.length,
	};
}

/**
 * Prepare newspaper for database storage.
 *
 * @param entries - MacroWatchEntry records
 * @param universeSymbols - Trading universe symbols
 * @returns Input ready for MacroWatchRepository.saveNewspaper()
 */
export function prepareNewspaperForStorage(
	entries: MacroWatchEntry[],
	universeSymbols: string[]
): CreateMorningNewspaperInput {
	const sections = compileNewspaper(entries, universeSymbols);
	const now = new Date();
	const date = now.toISOString().slice(0, 10);

	// id is auto-generated as uuidv7 by database - omit to let DB handle it
	return {
		date,
		compiledAt: now.toISOString(),
		sections,
		rawEntryIds: entries.map((e) => e.id),
	};
}

// ============================================
// Runner Function
// ============================================

/**
 * Compile the morning newspaper from overnight entries.
 *
 * This is the primary entry point for newspaper compilation, typically
 * called near market open (9:00-9:30 AM ET).
 *
 * @param entries - Overnight MacroWatchEntry records
 * @param universeSymbols - Current trading universe
 * @returns Compiled newspaper content and storage input
 */
export function compileMorningNewspaper(
	entries: MacroWatchEntry[],
	universeSymbols: string[]
): {
	content: NewspaperContent;
	storageInput: CreateMorningNewspaperInput;
} {
	log.info(
		{
			entryCount: entries.length,
			universeSize: universeSymbols.length,
		},
		"Compiling morning newspaper"
	);

	const content = createNewspaperContent(entries, universeSymbols);
	const storageInput = prepareNewspaperForStorage(entries, universeSymbols);

	log.info(
		{
			date: content.date,
			entryCount: content.entryCount,
		},
		"Morning newspaper compiled"
	);

	return { content, storageInput };
}
