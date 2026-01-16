/**
 * Macro Watch Context
 *
 * Services for overnight market scanning and morning newspaper compilation.
 */

export {
	createMacroWatchService,
	type MacroWatchResult,
	MacroWatchService,
	type MacroWatchServiceConfig,
} from "./macro-watch-service.js";

export {
	createNewspaperService,
	type NewspaperCompileResult,
	NewspaperService,
	type NewspaperServiceConfig,
} from "./newspaper-service.js";
