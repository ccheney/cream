//! Scanner Application Service
//!
//! Coordinates scanner domain state updates from live bar streams and emits alerts.

use std::collections::{HashMap, VecDeque};
use std::str::FromStr;
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use tokio::sync::RwLock;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

use crate::application::ports::scanner::ScannerConfigPort;
use crate::domain::scanner::{ScannerAlertDomain, ScannerBar, ScannerParams, SymbolState};
use crate::infrastructure::alpaca::messages::StockBarMessage;
use crate::infrastructure::broadcast::SharedBroadcastHub;

/// Snapshot of scanner runtime status.
#[derive(Debug, Clone)]
pub struct ScannerStatusSnapshot {
    /// Scanner active switch.
    pub active: bool,
    /// Number of symbols currently tracked in memory.
    pub symbols_tracked: usize,
    /// Total emitted alerts since startup.
    pub total_alerts: u64,
    /// Alert count in the last hour.
    pub alerts_last_hour: u64,
    /// Current scanner config.
    pub config: ScannerParams,
}

#[derive(Debug, Default)]
struct ScannerRuntimeState {
    symbols: HashMap<String, SymbolState>,
    current_bucket_minute: Option<i64>,
    pending_alerts: Vec<ScannerAlertDomain>,
    total_alerts: u64,
    alert_timestamps: VecDeque<DateTime<Utc>>,
}

impl ScannerRuntimeState {
    fn process_bar(
        &mut self,
        bar: ScannerBar,
        params: &ScannerParams,
        broadcast_hub: &SharedBroadcastHub,
    ) {
        let bucket = bar.timestamp.timestamp() / 60;

        if self
            .current_bucket_minute
            .is_some_and(|current| current != bucket)
        {
            self.flush_pending(params, broadcast_hub);
        }
        self.current_bucket_minute = Some(bucket);

        let state = self.symbols.entry(bar.symbol.clone()).or_default();

        if state.is_in_cooldown(bar.timestamp, params.cooldown_seconds) {
            state.update_from_bar(&bar);
            return;
        }

        let Some(signals) = state.check_anomaly(&bar, params) else {
            state.update_from_bar(&bar);
            return;
        };

        let avg_volume = state
            .average_volume()
            .map_or(0, |value| value.round() as i64);
        let volume_ratio = state.volume_ratio(bar.volume).unwrap_or(0.0);
        let price_change_pct = state.price_change_pct(bar.close).unwrap_or(0.0);
        let gap_pct = state.gap_pct(bar.close).unwrap_or(0.0);
        let approx_atr = state.approx_atr().unwrap_or(0.0);

        state.mark_alert(bar.timestamp);
        self.pending_alerts.push(ScannerAlertDomain {
            symbol: bar.symbol.clone(),
            timestamp: bar.timestamp,
            signals,
            price: bar.close,
            volume: bar.volume,
            avg_volume,
            volume_ratio,
            price_change_pct,
            gap_pct,
            approx_atr,
        });

        state.update_from_bar(&bar);
    }

    fn update_prev_close(&mut self, symbol: &str, close: f64) {
        self.symbols
            .entry(symbol.to_string())
            .or_default()
            .update_prev_close(close);
    }

    fn flush_pending(&mut self, params: &ScannerParams, broadcast_hub: &SharedBroadcastHub) {
        if self.pending_alerts.is_empty() {
            return;
        }

        self.pending_alerts
            .sort_by(|left, right| right.volume_ratio.total_cmp(&left.volume_ratio));

        let max_candidates = params.max_candidates.max(1);
        let emitted_alerts: Vec<_> = self.pending_alerts.drain(..).take(max_candidates).collect();
        for alert in emitted_alerts {
            self.total_alerts = self.total_alerts.saturating_add(1);
            self.alert_timestamps.push_back(alert.timestamp);
            let _ = broadcast_hub.send_scanner_alert(alert);
        }

        self.prune_alert_history(Utc::now());
    }

    fn prune_alert_history(&mut self, now: DateTime<Utc>) {
        let cutoff = now - Duration::hours(1);
        while self
            .alert_timestamps
            .front()
            .is_some_and(|timestamp| *timestamp < cutoff)
        {
            let _ = self.alert_timestamps.pop_front();
        }
    }
}

/// Scanner service orchestrating bar processing and alert emission.
pub struct ScannerService {
    broadcast_hub: SharedBroadcastHub,
    params: RwLock<ScannerParams>,
    config_port: Option<Arc<dyn ScannerConfigPort>>,
    state: RwLock<ScannerRuntimeState>,
}

impl ScannerService {
    /// Create scanner service.
    #[must_use]
    pub fn new(
        broadcast_hub: SharedBroadcastHub,
        initial_params: ScannerParams,
        config_port: Option<Arc<dyn ScannerConfigPort>>,
    ) -> Self {
        Self {
            broadcast_hub,
            params: RwLock::new(initial_params),
            config_port,
            state: RwLock::new(ScannerRuntimeState::default()),
        }
    }

    /// Start processing stock bars from the broadcast hub.
    pub async fn run(self: Arc<Self>, cancel: CancellationToken) {
        let mut bar_rx = self.broadcast_hub.stock_bars_rx();

        loop {
            tokio::select! {
                () = cancel.cancelled() => {
                    break;
                }
                recv_result = bar_rx.recv() => {
                    match recv_result {
                        Ok(broadcast) => {
                            self.process_bar_message(broadcast.bar).await;
                        }
                        Err(broadcast::error::RecvError::Lagged(count)) => {
                            tracing::warn!(lagged = count, "Scanner bar receiver lagged");
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            tracing::warn!("Scanner bar receiver closed");
                            break;
                        }
                    }
                }
            }
        }

        self.flush_pending_alerts().await;
    }

    /// Update previous close state from a daily bar message.
    pub async fn handle_daily_bar(&self, bar: StockBarMessage) {
        let Some(close) = decimal_to_f64(bar.close) else {
            return;
        };

        let mut state = self.state.write().await;
        state.update_prev_close(&bar.symbol, close);
    }

    /// Get scanner runtime status.
    pub async fn status(&self) -> ScannerStatusSnapshot {
        let params = self.params.read().await.clone();

        let mut state = self.state.write().await;
        state.prune_alert_history(Utc::now());

        ScannerStatusSnapshot {
            active: params.enabled,
            symbols_tracked: state.symbols.len(),
            total_alerts: state.total_alerts,
            alerts_last_hour: state.alert_timestamps.len() as u64,
            config: params,
        }
    }

    /// Reload scanner config from backing repository.
    ///
    /// # Errors
    ///
    /// Returns an error if no repository is configured or the load fails.
    pub async fn reload_config(&self) -> Result<ScannerParams, String> {
        let Some(config_port) = &self.config_port else {
            return Err("scanner config repository is not configured".to_string());
        };

        let params = config_port
            .load_config()
            .await
            .map_err(|error| format!("failed to load scanner config: {error}"))?;

        *self.params.write().await = params.clone();
        Ok(params)
    }

    async fn process_bar_message(&self, bar_message: StockBarMessage) {
        let Some(bar) = stock_bar_to_scanner_bar(bar_message) else {
            return;
        };

        let params = self.params.read().await.clone();
        if !params.enabled {
            return;
        }

        let mut state = self.state.write().await;
        state.process_bar(bar, &params, &self.broadcast_hub);
    }

    async fn flush_pending_alerts(&self) {
        let params = self.params.read().await.clone();
        let mut state = self.state.write().await;
        state.flush_pending(&params, &self.broadcast_hub);
    }
}

fn stock_bar_to_scanner_bar(bar: StockBarMessage) -> Option<ScannerBar> {
    if bar.msg_type != "b" {
        return None;
    }

    Some(ScannerBar {
        symbol: bar.symbol,
        timestamp: bar.timestamp,
        high: decimal_to_f64(bar.high)?,
        low: decimal_to_f64(bar.low)?,
        close: decimal_to_f64(bar.close)?,
        volume: bar.volume,
    })
}

fn decimal_to_f64(value: Decimal) -> Option<f64> {
    f64::from_str(&value.to_string()).ok()
}
