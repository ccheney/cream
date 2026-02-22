//! Scanner Domain Types
//!
//! Pure domain logic for anomaly detection on streaming bars.

use std::collections::VecDeque;

use chrono::{DateTime, Utc};

const DEFAULT_WINDOW_SIZE: usize = 20;
const DEFAULT_ATR_PERIOD: usize = 14;

/// Scanner runtime parameters.
#[derive(Debug, Clone)]
pub struct ScannerParams {
    /// Minimum allowed price for candidate symbols.
    pub min_price: f64,
    /// Minimum average volume for candidate symbols.
    pub min_avg_volume: i64,
    /// Volume ratio threshold (`current / avg`) to emit a volume spike signal.
    pub volume_spike_threshold: f64,
    /// Absolute percentage threshold for an intrawindow price move signal.
    pub price_move_threshold: f64,
    /// Absolute percentage threshold for gap signal vs previous close.
    pub gap_threshold: f64,
    /// Maximum alerts emitted per batch window.
    pub max_candidates: usize,
    /// Per-symbol cooldown after an alert.
    pub cooldown_seconds: i64,
    /// Global scanner enabled switch.
    pub enabled: bool,
}

impl Default for ScannerParams {
    fn default() -> Self {
        Self {
            min_price: 5.0,
            min_avg_volume: 100_000,
            volume_spike_threshold: 3.0,
            price_move_threshold: 2.0,
            gap_threshold: 2.0,
            max_candidates: 10,
            cooldown_seconds: 300,
            enabled: true,
        }
    }
}

/// Single bar input used by scanner state updates.
#[derive(Debug, Clone)]
pub struct ScannerBar {
    /// Symbol.
    pub symbol: String,
    /// Bar timestamp.
    pub timestamp: DateTime<Utc>,
    /// High price.
    pub high: f64,
    /// Low price.
    pub low: f64,
    /// Close price.
    pub close: f64,
    /// Bar volume.
    pub volume: i64,
}

/// Scanner signal detected for a symbol.
#[derive(Debug, Clone, PartialEq)]
pub enum SignalType {
    /// Volume anomaly.
    VolumeSpike {
        /// Volume ratio (`current / avg`) at trigger time.
        ratio: f64,
    },
    /// Intrawindow price move anomaly.
    PriceMove {
        /// Percentage move from the oldest close in the rolling window.
        pct: f64,
    },
    /// Gap anomaly vs previous close.
    Gap {
        /// Gap percentage vs previous day close.
        pct: f64,
    },
}

/// Domain alert payload emitted to infrastructure layer.
#[derive(Debug, Clone)]
pub struct ScannerAlertDomain {
    /// Symbol.
    pub symbol: String,
    /// Alert timestamp.
    pub timestamp: DateTime<Utc>,
    /// Signals that triggered.
    pub signals: Vec<SignalType>,
    /// Current price.
    pub price: f64,
    /// Current bar volume.
    pub volume: i64,
    /// Rolling average volume.
    pub avg_volume: i64,
    /// Volume ratio.
    pub volume_ratio: f64,
    /// Price move percentage.
    pub price_change_pct: f64,
    /// Gap percentage vs previous close.
    pub gap_pct: f64,
    /// Approximate ATR from rolling window.
    pub approx_atr: f64,
}

/// Per-symbol rolling scanner state.
#[derive(Debug, Clone)]
pub struct SymbolState {
    volume_window: VecDeque<i64>,
    high_window: VecDeque<f64>,
    low_window: VecDeque<f64>,
    close_window: VecDeque<f64>,
    prev_day_close: Option<f64>,
    last_alert_at: Option<DateTime<Utc>>,
    window_size: usize,
}

impl Default for SymbolState {
    fn default() -> Self {
        Self {
            volume_window: VecDeque::with_capacity(DEFAULT_WINDOW_SIZE),
            high_window: VecDeque::with_capacity(DEFAULT_WINDOW_SIZE),
            low_window: VecDeque::with_capacity(DEFAULT_WINDOW_SIZE),
            close_window: VecDeque::with_capacity(DEFAULT_WINDOW_SIZE),
            prev_day_close: None,
            last_alert_at: None,
            window_size: DEFAULT_WINDOW_SIZE,
        }
    }
}

impl SymbolState {
    /// Update rolling state with a new minute bar.
    pub fn update_from_bar(&mut self, bar: &ScannerBar) {
        push_with_limit(&mut self.volume_window, bar.volume, self.window_size);
        push_with_limit(&mut self.high_window, bar.high, self.window_size);
        push_with_limit(&mut self.low_window, bar.low, self.window_size);
        push_with_limit(&mut self.close_window, bar.close, self.window_size);
    }

    /// Update previous day close from a daily bar.
    pub fn update_prev_close(&mut self, close: f64) {
        self.prev_day_close = Some(close);
    }

    /// Check whether the symbol is still in cooldown.
    #[must_use]
    pub fn is_in_cooldown(&self, now: DateTime<Utc>, cooldown_seconds: i64) -> bool {
        if cooldown_seconds <= 0 {
            return false;
        }

        self.last_alert_at
            .map(|last| (now - last).num_seconds() < cooldown_seconds)
            .unwrap_or(false)
    }

    /// Mark alert timestamp for cooldown tracking.
    pub fn mark_alert(&mut self, now: DateTime<Utc>) {
        self.last_alert_at = Some(now);
    }

    /// Check anomaly signals for the provided bar.
    #[must_use]
    pub fn check_anomaly(
        &self,
        bar: &ScannerBar,
        params: &ScannerParams,
    ) -> Option<Vec<SignalType>> {
        if !params.enabled || !self.is_warmed_up() {
            return None;
        }

        let avg_volume = self.average_volume()?;
        if bar.close < params.min_price || avg_volume < params.min_avg_volume as f64 {
            return None;
        }

        let mut signals = Vec::new();

        let volume_ratio = (bar.volume as f64) / avg_volume;
        if volume_ratio >= params.volume_spike_threshold {
            signals.push(SignalType::VolumeSpike {
                ratio: volume_ratio,
            });
        }

        let price_move_pct = self.price_change_pct(bar.close).unwrap_or(0.0);
        if price_move_pct.abs() >= params.price_move_threshold {
            signals.push(SignalType::PriceMove {
                pct: price_move_pct,
            });
        }

        let gap_pct = self.gap_pct(bar.close).unwrap_or(0.0);
        if gap_pct.abs() >= params.gap_threshold {
            signals.push(SignalType::Gap { pct: gap_pct });
        }

        if signals.is_empty() {
            None
        } else {
            Some(signals)
        }
    }

    /// Compute current rolling average volume.
    #[must_use]
    pub fn average_volume(&self) -> Option<f64> {
        if self.volume_window.is_empty() {
            return None;
        }

        let total: i64 = self.volume_window.iter().sum();
        Some((total as f64) / (self.volume_window.len() as f64))
    }

    /// Compute volume ratio from current bar volume.
    #[must_use]
    pub fn volume_ratio(&self, volume: i64) -> Option<f64> {
        let avg = self.average_volume()?;
        if avg <= 0.0 {
            return None;
        }

        Some((volume as f64) / avg)
    }

    /// Compute absolute price move percentage from oldest close in window.
    #[must_use]
    pub fn price_change_pct(&self, current_close: f64) -> Option<f64> {
        let base = *self.close_window.front()?;
        if base <= 0.0 {
            return None;
        }

        Some(((current_close - base) / base) * 100.0)
    }

    /// Compute gap percentage vs previous day close if available.
    #[must_use]
    pub fn gap_pct(&self, current_close: f64) -> Option<f64> {
        let prev = self.prev_day_close?;
        if prev <= 0.0 {
            return None;
        }

        Some(((current_close - prev) / prev) * 100.0)
    }

    /// Approximate ATR from rolling high/low/close windows.
    #[must_use]
    pub fn approx_atr(&self) -> Option<f64> {
        let len = self.close_window.len();
        if len < 2 {
            return None;
        }

        let start = len.saturating_sub(DEFAULT_ATR_PERIOD);
        let mut total_range = 0.0;
        let mut count = 0usize;

        for index in start..len {
            let high = *self.high_window.get(index)?;
            let low = *self.low_window.get(index)?;
            let prev_close = if index == 0 {
                *self.close_window.get(index)?
            } else {
                *self.close_window.get(index - 1)?
            };

            let tr = (high - low)
                .max((high - prev_close).abs())
                .max((low - prev_close).abs());
            total_range += tr;
            count += 1;
        }

        if count == 0 {
            None
        } else {
            Some(total_range / (count as f64))
        }
    }

    #[must_use]
    fn is_warmed_up(&self) -> bool {
        self.volume_window.len() >= self.window_size && self.close_window.len() >= self.window_size
    }
}

fn push_with_limit<T>(window: &mut VecDeque<T>, value: T, limit: usize) {
    window.push_back(value);
    if window.len() > limit {
        let _ = window.pop_front();
    }
}

#[cfg(test)]
mod tests;
