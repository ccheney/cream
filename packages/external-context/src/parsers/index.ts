/**
 * Parsers Index
 *
 * Re-exports all parser functions and types.
 */

export {
  parseNewsArticles,
  parseNewsArticle,
  filterRecentNews,
  filterNewsBySymbols,
  type NewsParserConfig,
} from "./newsParser.js";

export {
  parseTranscript,
  extractTranscriptSections,
  getExecutiveComments,
  type TranscriptParserConfig,
} from "./transcriptParser.js";

export {
  parseAlphaVantageIndicator,
  parseFMPEconomicEvents,
  calculateMacroSurprise,
  isMacroReleaseSignificant,
  filterRecentMacroReleases,
  groupByIndicator,
  MACRO_INDICATORS,
  type MacroIndicatorType,
  type AlphaVantageEconomicIndicator,
  type FMPEconomicEvent,
} from "./macroParser.js";
