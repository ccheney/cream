# schema-gen

Generated Protobuf stubs (TypeScript and Rust) from `packages/proto/`. Auto-generated via `buf generate` — do not edit manually.

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **@bufbuild/protobuf** - Protobuf runtime for TypeScript
- **@connectrpc/connect** - Connect RPC client/server
  - Use context7 for @bufbuild/protobuf API, @connectrpc/connect service patterns
  - Web search for Buf code generation plugins, prost (Rust protobuf)

## Related Plans

- `/docs/plans/55-codegen-sources-of-truth.md` - Code generation workflow

## Structure

- `ts/` - Generated TypeScript stubs
- `rust/` - Generated Rust stubs (if present)
- **NOTE**: All files auto-generated, do not edit
