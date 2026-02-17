/**
 * Parser Tests: FRED Observations
 */

import { expect, it } from "bun:test";
import { parseFREDObservations } from "../src/index.js";

it("should parse valid observations", () => {
	const observations = [
		{ date: "2024-12-01", value: "315.605" },
		{ date: "2024-11-01", value: "314.123" },
	];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(2);
	const first = releases[0];
	if (first) {
		expect(first.indicator).toBe("CPI All Urban Consumers");
		expect(first.value).toBe(315.605);
		expect(first.previousValue).toBe(314.123);
		expect(first.source).toBe("FRED:CPIAUCSL");
		expect(first.unit).toBe("index");
	}
});

it("should use custom metadata when provided", () => {
	const observations = [{ date: "2024-12-01", value: "100.5" }];

	const releases = parseFREDObservations("CUSTOM", observations, {
		name: "Custom Indicator",
		unit: "custom_unit",
	});

	expect(releases).toHaveLength(1);
	const first = releases[0];
	if (first) {
		expect(first.indicator).toBe("Custom Indicator");
		expect(first.unit).toBe("custom_unit");
	}
});

it("should skip missing values marked with '.'", () => {
	const observations = [
		{ date: "2024-12-01", value: "." },
		{ date: "2024-11-01", value: "314.123" },
	];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(1);
	const first = releases[0];
	if (first) {
		expect(first.value).toBe(314.123);
	}
});

it("should skip empty string values", () => {
	const observations = [
		{ date: "2024-12-01", value: "" },
		{ date: "2024-11-01", value: "314.123" },
	];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(1);
});

it("should skip NaN values", () => {
	const observations = [
		{ date: "2024-12-01", value: "not-a-number" },
		{ date: "2024-11-01", value: "314.123" },
	];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(1);
	expect(releases[0]?.value).toBe(314.123);
});

it("should return empty array for empty observations", () => {
	const releases = parseFREDObservations("CPIAUCSL", []);
	expect(releases).toHaveLength(0);
});

it("should handle single observation without previousValue", () => {
	const observations = [{ date: "2024-12-01", value: "315.605" }];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(1);
	const first = releases[0];
	if (first) {
		expect(first.value).toBe(315.605);
		expect(first.previousValue).toBeUndefined();
	}
});

it("should skip to next valid observation for previousValue", () => {
	const observations = [
		{ date: "2024-12-01", value: "316.0" },
		{ date: "2024-11-01", value: "." }, // Skip this
		{ date: "2024-10-01", value: "314.0" },
	];

	const releases = parseFREDObservations("CPIAUCSL", observations);

	expect(releases).toHaveLength(2);
	const first = releases[0];
	if (first) {
		expect(first.value).toBe(316.0);
		expect(first.previousValue).toBe(314.0); // Should skip '.' and use 314.0
	}
});

it("should use seriesId when no metadata found", () => {
	const observations = [{ date: "2024-12-01", value: "100" }];

	const releases = parseFREDObservations("UNKNOWN_SERIES", observations);

	expect(releases).toHaveLength(1);
	const first = releases[0];
	if (first) {
		expect(first.indicator).toBe("UNKNOWN_SERIES");
		expect(first.unit).toBeUndefined();
	}
});
