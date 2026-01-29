# infra

OpenTofu infrastructure definitions and OpenTelemetry instrumentation for observability.

## Key Dependencies

- **OpenTofu** - Terraform fork for IaC
- **OpenTelemetry** - Traces, metrics, logs
  - Use context7 for OpenTofu module patterns (if available)
  - Web search for OpenTofu best practices, OpenTelemetry Bun.js instrumentation

## Related Plans

- `/docs/plans/13-operations.md` - Observability and deployment

## Structure

- `tofu/` - OpenTofu modules for Hetzner Cloud
- `src/telemetry/` - OpenTelemetry setup and custom spans
