use chrono::{Duration, TimeZone, Utc};

use super::{ScannerBar, ScannerParams, SignalType, SymbolState};

fn make_bar(
    symbol: &str,
    minute_offset: i64,
    close: f64,
    volume: i64,
    high: f64,
    low: f64,
) -> ScannerBar {
    let base = Utc.with_ymd_and_hms(2026, 1, 5, 14, 30, 0).unwrap();
    ScannerBar {
        symbol: symbol.to_string(),
        timestamp: base + Duration::minutes(minute_offset),
        high,
        low,
        close,
        volume,
    }
}

fn warm_state(state: &mut SymbolState, symbol: &str, base_close: f64, volume: i64) {
    for index in 0..20 {
        let close = f64::from(index).mul_add(0.1, base_close);
        let bar = make_bar(
            symbol,
            i64::from(index),
            close,
            volume,
            close + 0.5,
            close - 0.5,
        );
        state.update_from_bar(&bar);
    }
}

#[test]
fn symbol_state_updates_rolling_windows() {
    let mut state = SymbolState::default();

    for index in 0..25 {
        let bar = make_bar(
            "AAPL",
            index,
            100.0 + index as f64,
            1000 + index,
            101.0,
            99.0,
        );
        state.update_from_bar(&bar);
    }

    let avg = state.average_volume().unwrap();
    assert!(avg > 1000.0);
    assert!(state.price_change_pct(130.0).is_some());
}

#[test]
fn detects_volume_spike_at_threshold() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "AAPL", 100.0, 100_000);

    let params = ScannerParams::default();
    let bar = make_bar("AAPL", 25, 102.0, 300_000, 103.0, 101.0);

    let signals = state.check_anomaly(&bar, &params).unwrap();
    assert!(
        signals
            .iter()
            .any(|signal| matches!(signal, SignalType::VolumeSpike { ratio } if *ratio >= 3.0))
    );

    state.update_from_bar(&bar);
}

#[test]
fn does_not_detect_volume_spike_below_threshold() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "AAPL", 100.0, 100_000);

    let params = ScannerParams::default();
    let bar = make_bar("AAPL", 25, 101.5, 290_000, 102.0, 101.0);

    let signals = state.check_anomaly(&bar, &params).unwrap_or_default();
    assert!(
        !signals
            .iter()
            .any(|signal| matches!(signal, SignalType::VolumeSpike { .. }))
    );

    state.update_from_bar(&bar);
}

#[test]
fn cooldown_blocks_repeated_alerts() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "AAPL", 100.0, 100_000);

    let now = Utc.with_ymd_and_hms(2026, 1, 5, 15, 0, 0).unwrap();
    state.mark_alert(now);

    assert!(state.is_in_cooldown(now + Duration::seconds(60), 300));
    assert!(!state.is_in_cooldown(now + Duration::seconds(301), 300));
}

#[test]
fn min_price_and_min_avg_volume_filters_apply() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "PENNY", 1.0, 10_000);

    let params = ScannerParams::default();
    let bar = make_bar("PENNY", 25, 1.2, 100_000, 1.3, 1.0);

    assert!(state.check_anomaly(&bar, &params).is_none());
    state.update_from_bar(&bar);
}

#[test]
fn approx_atr_available_after_warmup() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "AAPL", 100.0, 100_000);

    let atr = state.approx_atr().unwrap();
    assert!(atr > 0.0);
}

#[test]
fn daily_bar_updates_prev_day_close_for_gap_detection() {
    let mut state = SymbolState::default();
    warm_state(&mut state, "AAPL", 100.0, 100_000);
    state.update_prev_close(95.0);

    let params = ScannerParams::default();
    let bar = make_bar("AAPL", 25, 100.0, 120_000, 101.0, 99.0);

    let signals = state.check_anomaly(&bar, &params).unwrap();
    assert!(
        signals
            .iter()
            .any(|signal| matches!(signal, SignalType::Gap { pct } if pct.abs() >= 2.0))
    );

    state.update_from_bar(&bar);
}

#[test]
fn first_bar_does_not_trigger_without_warmup() {
    let mut state = SymbolState::default();
    let params = ScannerParams::default();
    let bar = make_bar("AAPL", 0, 100.0, 500_000, 101.0, 99.0);
    state.update_from_bar(&bar);

    assert!(state.check_anomaly(&bar, &params).is_none());
}
