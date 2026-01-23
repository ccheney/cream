//! gRPC Streaming Integration Tests
//!
//! Tests the full data flow from message injection to gRPC client reception.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use rust_decimal::Decimal;
use tokio::time::timeout;
use tonic::Request;
use tonic::transport::{Channel, Server};

use alpaca_stream_proxy::{
    BroadcastConfig, BroadcastHub, StockBarMessage, StockQuoteMessage, StockTradeMessage,
    StreamProxyServer, StreamProxyServerConfig, SubscriptionManager,
    proto::{
        Environment, GetConnectionStatusRequest, StreamBarsRequest, StreamQuotesRequest,
        StreamTradesRequest, stream_proxy_service_client::StreamProxyServiceClient,
        stream_proxy_service_server::StreamProxyServiceServer,
    },
};

/// Start a test gRPC server on a random port and return the client.
async fn setup_test_server() -> (
    StreamProxyServiceClient<Channel>,
    Arc<BroadcastHub>,
    tokio::task::JoinHandle<()>,
) {
    let broadcast_hub = Arc::new(BroadcastHub::new(BroadcastConfig::default()));
    let subscription_manager = Arc::new(SubscriptionManager::new());

    let config = StreamProxyServerConfig {
        version: "test-0.0.1".to_string(),
        environment: Environment::Paper,
    };

    let server = StreamProxyServer::new(config, Arc::clone(&broadcast_hub), subscription_manager);

    // Find an available port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    // Start gRPC server
    let server_handle = tokio::spawn(async move {
        Server::builder()
            .add_service(StreamProxyServiceServer::new(server))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    // Give server time to start
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Create client
    let client = StreamProxyServiceClient::connect(format!("http://{addr}"))
        .await
        .unwrap();

    (client, broadcast_hub, server_handle)
}

fn make_test_quote(symbol: &str, bid: f64, ask: f64) -> StockQuoteMessage {
    StockQuoteMessage {
        msg_type: "q".to_string(),
        symbol: symbol.to_string(),
        bid_exchange: "V".to_string(),
        bid_price: Decimal::try_from(bid).unwrap(),
        bid_size: 100,
        ask_exchange: "V".to_string(),
        ask_price: Decimal::try_from(ask).unwrap(),
        ask_size: 200,
        timestamp: Utc::now(),
        conditions: vec![],
        tape: "A".to_string(),
    }
}

fn make_test_trade(symbol: &str, price: f64, size: i32) -> StockTradeMessage {
    StockTradeMessage {
        msg_type: "t".to_string(),
        symbol: symbol.to_string(),
        trade_id: 12345,
        exchange: "V".to_string(),
        price: Decimal::try_from(price).unwrap(),
        size,
        timestamp: Utc::now(),
        conditions: vec![],
        tape: "A".to_string(),
    }
}

fn make_test_bar(symbol: &str, open: f64, high: f64, low: f64, close: f64) -> StockBarMessage {
    StockBarMessage {
        msg_type: "b".to_string(),
        symbol: symbol.to_string(),
        open: Decimal::try_from(open).unwrap(),
        high: Decimal::try_from(high).unwrap(),
        low: Decimal::try_from(low).unwrap(),
        close: Decimal::try_from(close).unwrap(),
        volume: 10000,
        trade_count: 50,
        vwap: Some(Decimal::try_from(f64::midpoint(open, close)).unwrap()),
        timestamp: Utc::now(),
    }
}

// =============================================================================
// Connection Status Tests
// =============================================================================

#[tokio::test]
async fn test_get_connection_status() {
    let (mut client, _hub, handle) = setup_test_server().await;

    let response = client
        .get_connection_status(Request::new(GetConnectionStatusRequest {}))
        .await
        .unwrap();

    let status = response.into_inner().status.unwrap();
    assert_eq!(status.version, "test-0.0.1");
    assert_eq!(status.environment, Environment::Paper as i32);
    assert_eq!(status.feeds.len(), 3); // SIP, OPRA, Trade Updates

    handle.abort();
}

// =============================================================================
// Quote Streaming Tests
// =============================================================================

#[tokio::test]
async fn test_stream_quotes_receives_broadcast_messages() {
    let (mut client, hub, handle) = setup_test_server().await;

    // Start streaming (subscribe to all symbols)
    let mut stream = client
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec![], // Empty = subscribe to all
        }))
        .await
        .unwrap()
        .into_inner();

    // Give stream time to set up
    tokio::time::sleep(Duration::from_millis(20)).await;

    // Send a quote through the broadcast hub
    let quote = make_test_quote("AAPL", 150.0, 150.05);
    let _ = hub.send_stock_quote(quote);

    // Receive the quote from the stream
    let received = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timeout waiting for quote")
        .expect("stream error")
        .expect("no message");

    let quote = received.quote.unwrap();
    assert_eq!(quote.symbol, "AAPL");
    assert!((quote.bid_price - 150.0).abs() < 0.01);
    assert!((quote.ask_price - 150.05).abs() < 0.01);

    handle.abort();
}

#[tokio::test]
async fn test_stream_quotes_filters_by_symbol() {
    let (mut client, hub, handle) = setup_test_server().await;

    // Subscribe only to AAPL
    let mut stream = client
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec!["AAPL".to_string()],
        }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Send quotes for different symbols
    let _ = hub.send_stock_quote(make_test_quote("MSFT", 300.0, 300.05));
    let _ = hub.send_stock_quote(make_test_quote("AAPL", 150.0, 150.05));
    let _ = hub.send_stock_quote(make_test_quote("GOOG", 140.0, 140.05));

    // Should only receive AAPL
    let received = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    assert_eq!(received.quote.unwrap().symbol, "AAPL");

    // No more messages should be immediately available (MSFT and GOOG filtered)
    let result = timeout(Duration::from_millis(100), stream.message()).await;
    assert!(
        result.is_err(),
        "should timeout - no more messages expected"
    );

    handle.abort();
}

// =============================================================================
// Trade Streaming Tests
// =============================================================================

#[tokio::test]
async fn test_stream_trades_receives_broadcast_messages() {
    let (mut client, hub, handle) = setup_test_server().await;

    let mut stream = client
        .stream_trades(Request::new(StreamTradesRequest { symbols: vec![] }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    let _ = hub.send_stock_trade(make_test_trade("TSLA", 250.50, 100));

    let received = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    let trade = received.trade.unwrap();
    assert_eq!(trade.symbol, "TSLA");
    assert!((trade.price - 250.50).abs() < 0.01);
    assert_eq!(trade.size, 100);

    handle.abort();
}

// =============================================================================
// Bar Streaming Tests
// =============================================================================

#[tokio::test]
async fn test_stream_bars_receives_broadcast_messages() {
    let (mut client, hub, handle) = setup_test_server().await;

    let mut stream = client
        .stream_bars(Request::new(StreamBarsRequest { symbols: vec![] }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    let _ = hub.send_stock_bar(make_test_bar("SPY", 450.0, 452.0, 449.0, 451.5));

    let received = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    let bar = received.bar.unwrap();
    assert_eq!(bar.symbol, "SPY");
    assert!((bar.open - 450.0).abs() < 0.01);
    assert!((bar.high - 452.0).abs() < 0.01);
    assert!((bar.low - 449.0).abs() < 0.01);
    assert!((bar.close - 451.5).abs() < 0.01);
    assert_eq!(bar.volume, 10000);

    handle.abort();
}

// =============================================================================
// Multiple Consumer Tests
// =============================================================================

#[tokio::test]
async fn test_multiple_consumers_receive_same_message() {
    let (mut client1, hub, handle) = setup_test_server().await;
    let mut client2 = client1.clone();

    // Both clients subscribe to AAPL
    let mut stream1 = client1
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec!["AAPL".to_string()],
        }))
        .await
        .unwrap()
        .into_inner();

    let mut stream2 = client2
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec!["AAPL".to_string()],
        }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Send one quote
    let _ = hub.send_stock_quote(make_test_quote("AAPL", 150.0, 150.05));

    // Both should receive it
    let r1 = timeout(Duration::from_secs(2), stream1.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    let r2 = timeout(Duration::from_secs(2), stream2.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    assert_eq!(r1.quote.unwrap().symbol, "AAPL");
    assert_eq!(r2.quote.unwrap().symbol, "AAPL");

    handle.abort();
}

#[tokio::test]
async fn test_consumers_with_overlapping_symbols() {
    let (mut client1, hub, handle) = setup_test_server().await;
    let mut client2 = client1.clone();

    // Client 1 subscribes to AAPL and MSFT
    let mut stream1 = client1
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
        }))
        .await
        .unwrap()
        .into_inner();

    // Client 2 subscribes to MSFT and GOOG
    let mut stream2 = client2
        .stream_quotes(Request::new(StreamQuotesRequest {
            symbols: vec!["MSFT".to_string(), "GOOG".to_string()],
        }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Send MSFT quote (both should receive)
    let _ = hub.send_stock_quote(make_test_quote("MSFT", 300.0, 300.05));

    let r1 = timeout(Duration::from_secs(2), stream1.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    let r2 = timeout(Duration::from_secs(2), stream2.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    assert_eq!(r1.quote.unwrap().symbol, "MSFT");
    assert_eq!(r2.quote.unwrap().symbol, "MSFT");

    // Send AAPL quote (only client 1 should receive)
    let _ = hub.send_stock_quote(make_test_quote("AAPL", 150.0, 150.05));

    let r1 = timeout(Duration::from_secs(2), stream1.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    assert_eq!(r1.quote.unwrap().symbol, "AAPL");

    // Client 2 should not receive (AAPL not in subscription)
    let result = timeout(Duration::from_millis(100), stream2.message()).await;
    assert!(result.is_err());

    handle.abort();
}

// =============================================================================
// High Throughput Tests
// =============================================================================

#[tokio::test]
async fn test_high_throughput_quote_streaming() {
    let (mut client, hub, handle) = setup_test_server().await;

    let mut stream = client
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Send 100 quotes rapidly
    for i in 0..100 {
        let _ = hub.send_stock_quote(make_test_quote("AAPL", f64::from(i).mul_add(0.01, 150.0), 150.05));
    }

    // Count received messages
    let mut count = 0;
    let start = std::time::Instant::now();

    while count < 100 && start.elapsed() < Duration::from_secs(5) {
        if let Ok(Ok(Some(_))) = timeout(Duration::from_millis(100), stream.message()).await {
            count += 1;
        } else {
            break;
        }
    }

    // Should receive all or most messages (some may be lagged if buffer full)
    assert!(count >= 90, "Expected at least 90 messages, got {count}");

    handle.abort();
}
