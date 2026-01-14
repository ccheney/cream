/**
 * Contract Testing Module
 *
 * Provides utilities for validating contracts between TypeScript and Rust services.
 * Ensures schema compatibility and detects breaking changes early.
 */

export {
	// Types
	type ContractError,
	type ContractValidationResult,
	// HTTP contracts
	EXECUTION_HTTP_CONTRACTS,
	// Fixtures
	FIXTURE_ACCOUNT_STATE,
	FIXTURE_CONSTRAINT_CHECK,
	FIXTURE_DECISION,
	FIXTURE_DECISION_PLAN,
	FIXTURE_EXECUTION_ACK,
	FIXTURE_INSTRUMENT,
	FIXTURE_OPTION_INSTRUMENT,
	FIXTURE_POSITION,
	FIXTURE_SUBMIT_ORDER_REQUEST,
	FIXTURE_SUBMIT_ORDER_RESPONSE,
	type HTTPEndpointContract,
	// Validation functions
	validateAllContracts,
	validateContract,
	validateHTTPContracts,
} from "./execution-contracts";
