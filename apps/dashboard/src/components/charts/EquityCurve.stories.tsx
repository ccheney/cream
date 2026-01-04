/**
 * Equity Curve Stories
 *
 * Storybook stories for equity curve chart component.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { Meta, StoryObj } from "@storybook/react";
import { EquityCurve } from "./EquityCurve";
import type { EquityDataPoint } from "./EquityCurve";

// ============================================
// Sample Data
// ============================================

function generateEquityData(days: number = 90): EquityDataPoint[] {
  const data: EquityDataPoint[] = [];
  let equity = 100000;
  let peak = equity;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Add some randomness with overall upward trend
    const dailyReturn = (Math.random() - 0.45) * 0.02;
    equity = equity * (1 + dailyReturn);

    // Track peak for drawdown
    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;

    data.push({
      time: date.toISOString().split("T")[0],
      value: Math.round(equity * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    });
  }

  return data;
}

const sampleEquityData = generateEquityData(180);

function generateFlatData(days: number = 30): EquityDataPoint[] {
  const data: EquityDataPoint[] = [];
  const equity = 100000;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    data.push({
      time: date.toISOString().split("T")[0],
      value: equity + (Math.random() - 0.5) * 500,
    });
  }

  return data;
}

function generateDownwardData(days: number = 60): EquityDataPoint[] {
  const data: EquityDataPoint[] = [];
  let equity = 100000;
  let peak = equity;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Downward trend
    const dailyReturn = (Math.random() - 0.6) * 0.015;
    equity = equity * (1 + dailyReturn);

    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;

    data.push({
      time: date.toISOString().split("T")[0],
      value: Math.round(equity * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    });
  }

  return data;
}

// ============================================
// Meta
// ============================================

const meta: Meta<typeof EquityCurve> = {
  title: "Charts/Performance/EquityCurve",
  component: EquityCurve,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Equity curve chart showing portfolio value over time. Built with Recharts.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    height: {
      control: { type: "number", min: 150, max: 600 },
      description: "Chart height in pixels",
    },
    showGrid: {
      control: "boolean",
      description: "Show grid lines",
    },
    showTooltip: {
      control: "boolean",
      description: "Show tooltip on hover",
    },
    showXAxis: {
      control: "boolean",
      description: "Show X axis",
    },
    showYAxis: {
      control: "boolean",
      description: "Show Y axis",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", maxWidth: "700px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EquityCurve>;

// ============================================
// Stories
// ============================================

export const Default: Story = {
  args: {
    data: sampleEquityData,
    height: 300,
  },
};

export const WithCustomFormatter: Story = {
  args: {
    data: sampleEquityData,
    height: 300,
    valueFormatter: (v) => `$${(v / 1000).toFixed(1)}k`,
  },
  parameters: {
    docs: {
      description: {
        story: "With custom value formatter showing thousands.",
      },
    },
  },
};

export const Compact: Story = {
  args: {
    data: sampleEquityData.slice(-30),
    height: 200,
    showGrid: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Compact 30-day view without grid.",
      },
    },
  },
};

export const MinimalAxes: Story = {
  args: {
    data: sampleEquityData,
    height: 250,
    showXAxis: false,
    showGrid: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Minimal view without X axis.",
      },
    },
  },
};

export const FlatPerformance: Story = {
  args: {
    data: generateFlatData(60),
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Flat performance with minimal volatility.",
      },
    },
  },
};

export const Drawdown: Story = {
  args: {
    data: generateDownwardData(90),
    height: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Portfolio in drawdown period.",
      },
    },
  },
};

// ============================================
// Dashboard Example
// ============================================

export const DashboardCard: Story = {
  render: () => (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#ffffff",
        borderRadius: "8px",
        border: "1px solid #e7e5e4",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "16px" }}>Portfolio Value</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
          <span style={{ fontSize: "24px", fontWeight: 600 }}>
            ${(sampleEquityData[sampleEquityData.length - 1].value / 1000).toFixed(1)}k
          </span>
          <span style={{ color: "#22c55e", fontSize: "14px" }}>
            +12.4%
          </span>
        </div>
      </div>
      <EquityCurve
        data={sampleEquityData}
        height={200}
        showXAxis={false}
        showGrid={false}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Equity curve in a dashboard card context.",
      },
    },
  },
};
