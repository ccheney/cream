/**
 * Error thrown when calendar data is not available.
 */
export class CalendarServiceError extends Error {
	constructor(
		message: string,
		public readonly code: "NOT_INITIALIZED" | "API_UNAVAILABLE" | "CACHE_MISS",
	) {
		super(message);
		this.name = "CalendarServiceError";
	}
}
