# proto

Protobuf .proto definitions for service contracts, shared messages, and cross-language type safety (TypeScript ↔ Rust).

## Key Dependencies

- **Buf CLI** - Protobuf linting, breaking change detection, code generation
  - Use context7 for proto3 syntax, buf.yaml configuration
  - Web search for Buf Schema Registry, proto3 best practices, gRPC service patterns

## Related Plans

- `/docs/plans/55-codegen-sources-of-truth.md` - Code generation strategy

## Structure

- `*.proto` - Service and message definitions
- `buf.yaml` - Buf configuration
- `buf.gen.yaml` - Code generation config
