# @cream/validation

Research-to-production parity validation for the Cream trading system.

## Overview

Ensures backtesting features match live trading capabilities:

- **Version Control** - Indicator version matching
- **Look-Ahead Bias** - Data sequencing validation
- **Fill Model Validation** - Simulated vs real fills
- **Statistical Parity** - Performance metric comparison
- **Data Consistency** - Source and adjustment validation

## Usage

### Parity Validation Service

```typescript
import { createParityValidationService } from "@cream/validation";

const service = createParityValidationService({
  repository: myRepo,
  metricsProvider: myMetricsProvider,
});

// Validate indicator
const result = await service.validateIndicator("sma-1", "PAPER");

// Validate factor
const result = await service.validateFactor("momentum-factor", "PAPER");

// Validate config promotion
const result = await service.validateConfigPromotion("PAPER", "LIVE");
```

### Direct Validation

```typescript
import { runParityValidation, comparePerformanceMetrics } from "@cream/validation";

const result = runParityValidation({
  backtestMetrics,
  liveMetrics,
  backtestRegistry,
  liveRegistry,
});

if (!result.passed) {
  console.log(result.blockingIssues);
}
```

## Validation Results

```typescript
interface ParityValidationResult {
  passed: boolean;
  recommendation: "APPROVE_FOR_LIVE" | "NEEDS_INVESTIGATION" | "NOT_READY";
  blockingIssues: ValidationIssue[];
  warnings: ValidationIssue[];
  // Detailed comparison data
}
```

## Default Tolerances

| Metric | Tolerance |
|--------|-----------|
| Sharpe Ratio | 20% |
| Sortino Ratio | 25% |
| Calmar Ratio | 30% |
| Max Drawdown | 15% |
| Total Return | 20% |
| Win Rate | 10% |

## Integration

Used in config promotion workflow:
- Part of `/config` → `/config/promote` dashboard flow
- Validates before DRAFT → TEST → ACTIVE transitions

## Dependencies

- `zod` - Schema validation
