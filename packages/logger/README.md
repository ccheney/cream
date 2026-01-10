# @cream/logger

Structured logging for the Cream trading system.

## Overview

Provides Pino-based logging with:

- **Structured output** - JSON in production, pretty in development
- **Automatic redaction** - Sensitive data masked
- **Lifecycle management** - Graceful flush and destroy
- **Context propagation** - Trace and tenant contexts

## Usage

### Basic Logger

```typescript
import { createNodeLogger } from "@cream/logger";

const log = createNodeLogger({
  service: "trading-cycle",
  level: "info",
  environment: process.env.CREAM_ENV,
});

log.info("Trading cycle started", { symbol: "AAPL" });
await log.flush();
await log.destroy();
```

### With Trace Context

```typescript
import { withTraceContext } from "@cream/logger";

const tracedLogger = withTraceContext(log, {
  correlationId: "req-123",
  traceId: "trace-456",
});
```

### Consensus Logger (Mastra)

```typescript
import { createConsensusLogger } from "@cream/logger";

const consensusLog = createConsensusLogger(log);
// Compatible with Mastra agent logging interface
```

## Automatic Redaction

Sensitive fields are replaced with `[REDACTED]`:

- Authorization headers, cookies
- API keys, tokens, passwords
- Email, phone, SSN
- Trading credentials (ALPACA_KEY, etc.)

## Log Format

### Development (Pretty)
```
18:45:32 INFO  (trading-cycle) Trading cycle started
         symbol: "AAPL"
```

### Production (JSON)
```json
{"level":30,"service":"trading-cycle","symbol":"AAPL","msg":"Trading cycle started"}
```

## Dependencies

- `pino` - High-performance logger
- `pino-pretty` - Development formatting
