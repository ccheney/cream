//! Historical data replay engine for backtest simulation.
//!
//! Provides sequential candle streaming from various data sources:
//! - Local Parquet/Arrow files
//! - Arrow Flight RPC for high-performance streaming
//! - REST API fallback
//!
//! Features:
//! - Multi-instrument timestamp synchronization
//! - Memory-efficient streaming (does not load all data upfront)
//! - Progress tracking with ETA estimation
//! - Configurable date ranges
//! - Missing data handling

mod data_source;
mod engine;
mod error;
mod synchronized;
mod types;

pub use data_source::{CandleDataSource, InMemoryDataSource};
pub use engine::{ReplayEngine, ReplayEngineBuilder};
pub use error::ReplayError;
pub use synchronized::SynchronizedReplay;
pub use types::{CandleEvent, DataSourceType, MissingDataPolicy, ReplayConfig, ReplayProgress};

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use rust_decimal::Decimal;

    use super::*;
    use crate::backtest::Candle;

    fn make_candle(timestamp: &str, close: i64) -> Candle {
        Candle {
            open: Decimal::new(100, 0),
            high: Decimal::new(101, 0),
            low: Decimal::new(99, 0),
            close: Decimal::new(close, 0),
            volume: Decimal::new(10000, 0),
            timestamp: timestamp.to_string(),
        }
    }

    fn setup_test_data_source() -> Arc<InMemoryDataSource> {
        let mut source = InMemoryDataSource::new();

        source.add_candles(
            "AAPL",
            vec![
                make_candle("2024-01-01T09:00:00Z", 150),
                make_candle("2024-01-01T10:00:00Z", 151),
                make_candle("2024-01-01T11:00:00Z", 152),
            ],
        );

        source.add_candles(
            "MSFT",
            vec![
                make_candle("2024-01-01T09:00:00Z", 300),
                make_candle("2024-01-01T10:00:00Z", 301),
                make_candle("2024-01-01T11:00:00Z", 302),
            ],
        );

        Arc::new(source)
    }

    #[test]
    fn test_replay_engine_creation() {
        let config = ReplayConfig::default();
        let engine = ReplayEngine::in_memory(config);

        assert!(!engine.is_initialized());
    }

    #[test]
    fn test_replay_engine_initialization() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        if let Err(e) = engine.initialize() {
            panic!("replay engine should initialize: {e}");
        }

        assert!(engine.is_initialized());
        assert_eq!(engine.progress().events_total, Some(6));
    }

    #[test]
    fn test_replay_engine_sequential_iteration() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let events: Vec<CandleEvent> = engine.collect();

        assert_eq!(events.len(), 3);
        assert!(events[0].candle.timestamp <= events[1].candle.timestamp);
        assert!(events[1].candle.timestamp <= events[2].candle.timestamp);
    }

    #[test]
    fn test_replay_engine_multi_instrument_ordering() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let events: Vec<CandleEvent> = engine.collect();

        assert_eq!(events.len(), 6);

        let mut last_timestamp = String::new();
        for event in &events {
            assert!(event.candle.timestamp >= last_timestamp);
            last_timestamp.clone_from(&event.candle.timestamp);
        }
    }

    #[test]
    fn test_replay_engine_progress_tracking() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            track_progress: true,
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        if let Err(e) = engine.initialize() {
            panic!("replay engine should initialize: {e}");
        }

        engine.next_event();
        engine.next_event();

        let progress = engine.progress();
        assert_eq!(progress.events_processed, 2);
        assert!(progress.progress_pct > 0.0);
    }

    #[test]
    fn test_synchronized_replay() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let sync_replay = SynchronizedReplay::new(engine);

        let batches: Vec<(String, Vec<CandleEvent>)> = sync_replay.collect();

        assert_eq!(batches.len(), 3);

        for (_, events) in &batches {
            assert_eq!(events.len(), 2);
        }
    }

    #[test]
    fn test_replay_engine_builder() {
        let source = setup_test_data_source();

        let engine = ReplayEngineBuilder::new()
            .start_date("2024-01-01T00:00:00Z")
            .end_date("2024-01-02T00:00:00Z")
            .instrument("AAPL")
            .instrument("MSFT")
            .track_progress(true)
            .data_source(source)
            .build();

        assert_eq!(engine.config().instruments.len(), 2);
    }

    #[test]
    fn test_replay_engine_reset() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        if let Err(e) = engine.initialize() {
            panic!("replay engine should initialize: {e}");
        }

        engine.next_event();
        engine.next_event();

        if let Err(e) = engine.reset() {
            panic!("replay engine should reset: {e}");
        }

        let events: Vec<CandleEvent> = engine.collect();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn test_candle_event_creation() {
        let candle = make_candle("2024-01-01T10:00:00Z", 150);
        let event = CandleEvent::new("AAPL", candle.clone(), 1);

        assert_eq!(event.instrument_id, "AAPL");
        assert_eq!(event.sequence, 1);
        assert!(!event.is_forward_filled);

        let ff_event = CandleEvent::forward_filled("AAPL", candle, 2);
        assert!(ff_event.is_forward_filled);
    }

    #[test]
    fn test_in_memory_data_source() {
        let mut source = InMemoryDataSource::new();

        source.add_candles(
            "AAPL",
            vec![
                make_candle("2024-01-01T09:00:00Z", 150),
                make_candle("2024-01-01T10:00:00Z", 151),
            ],
        );

        let candles =
            match source.load_candles("AAPL", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z") {
                Ok(c) => c,
                Err(e) => panic!("should load candles from in-memory source: {e}"),
            };

        assert_eq!(candles.len(), 2);
    }

    #[test]
    fn test_in_memory_data_source_no_data() {
        let source = InMemoryDataSource::new();

        let result = source.load_candles("AAPL", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z");

        assert!(matches!(result, Err(ReplayError::NoData(_))));
    }

    #[test]
    fn test_replay_progress_default() {
        let progress = ReplayProgress::default();

        assert_eq!(progress.events_processed, 0);
        assert!((progress.progress_pct - 0.0).abs() < f64::EPSILON);
    }
}
