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

const EMPTY_SECTIONS = {
	macro: ["No significant macro developments"],
	universe: ["No significant universe developments"],
	predictionMarkets: ["No significant prediction market changes"],
	economicCalendar: ["No economic releases expected today"],
} as const;

interface CategorizedEntries {
	news: MacroWatchEntry[];
	prediction: MacroWatchEntry[];
	economic: MacroWatchEntry[];
	movers: MacroWatchEntry[];
}

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

function buildUniverseSet(universeSymbols: string[]): Set<string> {
	return new Set(universeSymbols.map((symbol) => symbol.toUpperCase()));
}

function categorizeEntries(entries: MacroWatchEntry[]): CategorizedEntries {
	return {
		news: entries.filter((entry) => entry.category === "NEWS"),
		prediction: entries.filter((entry) => entry.category === "PREDICTION"),
		economic: entries.filter((entry) => entry.category === "ECONOMIC"),
		movers: entries.filter((entry) => entry.category === "MOVER"),
	};
}

function mentionsUniverse(entry: MacroWatchEntry, universeSet: Set<string>): boolean {
	return entry.symbols.some((symbol) => universeSet.has(symbol.toUpperCase()));
}

function withFallback(lines: string[], fallback: string): string[] {
	return lines.length > 0 ? lines : [fallback];
}

function buildMacroHeadlines(newsEntries: MacroWatchEntry[], universeSet: Set<string>): string[] {
	return newsEntries
		.filter((entry) => !mentionsUniverse(entry, universeSet))
		.slice(0, 5)
		.map((entry) => `• ${entry.headline} [${entry.source}]`);
}

function buildUniverseHeadlines(
	newsEntries: MacroWatchEntry[],
	universeSet: Set<string>,
): string[] {
	return newsEntries
		.filter((entry) => mentionsUniverse(entry, universeSet))
		.slice(0, 10)
		.map((entry) => `• ${entry.symbols.join(", ")}: ${entry.headline}`);
}

function buildUniverseMovers(moverEntries: MacroWatchEntry[], universeSet: Set<string>): string[] {
	return moverEntries
		.filter((entry) => mentionsUniverse(entry, universeSet))
		.slice(0, 5)
		.map((entry) => `• ${entry.headline}`);
}

function findComprehensivePredictionEntry(entries: MacroWatchEntry[]): MacroWatchEntry | undefined {
	return entries.find((entry) => {
		const metadata = entry.metadata as Record<string, unknown> | undefined;
		return metadata?.isComprehensive === true;
	});
}

function buildComprehensivePredictionHeadlines(entry: MacroWatchEntry): string[] {
	const metadata = entry.metadata as Record<string, unknown> | undefined;
	const detailLines =
		typeof metadata?.details === "string"
			? metadata.details
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
			: [];
	return [`• ${entry.headline}`, ...detailLines];
}

function buildLegacyPredictionHeadlines(entries: MacroWatchEntry[]): string[] {
	const headlines: string[] = [];
	const seenHeadlines = new Set<string>();
	for (const entry of entries.slice(0, 5)) {
		if (seenHeadlines.has(entry.headline)) {
			continue;
		}
		seenHeadlines.add(entry.headline);
		headlines.push(`• ${entry.headline}`);
	}
	return headlines;
}

function buildPredictionHeadlines(entries: MacroWatchEntry[]): string[] {
	const comprehensiveEntry = findComprehensivePredictionEntry(entries);
	if (comprehensiveEntry) {
		return buildComprehensivePredictionHeadlines(comprehensiveEntry);
	}
	return buildLegacyPredictionHeadlines(entries);
}

function buildEconomicHeadlines(entries: MacroWatchEntry[]): string[] {
	return entries.slice(0, 5).map((entry) => `• ${entry.headline}`);
}

/**
 * Compile overnight entries into a morning newspaper.
 *
 * @param entries - MacroWatchEntry records from overnight
 * @param universeSymbols - Current trading universe for filtering
 * @returns Compiled newspaper sections
 */
export function compileNewspaper(
	entries: MacroWatchEntry[],
	universeSymbols: string[],
): NewspaperSections {
	const universeSet = buildUniverseSet(universeSymbols);
	const categorized = categorizeEntries(entries);
	const macro = buildMacroHeadlines(categorized.news, universeSet);
	const universe = [
		...buildUniverseHeadlines(categorized.news, universeSet),
		...buildUniverseMovers(categorized.movers, universeSet),
	];
	const predictionMarkets = buildPredictionHeadlines(categorized.prediction);
	const economicCalendar = buildEconomicHeadlines(categorized.economic);

	return {
		macro: withFallback(macro, EMPTY_SECTIONS.macro[0]),
		universe: withFallback(universe, EMPTY_SECTIONS.universe[0]),
		predictionMarkets: withFallback(predictionMarkets, EMPTY_SECTIONS.predictionMarkets[0]),
		economicCalendar: withFallback(economicCalendar, EMPTY_SECTIONS.economicCalendar[0]),
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
	universeSymbols: string[],
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
	universeSymbols: string[],
): CreateMorningNewspaperInput {
	const sections = compileNewspaper(entries, universeSymbols);
	const now = new Date();
	const date = now.toISOString().slice(0, 10);

	// id is auto-generated as uuidv7 by database - omit to let DB handle it
	return {
		date,
		compiledAt: now.toISOString(),
		sections,
		rawEntryIds: entries.map((entry) => entry.id).filter((id): id is string => id !== undefined),
	};
}

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
	universeSymbols: string[],
): {
	content: NewspaperContent;
	storageInput: CreateMorningNewspaperInput;
} {
	log.info(
		{
			entryCount: entries.length,
			universeSize: universeSymbols.length,
		},
		"Compiling morning newspaper",
	);

	const content = createNewspaperContent(entries, universeSymbols);
	const storageInput = prepareNewspaperForStorage(entries, universeSymbols);

	log.info(
		{
			date: content.date,
			entryCount: content.entryCount,
		},
		"Morning newspaper compiled",
	);

	return { content, storageInput };
}
