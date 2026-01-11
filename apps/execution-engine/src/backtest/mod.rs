//! Backtest simulation engine for order lifecycle simulation.
//!
//! This module provides simulation capabilities for backtesting trading strategies:
//!
//! - **Fill models**: Configurable slippage (fixed BPS, spread-based, volume impact)
//! - **Commission**: Per-unit commissions with regulatory fees (SEC, TAF, ORF)
//! - **Stop/target triggers**: Candle-based detection with same-bar priority rules
//! - **Partial fills**: Probabilistic and liquidity-based partial fill simulation
//! - **Multi-leg orders**: All-or-None behavior for options spreads
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::backtest::{
//!     BacktestConfig, Candle, SimulationEngine,
//!     simulate_market_order,
//! };
//! use execution_engine::models::OrderSide;
//! use rust_decimal::Decimal;
//!
//! let config = BacktestConfig::default();
//! let candle = Candle::new(
//!     Decimal::new(10000, 2), // open: $100.00
//!     Decimal::new(10100, 2), // high: $101.00
//!     Decimal::new(9900, 2),  // low: $99.00
//!     Decimal::new(10050, 2), // close: $100.50
//!     Decimal::new(100_000, 0), // volume: 100,000
//! );
//!
//! let fill = simulate_market_order(
//!     OrderSide::Buy,
//!     Decimal::new(100, 0),
//!     &candle,
//!     &config,
//!     true,
//!     None,
//! );
//!
//! assert!(fill.filled);
//! ```

mod cleanup;
mod commission;
mod config;
mod data_gaps;
mod engine;
mod fill_engine;
mod logging;
mod look_ahead;
mod metrics;
mod monte_carlo;
mod multi_leg;
mod order;
mod parallel;
mod position;
mod replay;
mod security;
mod slippage;
mod trade;
mod triggers;
mod walkforward;

pub use cleanup::{
    CleanupConfig, CleanupResult, QuotaStatus, ResultFileInfo, StorageUsage,
    calculate_storage_usage, check_storage_quota, identify_cleanup_candidates, perform_cleanup,
    scan_results_dir,
};
pub use commission::{InstrumentType, calculate_commission, calculate_multi_leg_commission};
pub use config::{
    BacktestConfig, CommissionConfig, CommissionModel, FillModelConfig, FixedBpsConfig,
    LimitOrderConfig, PartialFillConfig, PerUnitCommissionConfig, RegulatoryFeesConfig,
    SameBarPriority, SlippageConfig, SlippageModel, SlippedStopTargetConfig, SpreadBasedConfig,
    StopTargetConfig, StopTargetFillModel, VolumeImpactConfig,
};
pub use data_gaps::{
    DataGapError, DataGapType, GapStatistics, GapValidationResult, validate_candle_data,
    validate_order_data, validate_spread_data, validate_volume_data,
};
pub use engine::SimulationEngine;
pub use fill_engine::{
    Candle, FillResult, simulate_limit_order, simulate_market_order, simulate_order,
    simulate_stop_limit_order, simulate_stop_order,
};
pub use logging::{
    BacktestEvent, BacktestLogger, CommissionCalculatedEvent, DataGapDetectedEvent,
    OrderFilledEvent, OrderRejectedEvent, OrderSubmittedEvent, PerformanceSummaryEvent,
    SimulationEndEvent, SimulationStartEvent, SlippageAppliedEvent, TriggerActivatedEvent,
    calculate_slippage_bps, create_data_gap_event, create_order_submitted_event,
    create_simulation_start_event, is_adverse_slippage, log_commission_calculated,
    log_data_gap_detected, log_order_filled, log_order_rejected, log_order_submitted,
    log_performance_summary, log_simulation_end, log_simulation_start, log_slippage_applied,
    log_trigger_activated,
};
pub use look_ahead::{
    DataAccessRecord, EarningsRelease, EarningsReleaseTiming, FundamentalDataAvailability,
    LookAheadChecker, LookAheadConfig, LookAheadError, LookAheadSummary, ValidationResult,
    check_earnings_availability, check_fundamental_availability, validate_data_timestamp,
    validate_universe_constituents,
};
pub use metrics::{
    DrawdownPoint, EquityPoint, ExitReason, PerformanceCalculator, PerformanceSummary, TradeRecord,
    format_decimal, format_pct, format_ratio,
};
pub use monte_carlo::{
    DistributionStats, IterationResult, LuckVsSkillAnalysis, MonteCarloBuilder, MonteCarloConfig,
    MonteCarloResult, MonteCarloSimulator, RandomizationMethod, VaRAnalysis,
};
pub use multi_leg::{
    LegFillResult, MultiLegFillResult, OrderLeg, calculate_total_contracts,
    create_bull_call_spread, create_iron_condor, create_straddle, simulate_multi_leg_order,
    validate_balanced_ratios,
};
pub use order::{SimOrder, SimOrderState};
pub use parallel::{
    BacktestJob, BacktestJobResult, GridSearchResult, ParallelBacktester, ParallelConfig,
    ParallelError, ParallelResult, ParamValue, ParameterGrid, ParameterGridBuilder, Progress,
    ProgressTracker, StrategyConfig,
};
pub use position::SimPosition;
pub use replay::{
    CandleDataSource, CandleEvent, DataSourceType, InMemoryDataSource, MissingDataPolicy,
    ReplayConfig, ReplayEngine, ReplayEngineBuilder, ReplayError, ReplayProgress,
    SynchronizedReplay,
};
pub use security::{
    AuditEvent, AuditEventType, AuditLogger, AuditOutcome, ConfigSecurityScan, DataAccessControl,
    PathSecurityError, SecurityError, SecurityWarning, check_path_patterns,
    scan_config_for_secrets, validate_safe_path,
};
pub use slippage::{apply_slippage, apply_stop_target_slippage};
pub use trade::SimTrade;
pub use triggers::{
    PositionDirection, TriggerResult, TriggerType, evaluate_stop, evaluate_target,
    evaluate_triggers, is_stop_triggered, is_target_triggered,
};
pub use walkforward::{
    AggregatedMetrics, OverfittingAnalysis, ParameterStability, WalkForwardBuilder,
    WalkForwardConfig, WalkForwardEngine, WalkForwardResult, WalkForwardWindow, WindowMode,
};
