# domain

Core domain primitives, Zod schemas, time utilities, and protobuf integration. Foundation for all business logic.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **zod v4** - Domain model validation
- **@bufbuild/protobuf** - Protobuf runtime for TS
- **@connectrpc/connect** - gRPC-Web and Connect RPC
  - Use context7 for Zod v4, Protobuf ESM patterns, Connect RPC client setup
  - Web search for Buf Schema Registry integration and proto3 best practices

## Related Plans

- `/docs/plans/06-decision-contract.md` - Trading decision schema
- `/docs/plans/29-execution-context.md` - Context propagation patterns

## Structure

- `src/schemas/` - Core Zod domain schemas
- `src/time/` - Market hours, time zone utilities
- `src/proto/` - Protobuf message definitions
