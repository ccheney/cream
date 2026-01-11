/**
 * Tests for VALIDATION_DEFAULTS configuration.
 */

import { describe, expect, test } from "bun:test";
import { VALIDATION_DEFAULTS } from "../../../src/synthesis/validationPipeline/index.js";

describe("VALIDATION_DEFAULTS", () => {
  test("has expected thresholds", () => {
    expect(VALIDATION_DEFAULTS.dsrPValueThreshold).toBe(0.95);
    expect(VALIDATION_DEFAULTS.pboThreshold).toBe(0.5);
    expect(VALIDATION_DEFAULTS.icMeanThreshold).toBe(0.02);
    expect(VALIDATION_DEFAULTS.icStdThreshold).toBe(0.03);
    expect(VALIDATION_DEFAULTS.wfEfficiencyThreshold).toBe(0.5);
    expect(VALIDATION_DEFAULTS.maxCorrelation).toBe(0.7);
    expect(VALIDATION_DEFAULTS.maxVIF).toBe(5.0);
  });
});
