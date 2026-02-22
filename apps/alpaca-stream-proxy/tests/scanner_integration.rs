//! Scanner integration tests.
//!
//! Verifies scanner bar processing, daily bar handling, config reload, and candidate capping.

#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{Duration as ChronoDuration, TimeZone, Utc};
use rust_decimal::Decimal;
use tokio::sync::RwLock;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use tonic::Request;
use tonic::transport::{Channel, Server};

use alpaca_stream_proxy::application::ports::scanner::ScannerConfigPort;
use alpaca_stream_proxy::proto::{
    GetScannerStatusRequest, ReloadScannerConfigRequest, ScannerSignalType,
    StreamScannerAlertsRequest, scanner_service_client::ScannerServiceClient,
    scanner_service_server::ScannerServiceServer,
};
use alpaca_stream_proxy::{
    BroadcastConfig, BroadcastHub, ScannerAppService, ScannerGrpcServer, ScannerParams,
    StockBarMessage,
};

struct MutableScannerConfigPort {
    params: RwLock<ScannerParams>,
}

impl MutableScannerConfigPort {
    fn new(params: ScannerParams) -> Self {
        Self {
            params: RwLock::new(params),
        }
    }
}

#[async_trait]
impl ScannerConfigPort for MutableScannerConfigPort {
    async fn load_config(&self) -> Result<ScannerParams, Box<dyn std::error::Error + Send + Sync>> {
        Ok(self.params.read().await.clone())
    }
}

struct ScannerHarness {
    client: ScannerServiceClient<Channel>,
    broadcast_hub: Arc<BroadcastHub>,
    scanner_service: Arc<ScannerAppService>,
    shutdown: CancellationToken,
    scanner_task: tokio::task::JoinHandle<()>,
    server_task: tokio::task::JoinHandle<()>,
}

impl ScannerHarness {
    async fn shutdown(self) {
        self.shutdown.cancel();
        let _ = timeout(Duration::from_secs(2), self.scanner_task).await;
        self.server_task.abort();
    }
}

async fn setup_scanner_harness(
    initial_params: ScannerParams,
    config_port: Option<Arc<dyn ScannerConfigPort>>,
) -> ScannerHarness {
    let broadcast_hub = Arc::new(BroadcastHub::new(BroadcastConfig::default()));
    let scanner_service = Arc::new(ScannerAppService::new(
        Arc::clone(&broadcast_hub),
        initial_params,
        config_port,
    ));
    let scanner_grpc =
        ScannerGrpcServer::new(Arc::clone(&scanner_service), Arc::clone(&broadcast_hub));

    let shutdown = CancellationToken::new();
    let scanner_task = {
        let scanner_service = Arc::clone(&scanner_service);
        let shutdown = shutdown.clone();
        tokio::spawn(async move {
            scanner_service.run(shutdown).await;
        })
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server_task = tokio::spawn(async move {
        Server::builder()
            .add_service(ScannerServiceServer::new(scanner_grpc))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;
    let client = ScannerServiceClient::connect(format!("http://{addr}"))
        .await
        .unwrap();

    ScannerHarness {
        client,
        broadcast_hub,
        scanner_service,
        shutdown,
        scanner_task,
        server_task,
    }
}

fn make_bar(
    symbol: &str,
    minute_offset: i64,
    close: f64,
    volume: i64,
    msg_type: &str,
) -> StockBarMessage {
    let timestamp = Utc.with_ymd_and_hms(2026, 1, 5, 14, 30, 0).unwrap()
        + ChronoDuration::minutes(minute_offset);

    StockBarMessage {
        msg_type: msg_type.to_string(),
        symbol: symbol.to_string(),
        open: Decimal::try_from(close - 0.5).unwrap(),
        high: Decimal::try_from(close + 0.5).unwrap(),
        low: Decimal::try_from(close - 1.0).unwrap(),
        close: Decimal::try_from(close).unwrap(),
        volume,
        trade_count: 100,
        vwap: Some(Decimal::try_from(close).unwrap()),
        timestamp,
    }
}

#[tokio::test]
async fn emits_scanner_alerts_from_streamed_bars() {
    let params = ScannerParams {
        min_price: 1.0,
        min_avg_volume: 50,
        volume_spike_threshold: 3.0,
        price_move_threshold: 100.0,
        gap_threshold: 100.0,
        max_candidates: 10,
        cooldown_seconds: 0,
        enabled: true,
    };

    let mut harness = setup_scanner_harness(params, None).await;
    let mut stream = harness
        .client
        .stream_scanner_alerts(Request::new(StreamScannerAlertsRequest {}))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    for minute in 0..20 {
        let _ = harness
            .broadcast_hub
            .send_stock_bar(make_bar("AAPL", minute, 100.0, 100, "b"));
    }

    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("AAPL", 20, 101.0, 300, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("AAPL", 21, 101.0, 100, "b"));

    let message = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timed out waiting for scanner alert")
        .expect("stream error")
        .expect("stream closed unexpectedly");

    let alert = message.alert.expect("scanner alert missing");
    assert_eq!(alert.symbol, "AAPL");
    assert!(
        alert
            .signals
            .contains(&(ScannerSignalType::VolumeSpike as i32))
    );

    harness.shutdown().await;
}

#[tokio::test]
async fn daily_bar_updates_enable_gap_signals() {
    let params = ScannerParams {
        min_price: 1.0,
        min_avg_volume: 50,
        volume_spike_threshold: 100.0,
        price_move_threshold: 100.0,
        gap_threshold: 2.0,
        max_candidates: 10,
        cooldown_seconds: 0,
        enabled: true,
    };

    let mut harness = setup_scanner_harness(params, None).await;
    let mut stream = harness
        .client
        .stream_scanner_alerts(Request::new(StreamScannerAlertsRequest {}))
        .await
        .unwrap()
        .into_inner();

    harness
        .scanner_service
        .handle_daily_bar(make_bar("MSFT", -1, 90.0, 1_000_000, "d"))
        .await;

    for minute in 0..20 {
        let _ = harness
            .broadcast_hub
            .send_stock_bar(make_bar("MSFT", minute, 100.0, 100, "b"));
    }

    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("MSFT", 20, 96.0, 100, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("MSFT", 21, 96.0, 100, "b"));

    let message = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timed out waiting for scanner alert")
        .expect("stream error")
        .expect("stream closed unexpectedly");

    let alert = message.alert.expect("scanner alert missing");
    assert_eq!(alert.symbol, "MSFT");
    assert!(alert.signals.contains(&(ScannerSignalType::Gap as i32)));

    harness.shutdown().await;
}

#[tokio::test]
async fn reload_scanner_config_applies_new_thresholds() {
    let initial_params = ScannerParams {
        min_price: 1.0,
        min_avg_volume: 50,
        volume_spike_threshold: 10.0,
        ..ScannerParams::default()
    };
    let reloaded_params = ScannerParams {
        min_price: 1.0,
        min_avg_volume: 50,
        volume_spike_threshold: 2.0,
        ..ScannerParams::default()
    };

    let config_port: Arc<dyn ScannerConfigPort> =
        Arc::new(MutableScannerConfigPort::new(reloaded_params));
    let mut harness = setup_scanner_harness(initial_params, Some(config_port)).await;

    let status_before = harness
        .client
        .get_scanner_status(Request::new(GetScannerStatusRequest {}))
        .await
        .unwrap()
        .into_inner();
    assert!(
        (status_before
            .config
            .expect("status config missing")
            .volume_spike_threshold
            - 10.0)
            .abs()
            < f64::EPSILON
    );

    let reload = harness
        .client
        .reload_scanner_config(Request::new(ReloadScannerConfigRequest {}))
        .await
        .unwrap()
        .into_inner();
    assert!(reload.success);
    assert!(
        (reload
            .config
            .expect("reload config missing")
            .volume_spike_threshold
            - 2.0)
            .abs()
            < f64::EPSILON
    );

    let mut stream = harness
        .client
        .stream_scanner_alerts(Request::new(StreamScannerAlertsRequest {}))
        .await
        .unwrap()
        .into_inner();

    for minute in 0..20 {
        let _ = harness
            .broadcast_hub
            .send_stock_bar(make_bar("TSLA", minute, 250.0, 100, "b"));
    }

    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("TSLA", 20, 251.0, 300, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("TSLA", 21, 251.0, 100, "b"));

    let message = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timed out waiting for scanner alert")
        .expect("stream error")
        .expect("stream closed unexpectedly");

    let alert = message.alert.expect("scanner alert missing");
    assert_eq!(alert.symbol, "TSLA");
    assert!(
        alert
            .signals
            .contains(&(ScannerSignalType::VolumeSpike as i32))
    );

    harness.shutdown().await;
}

#[tokio::test]
async fn emits_only_top_n_candidates_per_bucket() {
    let params = ScannerParams {
        min_price: 1.0,
        min_avg_volume: 50,
        volume_spike_threshold: 2.0,
        price_move_threshold: 100.0,
        gap_threshold: 100.0,
        max_candidates: 2,
        cooldown_seconds: 0,
        enabled: true,
    };

    let mut harness = setup_scanner_harness(params, None).await;
    let mut stream = harness
        .client
        .stream_scanner_alerts(Request::new(StreamScannerAlertsRequest {}))
        .await
        .unwrap()
        .into_inner();

    let symbols = ["AAPL", "MSFT", "NVDA"];
    for minute in 0..20 {
        for symbol in symbols {
            let _ = harness
                .broadcast_hub
                .send_stock_bar(make_bar(symbol, minute, 100.0, 100, "b"));
        }
    }

    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("AAPL", 20, 101.0, 500, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("MSFT", 20, 101.0, 400, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("NVDA", 20, 101.0, 300, "b"));
    let _ = harness
        .broadcast_hub
        .send_stock_bar(make_bar("AAPL", 21, 101.0, 100, "b"));

    let first = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timed out waiting for first scanner alert")
        .expect("stream error")
        .expect("stream closed unexpectedly")
        .alert
        .expect("first scanner alert missing");
    let second = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timed out waiting for second scanner alert")
        .expect("stream error")
        .expect("stream closed unexpectedly")
        .alert
        .expect("second scanner alert missing");

    let emitted: HashSet<_> = [first.symbol, second.symbol].into_iter().collect();
    assert!(emitted.contains("AAPL"));
    assert!(emitted.contains("MSFT"));
    assert!(!emitted.contains("NVDA"));

    let unexpected_third = timeout(Duration::from_millis(200), stream.message()).await;
    assert!(unexpected_third.is_err());

    harness.shutdown().await;
}
