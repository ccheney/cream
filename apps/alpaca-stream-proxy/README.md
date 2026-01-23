# Alpaca Stream Proxy

Rust gRPC service that multiplexes a single Alpaca WebSocket connection to multiple downstream consumers.

## Overview

Alpaca Markets enforces exactly one active WebSocket connection per account. This service maintains that single connection and distributes market data via gRPC streaming to multiple consumers (dashboard-api, execution-engine, etc.).

```
┌─────────────────────────────────────────────────────────────────┐
│                    alpaca-stream-proxy (Rust)                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    WebSocket Clients                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ SIP Stream  │  │ OPRA Stream │  │ Trade Updates   │   │  │
│  │  │ (stocks)    │  │ (options)   │  │ (orders)        │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           Broadcast Channels (tokio::sync::broadcast)     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    gRPC Server (tonic)                    │  │
│  │  • StreamQuotes(symbols) → stream<Quote>                  │  │
│  │  • StreamTrades(symbols) → stream<Trade>                  │  │
│  │  • StreamBars(symbols) → stream<Bar>                      │  │
│  │  • StreamOptionQuotes(contracts) → stream<OptionQuote>    │  │
│  │  • StreamOrderUpdates() → stream<OrderUpdate>             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
     ┌──────────────────┐         ┌──────────────────┐
     │   dashboard-api  │         │ execution-engine │
     │  (gRPC client)   │         │  (gRPC client)   │
     └──────────────────┘         └──────────────────┘
```

## Features

- **Single connection multiplexing**: Maintains one WebSocket connection per stream type
- **gRPC streaming**: Type-safe distribution via Protocol Buffers
- **Automatic reconnection**: Exponential backoff with jitter
- **Heartbeat monitoring**: Detects stale connections
- **Subscription management**: Aggregates symbols across consumers
- **Prometheus metrics**: Connection health, message throughput, latency
- **OpenTelemetry tracing**: Distributed tracing support

## Streams

| Stream | Endpoint | Format | Data |
|--------|----------|--------|------|
| SIP (stocks) | `wss://stream.data.alpaca.markets/v2/sip` | JSON | Quotes, trades, bars |
| OPRA (options) | `wss://stream.data.alpaca.markets/v1beta1/opra` | msgpack | Option quotes, trades |
| Trade Updates | `wss://[paper-]api.alpaca.markets/stream` | JSON | Order fills, cancellations |

## Environment Variables

### Required

```bash
ALPACA_KEY=...           # Alpaca API key
ALPACA_SECRET=...        # Alpaca API secret
CREAM_ENV=PAPER|LIVE     # Environment (determines endpoints)
```

### Optional

```bash
ALPACA_FEED=sip                    # Market data feed (sip or iex, default: sip)
STREAM_PROXY_GRPC_PORT=50052       # gRPC server port (default: 50052)
STREAM_PROXY_HEALTH_PORT=8082      # Health check HTTP port (default: 8082)
STREAM_PROXY_METRICS_PORT=9090     # Prometheus metrics port (default: 9090)
OTEL_ENABLED=true                  # Enable OpenTelemetry (default: true)
OTEL_EXPORTER_OTLP_ENDPOINT=...    # OTLP endpoint (default: http://localhost:4318)
RUST_LOG=info                      # Log level
```

## Running

```bash
# Development
cargo run --bin alpaca-stream-proxy

# Production
cargo build --release --bin alpaca-stream-proxy
./target/release/alpaca-stream-proxy
```

## Docker

```bash
# Build
docker build -t alpaca-stream-proxy .

# Run
docker run -e ALPACA_KEY=... -e ALPACA_SECRET=... -e CREAM_ENV=PAPER \
  -p 50052:50052 -p 8082:8082 alpaca-stream-proxy
```

## Health Check

```bash
curl http://localhost:8082/health
```

```json
{
  "status": "healthy",
  "upstream": {
    "stocks": { "connected": true, "lastMessage": "2026-01-22T15:30:00.123Z" },
    "options": { "connected": true, "lastMessage": "2026-01-22T15:30:00.456Z" },
    "trading": { "connected": true, "lastMessage": "2026-01-22T15:29:55.789Z" }
  },
  "subscriptions": {
    "stocks": 47,
    "options": 156
  },
  "consumers": 2
}
```

## Protobuf Service

See `packages/schema/cream/v1/stream_proxy.proto` for the full service definition.

```protobuf
service StreamProxyService {
  rpc StreamQuotes(StreamQuotesRequest) returns (stream QuotesResponse);
  rpc StreamTrades(StreamTradesRequest) returns (stream TradesResponse);
  rpc StreamBars(StreamBarsRequest) returns (stream BarsResponse);
  rpc StreamOptionQuotes(StreamOptionQuotesRequest) returns (stream OptionQuotesResponse);
  rpc StreamOptionTrades(StreamOptionTradesRequest) returns (stream OptionTradesResponse);
  rpc StreamOrderUpdates(StreamOrderUpdatesRequest) returns (stream OrderUpdatesResponse);
  rpc GetConnectionStatus(GetConnectionStatusRequest) returns (GetConnectionStatusResponse);
}
```

## Consumers

### TypeScript (dashboard-api)

```typescript
import { streamQuotes, streamTrades } from "./streaming/proxy-client.js";

// Stream quotes
for await (const quote of streamQuotes(["AAPL", "MSFT"], { signal })) {
  console.log(quote.symbol, quote.bidPrice, quote.askPrice);
}
```

### Rust (execution-engine)

```rust
use crate::infrastructure::proxy::ProxyClient;

let mut client = ProxyClient::connect("http://localhost:50052").await?;
let mut stream = client.stream_quotes(vec!["AAPL".into()]).await?;

while let Some(quote) = stream.next().await {
  println!("{}: {} x {}", quote.symbol, quote.bid_price, quote.ask_price);
}
```

## Metrics

Prometheus metrics available at `http://localhost:9090/metrics`:

```
# Connection health
alpaca_proxy_upstream_connections_active{stream="stocks|options|trading"}
alpaca_proxy_upstream_reconnections_total{stream="stocks|options|trading"}

# Message throughput
alpaca_proxy_messages_received_total{stream, type}
alpaca_proxy_messages_sent_total{consumer}

# Latency
alpaca_proxy_message_latency_seconds{quantile="0.5|0.9|0.99"}
```

## Architecture

See [docs/plans/52-websocket-proxy.md](../../docs/plans/52-websocket-proxy.md) for the full design document.
