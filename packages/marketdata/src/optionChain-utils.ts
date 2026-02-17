import type { OptionType } from "./optionChain-types.js";

/**
 * Calculate days to expiration from date string.
 */
export function calculateDte(expirationDate: string): number {
	const expDate = new Date(expirationDate);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Parse option ticker to components.
 * Standard OCC format: AAPL240119C00150000
 */
export function parseOptionTicker(ticker: string):
	| {
			underlying: string;
			expiration: string;
			type: OptionType;
			strike: number;
	  }
	| undefined {
	const match = ticker.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
	if (!match) {
		return undefined;
	}

	const underlying = match[1];
	const expStr = match[2];
	const typeChar = match[3];
	const strikeStr = match[4];

	if (!underlying || !expStr || !typeChar || !strikeStr) {
		return undefined;
	}

	const year = 2000 + Number.parseInt(expStr.slice(0, 2), 10);
	const month = expStr.slice(2, 4);
	const day = expStr.slice(4, 6);

	return {
		underlying,
		expiration: `${year}-${month}-${day}`,
		type: typeChar === "C" ? "call" : "put",
		strike: Number.parseInt(strikeStr, 10) / 1000,
	};
}

/**
 * Build option ticker from components.
 */
export function buildOptionTicker(
	underlying: string,
	expiration: string,
	type: OptionType,
	strike: number,
): string {
	const date = new Date(expiration);
	const yy = String(date.getFullYear()).slice(2);
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");

	const typeChar = type === "call" ? "C" : "P";
	const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");

	return `${underlying}${yy}${mm}${dd}${typeChar}${strikeStr}`;
}
