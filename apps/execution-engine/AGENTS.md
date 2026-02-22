# Execution Engine

Rust gRPC server for deterministic order routing and risk management. Validates DecisionPlans from agents.

## Skills
Always activate: `clean-ddd-hexagonal`

## Key Dependencies
- **tonic** - gRPC framework → use context7 for `tonic` docs
- **axum** - HTTP server → use context7 for `axum` docs
- **sqlx** - PostgreSQL driver → use context7 for `sqlx` docs
- **rust_decimal** - precise decimal arithmetic

## Related Plans
- [docs/plans/07-execution.md](../../docs/plans/07-execution.md)
- [docs/plans/49-execution-engine-clean-architecture-refactor.md](../../docs/plans/49-execution-engine-clean-architecture-refactor.md)
- [docs/plans/09-rust-core.md](../../docs/plans/09-rust-core.md)

## Notes
- Clean Architecture layers: domain → application → infrastructure
- Order state machine with risk validation pipeline
- Rust edition 2024, Clippy for linting
