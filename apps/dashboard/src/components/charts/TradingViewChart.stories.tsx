/**
 * TradingView Chart Stories
 *
 * Storybook stories for candlestick chart component.
 *
 * @see docs/plans/ui/26-data-viz.md lines 7-86
 */

import type { Meta, StoryObj } from "@storybook/react";
import type { OHLCVData, PriceLineConfig, TradeMarker } from "@/lib/chart-config";
import TradingViewChart from "./TradingViewChart";

// ============================================
// Sample Data
// ============================================

function generateSampleCandles(days = 30): OHLCVData[] {
  const data: OHLCVData[] = [];
  let price = 150;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const open = price;
    const change = (Math.random() - 0.5) * 6;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    const volume = Math.floor(Math.random() * 1000000) + 500000;

    data.push({
      time: date.toISOString().split("T")[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    price = close;
  }

  return data;
}

const sampleCandles = generateSampleCandles(60);

const sampleMarkers: TradeMarker[] = [
  {
    time: sampleCandles[15].time,
    position: "belowBar",
    color: "#22c55e",
    shape: "arrowUp",
    text: "BUY @ 148.50",
  },
  {
    time: sampleCandles[35].time,
    position: "aboveBar",
    color: "#ef4444",
    shape: "arrowDown",
    text: "SELL @ 155.20",
  },
];

const samplePriceLines: PriceLineConfig[] = [
  {
    price: 145,
    color: "#ef4444",
    lineWidth: 2,
    lineStyle: 2, // Dashed
    title: "Stop Loss",
  },
  {
    price: 165,
    color: "#22c55e",
    lineWidth: 2,
    lineStyle: 2,
    title: "Take Profit",
  },
];

// ============================================
// Meta
// ============================================

const meta: Meta<typeof TradingViewChart> = {
  title: "Charts/TradingView/Candlestick",
  component: TradingViewChart,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Candlestick chart using TradingView Lightweight Charts. Supports trade markers, price lines, and real-time updates.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    height: {
      control: { type: "number", min: 200, max: 800 },
      description: "Chart height in pixels",
    },
    autoResize: {
      control: "boolean",
      description: "Auto-resize to container width",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", maxWidth: "800px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TradingViewChart>;

// ============================================
// Stories
// ============================================

export const Default: Story = {
  args: {
    data: sampleCandles,
    height: 400,
  },
};

export const WithTradeMarkers: Story = {
  args: {
    data: sampleCandles,
    markers: sampleMarkers,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: "Chart with BUY and SELL trade markers.",
      },
    },
  },
};

export const WithPriceLines: Story = {
  args: {
    data: sampleCandles,
    priceLines: samplePriceLines,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: "Chart with stop-loss and take-profit price lines.",
      },
    },
  },
};

export const FullFeatured: Story = {
  args: {
    data: sampleCandles,
    markers: sampleMarkers,
    priceLines: samplePriceLines,
    height: 500,
  },
  parameters: {
    docs: {
      description: {
        story: "Full-featured chart with markers and price lines.",
      },
    },
  },
};

export const Compact: Story = {
  args: {
    data: sampleCandles.slice(-14),
    height: 250,
  },
  parameters: {
    docs: {
      description: {
        story: "Compact 2-week view.",
      },
    },
  },
};

export const LongHistory: Story = {
  args: {
    data: generateSampleCandles(180),
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: "6-month chart with extended history.",
      },
    },
  },
};

// ============================================
// Example Usage
// ============================================

export const ExampleUsage: Story = {
  render: () => (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: 0 }}>AAPL Stock Price</h3>
        <p style={{ color: "#78716c", fontSize: "14px", margin: "4px 0 0" }}>Last 60 days • NYSE</p>
      </div>
      <TradingViewChart
        data={sampleCandles}
        markers={sampleMarkers}
        priceLines={samplePriceLines}
        height={450}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Example usage with title and context.",
      },
    },
  },
};
