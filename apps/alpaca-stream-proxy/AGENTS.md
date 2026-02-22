# Alpaca Stream Proxy

Rust gRPC proxy maintaining persistent WebSocket connections to Alpaca's market data feeds, multiplexing to downstream clients.

## Skills
Always activate: `clean-ddd-hexagonal`

## Key Dependencies
- **tonic** - gRPC framework → use context7 for `tonic` docs
- **tokio-tungstenite** - async WebSocket → use context7 for `tokio-tungstenite` docs
- **rmp-serde** - MessagePack serialization for OPRA feed

## Related Plans
- [docs/plans/52-websocket-proxy.md](../../docs/plans/52-websocket-proxy.md)
- [docs/plans/09-rust-core.md](../../docs/plans/09-rust-core.md)

## Notes
- Uses Rust edition 2024, built with `cargo build`
- Clippy for linting: `cargo clippy`
- Protobuf schemas in `packages/schema/` define gRPC service contracts
