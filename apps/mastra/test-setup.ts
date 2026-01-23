/**
 * Test Setup - Preload Mocks
 *
 * This file is loaded before tests to set up global mocks.
 * Required because some modules call functions at import time.
 */

import { mock } from "bun:test";

// Import the actual module to get all exports
const actualDomain = await import("@cream/domain");

// Mock @cream/domain with passthrough for most exports,
// but override functions that require environment variables at module load time
mock.module("@cream/domain", () => ({
	...actualDomain,
	// Override functions that read env vars at module load time
	getModelId: () => "google/gemini-2.0-flash",
	getFullModelId: () => "google/gemini-2.0-flash",
	getLLMProvider: () => "google",
	getLLMModelId: () => "gemini-2.0-flash",
	isTest: () => true,
}));
