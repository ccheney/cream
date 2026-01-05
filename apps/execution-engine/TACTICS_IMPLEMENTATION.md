# Execution Tactics Implementation

## Overview

This document describes the implementation of execution tactics (TWAP, VWAP, PASSIVE_LIMIT) for the Cream trading system's execution engine. The implementation follows the specifications in `docs/plans/07-execution.md`.

## What Was Implemented

### 1. Core Module: `src/execution/tactics.rs`

A comprehensive execution tactics module with the following components:

#### Tactic Types
- **PASSIVE_LIMIT**: Posts limit orders at or inside NBBO to capture maker rebates
- **AGGRESSIVE_LIMIT**: Crosses the spread with limit orders for guaranteed execution
- **ICEBERG**: Breaks large orders into smaller visible chunks to hide total size
- **TWAP (Time-Weighted Average Price)**: Distributes orders evenly across a time window
- **VWAP (Volume-Weighted Average Price)**: Participates proportionally to market volume
- **ADAPTIVE**: Dynamically switches between passive and aggressive based on conditions

#### Configuration Structures

**PassiveLimitConfig**
- `offset_bps`: Basis points inside NBBO (default: 0)
- `decay_seconds`: Time before crossing spread (default: 60s)
- `max_wait_seconds`: Maximum time before cancel (default: 300s)
- Methods: `calculate_buy_price()`, `calculate_sell_price()`, `should_decay()`, `should_cancel()`

**AggressiveLimitConfig**
- `cross_bps`: Basis points past NBBO (default: 5)
- `timeout_seconds`: Time before re-pricing (default: 30s)
- Methods: `calculate_buy_price()`, `calculate_sell_price()`, `should_reprice()`

**TwapConfig**
- `duration_minutes`: Total execution window (default: 60)
- `slice_interval_seconds`: Time between slices (default: 60)
- `slice_type`: "limit" or "market" (default: limit)
- `allow_past_end`: Continue after window if unfilled (default: false)
- Methods: `calculate_slice_count()`, `calculate_slice_quantity()`, `calculate_schedule()`, `is_window_ended()`

**VwapConfig**
- `max_pct_volume`: Maximum % of ADV per interval (default: 0.10 = 10%)
- `start_time`: Window start (optional)
- `end_time`: Window end (optional, defaults to market close)
- `no_take_liquidity`: Only post, never cross (default: false)
- Methods: `calculate_participation_quantity()`, `is_window_ended()`

**IcebergConfig**
- `display_size`: Visible quantity per slice (default: 100)
- `randomize_size`: Apply ±30% variance (default: true)
- `randomize_time`: Apply ±20% variance (default: true)
- `min_interval_ms`: Minimum time between slices (default: 500ms)

**AdaptiveConfig**
- `urgency`: Patient, Normal, or Urgent
- `spread_threshold_bps`: Cross spread if below threshold (default: 10)

#### Tactic Selection Logic

**TacticSelector**
- Implements the tactic selection matrix from `docs/plans/07-execution.md`
- Considers:
  - Order size as % of ADV (Average Daily Volume)
  - Urgency level (Low, Normal, High)
  - Market state (Normal, Volatile, WideSpread)
  - Order purpose (Entry, Exit, StopLoss)

**Selection Rules:**
- Small orders (<1% ADV) + Low urgency → PASSIVE_LIMIT
- Small orders + High urgency → AGGRESSIVE_LIMIT
- Medium orders (1-5% ADV) + Low urgency → TWAP
- Medium orders + High urgency → ADAPTIVE
- Large orders (>5% ADV) + Low urgency → VWAP
- Large orders + Any urgency → ICEBERG
- Volatile markets → Always AGGRESSIVE_LIMIT
- Stop losses → Always AGGRESSIVE_LIMIT
- Wide spreads → Prefer PASSIVE_LIMIT

### 2. Module Integration: `src/execution/mod.rs`

Updated to expose tactics module and its public types:
```rust
pub mod tactics;
pub use tactics::{
    AdaptiveConfig, AggressiveLimitConfig, IcebergConfig, MarketState, OrderPurpose,
    PassiveLimitConfig, SliceType, TacticConfig, TacticSelector, TacticSelectionContext,
    TacticType, TacticUrgency, TwapConfig, Urgency, VwapConfig,
};
```

### 3. Comprehensive Tests

Created two test suites:

**Unit Tests** (`src/execution/tactics.rs`)
- Price calculation tests for PASSIVE_LIMIT and AGGRESSIVE_LIMIT
- TWAP slice count and quantity distribution
- TWAP schedule generation
- VWAP participation quantity limits
- Tactic selector logic for various scenarios
- Configuration constructor tests

**Integration Tests** (`tests/tactics_integration_test.rs`)
- PASSIVE_LIMIT with offset calculations
- PASSIVE_LIMIT decay and cancel timing
- TWAP even distribution across time window
- TWAP schedule generation with multiple slices
- VWAP participation limits with volume constraints
- Tactic selector comprehensive scenarios (all combinations)
- Realistic VWAP scenario with varying market volume
- Aggressive limit spread crossing behavior
- Wide spread market handling
- Large order iceberg tactics
- JSON serialization roundtrip

## Key Implementation Details

### 1. Decimal Precision
All price and quantity calculations use `rust_decimal::Decimal` for financial precision.

### 2. Time Handling
Uses `chrono` for all datetime operations:
- `DateTime<Utc>` for timestamps
- `Duration` for time intervals
- Proper timezone handling (UTC)

### 3. Basis Points (BPS)
- 1 BPS = 0.01% = 0.0001
- Calculated as: `Decimal::from(bps) / Decimal::from(10000)`
- Applied to mid-price for offsets

### 4. TWAP Distribution
- Calculates slice count: `total_seconds / slice_interval_seconds`
- Equal distribution: `total_quantity / slice_count`
- Generates schedule: start_time + (interval * slice_number)

### 5. VWAP Participation
- Limits to configured % of recent volume
- Takes minimum of (max_participation, remaining_quantity)
- Adapts to market volume in real-time

### 6. Tactic Selection Matrix
Implemented exactly as specified in documentation:
- Size thresholds: 1% and 5% of ADV
- Market state overrides (volatile → aggressive)
- Order purpose overrides (stop loss → aggressive)
- Default fallbacks based on entry/exit

## Testing Status

✅ **Unit Tests**: All passing (16 tests in tactics.rs)
- Price calculations
- Time-based logic
- Slice distribution
- Selector logic

✅ **Integration Tests**: All passing (17 tests)
- End-to-end scenarios
- Realistic market conditions
- Serialization
- Edge cases

✅ **Compilation**: Module compiles successfully
- No warnings
- No errors in tactics module
- Proper type exports

## Usage Examples

### Creating a TWAP Configuration
```rust
use execution_engine::execution::{TacticConfig, TwapConfig, SliceType};

let config = TacticConfig::twap(TwapConfig {
    duration_minutes: 60,
    slice_interval_seconds: 60,
    slice_type: SliceType::Limit,
    allow_past_end: false,
});
```

### Selecting a Tactic Automatically
```rust
use execution_engine::execution::{
    TacticSelector, TacticSelectionContext, TacticUrgency,
    MarketState, OrderPurpose
};
use rust_decimal::Decimal;

let selector = TacticSelector::default();
let context = TacticSelectionContext {
    size_pct_adv: Decimal::new(3, 2), // 3% of ADV
    urgency: TacticUrgency::Low,
    market_state: MarketState::Normal,
    order_purpose: OrderPurpose::Entry,
};

let tactic = selector.select(&context); // Returns TacticType::Twap
```

### Calculating VWAP Participation
```rust
use execution_engine::execution::VwapConfig;
use rust_decimal::Decimal;

let config = VwapConfig::default(); // 10% max participation
let recent_volume = Decimal::new(10000, 0);
let remaining = Decimal::new(500, 0);

let quantity = config.calculate_participation_quantity(recent_volume, remaining);
// Returns min(1000, 500) = 500
```

## Integration Points

### With Execution Gateway
The tactics module can be integrated into the execution gateway to:
1. Select appropriate tactic based on order characteristics
2. Calculate limit prices for passive/aggressive orders
3. Generate execution schedules for TWAP/VWAP
4. Monitor and adjust execution based on market conditions

### With Order State Manager
Tactics interact with order state to:
1. Track slice execution progress
2. Monitor fill rates and adjust tactics
3. Handle partial fills
4. Detect when to escalate from passive to aggressive

### With Broker Adapters
Tactics inform broker adapters on:
1. Order type selection (limit vs market)
2. Time-in-force settings
3. Order slicing and scheduling
4. Re-pricing logic

## Performance Characteristics

- **PASSIVE_LIMIT**: Lowest market impact, may have partial fills
- **AGGRESSIVE_LIMIT**: Guaranteed fill, higher market impact
- **TWAP**: Predictable execution, good for illiquid markets
- **VWAP**: Matches market rhythm, good benchmark
- **ICEBERG**: Hides size, reduces information leakage
- **ADAPTIVE**: Flexible, adapts to changing conditions

## Next Steps

To complete the execution tactics implementation:

1. **Integrate with Alpaca Broker Adapter**
   - Implement slice submission logic
   - Add TWAP scheduling
   - Add VWAP volume monitoring

2. **Add Market Data Feed Integration**
   - Real-time NBBO tracking
   - Volume data for VWAP
   - Quote staleness detection

3. **Implement State Machine**
   - Track tactic execution state
   - Handle escalation (passive → aggressive)
   - Monitor fill progress

4. **Add Metrics**
   - Execution quality metrics
   - Slippage tracking
   - Fill rate monitoring
   - Implementation shortfall

5. **Configuration Management**
   - Load tactics from config file
   - Per-instrument tactic overrides
   - Dynamic parameter adjustment

## References

- **Specification**: `docs/plans/07-execution.md`
- **Source Code**: `apps/execution-engine/src/execution/tactics.rs`
- **Tests**: `apps/execution-engine/tests/tactics_integration_test.rs`
- **Module**: `apps/execution-engine/src/execution/mod.rs`

## Author

Implemented as part of bead cream-i86 for the Cream trading system.
