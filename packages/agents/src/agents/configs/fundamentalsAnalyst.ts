/**
 * Fundamentals Analyst Agent Configuration
 */

import type { AgentConfig } from "../../types.js";

export const FUNDAMENTALS_ANALYST_CONFIG: AgentConfig = {
	type: "fundamentals_analyst",
	name: "Fundamentals & Macro Analyst",
	role: "Assess fundamental valuation and macroeconomic context for trading decisions",
	personality: [
		"Rigorous about data quality",
		"Separates facts from interpretation",
		"Sector-aware analysis",
		"Forward-looking on event risks",
	],
	tools: [
		"fredEconomicCalendar",
		"graphragQuery",
		"analyzeContent",
		"helixQuery",
		"getPredictionSignals",
		"getMarketSnapshots",
	],
};
