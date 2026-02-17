import { calculateGreeks } from "./greeks";

export function blackScholesPrice(
	S: number,
	K: number,
	T: number,
	r: number,
	sigma: number,
	optionType: "CALL" | "PUT",
): number {
	const greeks = calculateGreeks({
		symbol: "TEST",
		contracts: 1,
		strike: K,
		underlyingPrice: S,
		timeToExpiration: T,
		impliedVolatility: sigma,
		optionType,
		riskFreeRate: r,
	});
	return greeks.theoreticalPrice;
}
