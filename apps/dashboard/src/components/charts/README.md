# Charts

Chart components for the Cream trading dashboard.

## Overview

All chart components are built for real-time trading data visualization with accessibility, responsive design, and performance optimization.

### Technology

- **TradingView Charts**: `lightweight-charts` for candlestick/OHLCV
- **Recharts**: Area, bar, pie/donut charts
- **Custom SVG**: Sparklines and gauges

## Components

### TradingViewChart

Candlestick chart for price action visualization.

```tsx
import TradingViewChart from "@/components/charts/TradingViewChart";

<TradingViewChart
  data={candles}
  markers={[
    { time: "2026-01-04", position: "belowBar", text: "BUY" },
  ]}
  priceLines={[
    { price: 145, color: "#ef4444", title: "Stop Loss" },
  ]}
  height={400}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `OHLCVData[]` | required | OHLCV candle data |
| `markers` | `TradeMarker[]` | `[]` | Trade markers (BUY/SELL) |
| `priceLines` | `PriceLineConfig[]` | `[]` | Horizontal price lines |
| `height` | `number` | `400` | Chart height in pixels |
| `autoResize` | `boolean` | `true` | Auto-resize to container |

---

### EquityCurve

Area chart for portfolio value over time.

```tsx
import { EquityCurve } from "@/components/charts/EquityCurve";

<EquityCurve
  data={equityData}
  height={300}
  valueFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `EquityDataPoint[]` | required | Time series data |
| `height` | `number` | `300` | Chart height |
| `showGrid` | `boolean` | `true` | Show grid lines |
| `showTooltip` | `boolean` | `true` | Enable tooltip |
| `valueFormatter` | `(v: number) => string` | - | Custom value formatting |

---

### AllocationChart

Pie/donut chart for portfolio allocation.

```tsx
import { AllocationChart } from "@/components/charts/AllocationChart";

<AllocationChart
  data={[
    { name: "Technology", value: 35, color: "#3b82f6" },
    { name: "Healthcare", value: 25 },
  ]}
  size={280}
  innerRadius={60}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `AllocationDataPoint[]` | required | Allocation data |
| `size` | `number` | `300` | Diameter in pixels |
| `innerRadius` | `number` | `60` | Inner radius % (0 = pie) |
| `showLegend` | `boolean` | `true` | Show legend |

---

### ReturnsChart

Bar chart for periodic returns.

```tsx
import { ReturnsChart } from "@/components/charts/ReturnsChart";

<ReturnsChart
  data={[
    { period: "Jan", value: 3.2 },
    { period: "Feb", value: -1.5 },
  ]}
  height={250}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ReturnDataPoint[]` | required | Returns data |
| `height` | `number` | `250` | Chart height |
| `showGrid` | `boolean` | `true` | Show grid lines |

---

### Sparkline

Compact inline chart for trends.

```tsx
import { Sparkline } from "@/components/charts/Sparkline";

<Sparkline
  data={[10, 12, 11, 15, 18, 16, 20]}
  width={80}
  height={24}
  autoColor
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `number[]` | required | Data points |
| `width` | `number` | `80` | Width in pixels |
| `height` | `number` | `24` | Height in pixels |
| `color` | `string` | auto | Line color |
| `autoColor` | `boolean` | `false` | Auto-detect from trend |
| `showLastPoint` | `boolean` | `true` | Show end dot |

---

### Gauge

Arc gauge for percentage values.

```tsx
import { Gauge } from "@/components/charts/Gauge";

<Gauge
  value={72}
  size={120}
  label="Risk Level"
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | required | Value (0-100) |
| `size` | `number` | `120` | Diameter in pixels |
| `label` | `string` | - | Label below value |
| `animate` | `boolean` | `true` | Animate changes |
| `thresholds` | `GaugeThresholds` | default | Color thresholds |

---

## Styling

All charts use the design system color palette:

- **Green** (`#22c55e`): Positive values, gains
- **Red** (`#ef4444`): Negative values, losses
- **Blue** (`#3b82f6`): Primary actions
- **Gray** (`#78716c`): Neutral, axes, grid

## Accessibility

All charts include:

- ARIA labels for screen readers
- Keyboard navigation where applicable
- `prefers-reduced-motion` support
- High contrast colors meeting WCAG 2.1 AA

## Performance

Charts are optimized with:

- `memo()` to prevent unnecessary re-renders
- Lazy loading for heavy components
- Data decimation for large datasets
- Efficient WebSocket update handlers

## Storybook

Run Storybook to view all chart variants:

```bash
bun run storybook
```

Stories available:
- `Charts/TradingView/Candlestick`
- `Charts/Performance/EquityCurve`
- `Charts/Performance/Returns`
- `Charts/Portfolio/Allocation`
- `Charts/Indicators/Sparkline`
- `Charts/Indicators/Gauge`
