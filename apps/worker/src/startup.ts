import type { RuntimeEnvironment } from "@cream/config";
import {
	type CreamEnvironment,
	createContext,
	initCalendarService,
	isTest,
	validateEnvironmentOrExit,
} from "@cream/domain";

import { log, validateHelixDBOrExit } from "./shared/index.js";
import { toErrorMessage } from "./worker-utils.js";

export async function validateStartup(environment: RuntimeEnvironment): Promise<void> {
	const startupCtx = createContext(environment, "scheduled");
	if (!isTest(startupCtx)) {
		validateEnvironmentOrExit(startupCtx, "worker", []);
		if (!Bun.env.GOOGLE_GENERATIVE_AI_API_KEY) {
			log.warn(
				{},
				"GOOGLE_GENERATIVE_AI_API_KEY not configured. Agent execution will use stub agents.",
			);
		}
	}
	await validateHelixDBOrExit(startupCtx);
}

export function initializeCalendar(environment: RuntimeEnvironment): void {
	initCalendarService({
		mode: environment as CreamEnvironment,
		alpacaKey: Bun.env.ALPACA_KEY,
		alpacaSecret: Bun.env.ALPACA_SECRET,
	})
		.then(() => log.info({ mode: environment }, "CalendarService initialized"))
		.catch((error: unknown) => {
			log.warn(
				{ error: toErrorMessage(error), mode: environment },
				"CalendarService initialization failed, using fallback",
			);
		});
}
