import { expect, test } from "bun:test";

import { normalCDF, normalPDF } from "./greeks";
import { expectApprox } from "./greeks.test-helpers";

test("normalCDF returns 0.5 for x=0", () => {
	expectApprox(normalCDF(0), 0.5);
});

test("normalCDF returns 0.8413 for x=1", () => {
	expectApprox(normalCDF(1), 0.8413, 0.001);
});

test("normalCDF returns 0.9772 for x=2", () => {
	expectApprox(normalCDF(2), 0.9772, 0.001);
});

test("normalCDF returns 0.1587 for x=-1", () => {
	expectApprox(normalCDF(-1), 0.1587, 0.001);
});

test("normalCDF is symmetric around zero", () => {
	expect(normalCDF(1) + normalCDF(-1)).toBeCloseTo(1, 5);
});

test("normalPDF returns 0.3989 for x=0", () => {
	expectApprox(normalPDF(0), 0.3989, 0.001);
});

test("normalPDF returns 0.2420 for x=1", () => {
	expectApprox(normalPDF(1), 0.242, 0.001);
});

test("normalPDF is symmetric around zero", () => {
	expect(normalPDF(1)).toBeCloseTo(normalPDF(-1), 10);
});
