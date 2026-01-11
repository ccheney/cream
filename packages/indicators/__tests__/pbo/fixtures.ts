/**
 * Shared fixtures and test data for PBO tests
 */

import type { PBOResult } from "../../src/synthesis/pbo.js";

/**
 * Creates a PBO result fixture for testing evaluation functions
 */
export function createPBOResult(overrides: Partial<PBOResult> = {}): PBOResult {
  return {
    pbo: 0.35,
    nCombinations: 70,
    nUnderperformed: 25,
    meanInSampleSharpe: 1.5,
    meanOutOfSampleSharpe: 1.1,
    stdInSampleSharpe: 0.3,
    stdOutOfSampleSharpe: 0.4,
    degradation: 0.27,
    interpretation: "moderate_risk",
    passed: true,
    ...overrides,
  };
}

/**
 * Low risk PBO result fixture
 */
export const LOW_RISK_RESULT: PBOResult = {
  pbo: 0.2,
  nCombinations: 70,
  nUnderperformed: 14,
  meanInSampleSharpe: 1.5,
  meanOutOfSampleSharpe: 1.3,
  stdInSampleSharpe: 0.3,
  stdOutOfSampleSharpe: 0.35,
  degradation: 0.13,
  interpretation: "low_risk",
  passed: true,
};

/**
 * Moderate risk PBO result fixture
 */
export const MODERATE_RISK_RESULT: PBOResult = {
  pbo: 0.4,
  nCombinations: 70,
  nUnderperformed: 28,
  meanInSampleSharpe: 1.5,
  meanOutOfSampleSharpe: 1.0,
  stdInSampleSharpe: 0.3,
  stdOutOfSampleSharpe: 0.4,
  degradation: 0.33,
  interpretation: "moderate_risk",
  passed: true,
};

/**
 * High risk PBO result fixture
 */
export const HIGH_RISK_RESULT: PBOResult = {
  pbo: 0.7,
  nCombinations: 70,
  nUnderperformed: 49,
  meanInSampleSharpe: 2.0,
  meanOutOfSampleSharpe: 0.3,
  stdInSampleSharpe: 0.5,
  stdOutOfSampleSharpe: 0.6,
  degradation: 0.85,
  interpretation: "high_risk",
  passed: false,
};

/**
 * Standard test data size for PBO calculations
 */
export const STANDARD_DATA_SIZE = 400;

/**
 * Minimum splits for faster tests
 */
export const MIN_SPLITS = 4;
