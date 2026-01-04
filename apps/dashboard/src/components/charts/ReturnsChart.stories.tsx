/**
 * Returns Chart Stories
 *
 * Storybook stories for returns bar chart component.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { Meta, StoryObj } from "@storybook/react";
import { ReturnsChart } from "./ReturnsChart";
import type { ReturnDataPoint } from "./ReturnsChart";

// ============================================
// Sample Data
// ============================================

const monthlyReturns: ReturnDataPoint[] = [
  { period: "Jan", value: 3.2 },
  { period: "Feb", value: -1.5 },
  { period: "Mar", value: 2.8 },
  { period: "Apr", value: 4.1 },
  { period: "May", value: -0.8 },
  { period: "Jun", value: 1.9 },
  { period: "Jul", value: 3.5 },
  { period: "Aug", value: -2.1 },
  { period: "Sep", value: 0.5 },
  { period: "Oct", value: 2.3 },
  { period: "Nov", value: 4.7 },
  { period: "Dec", value: 1.2 },
];

const quarterlyReturns: ReturnDataPoint[] = [
  { period: "Q1", value: 4.5 },
  { period: "Q2", value: 5.2 },
  { period: "Q3", value: 1.9 },
  { period: "Q4", value: 8.2 },
];

const yearlyReturns: ReturnDataPoint[] = [
  { period: "2020", value: 18.4 },
  { period: "2021", value: 28.7 },
  { period: "2022", value: -18.1 },
  { period: "2023", value: 26.3 },
  { period: "2024", value: 32.1 },
  { period: "2025", value: 12.5 },
];

const weeklyReturns: ReturnDataPoint[] = [
  { period: "W1", value: 1.2 },
  { period: "W2", value: -0.5 },
  { period: "W3", value: 0.8 },
  { period: "W4", value: 1.5 },
];

const allPositive: ReturnDataPoint[] = [
  { period: "Jan", value: 2.1 },
  { period: "Feb", value: 1.8 },
  { period: "Mar", value: 3.2 },
  { period: "Apr", value: 2.5 },
];

const allNegative: ReturnDataPoint[] = [
  { period: "Jan", value: -1.5 },
  { period: "Feb", value: -2.3 },
  { period: "Mar", value: -0.8 },
  { period: "Apr", value: -1.9 },
];

// ============================================
// Meta
// ============================================

const meta: Meta<typeof ReturnsChart> = {
  title: "Charts/Performance/Returns",
  component: ReturnsChart,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Bar chart for displaying periodic returns with positive/negative coloring.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    height: {
      control: { type: "number", min: 150, max: 400 },
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
      description: "Show X axis labels",
    },
    showYAxis: {
      control: "boolean",
      description: "Show Y axis labels",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", maxWidth: "600px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ReturnsChart>;

// ============================================
// Time Period Stories
// ============================================

export const Monthly: Story = {
  args: {
    data: monthlyReturns,
    height: 250,
  },
  parameters: {
    docs: {
      description: {
        story: "Monthly returns for a year.",
      },
    },
  },
};

export const Quarterly: Story = {
  args: {
    data: quarterlyReturns,
    height: 250,
  },
  parameters: {
    docs: {
      description: {
        story: "Quarterly returns.",
      },
    },
  },
};

export const Yearly: Story = {
  args: {
    data: yearlyReturns,
    height: 280,
  },
  parameters: {
    docs: {
      description: {
        story: "Annual returns over multiple years.",
      },
    },
  },
};

export const Weekly: Story = {
  args: {
    data: weeklyReturns,
    height: 200,
  },
  parameters: {
    docs: {
      description: {
        story: "Weekly returns (compact).",
      },
    },
  },
};

// ============================================
// Trend Stories
// ============================================

export const AllPositive: Story = {
  args: {
    data: allPositive,
    height: 200,
  },
  parameters: {
    docs: {
      description: {
        story: "All positive returns.",
      },
    },
  },
};

export const AllNegative: Story = {
  args: {
    data: allNegative,
    height: 200,
  },
  parameters: {
    docs: {
      description: {
        story: "All negative returns (drawdown period).",
      },
    },
  },
};

// ============================================
// Display Options
// ============================================

export const WithoutGrid: Story = {
  args: {
    data: monthlyReturns,
    height: 250,
    showGrid: false,
  },
};

export const MinimalAxes: Story = {
  args: {
    data: monthlyReturns,
    height: 200,
    showYAxis: false,
    showGrid: false,
  },
};

export const Compact: Story = {
  args: {
    data: quarterlyReturns,
    height: 150,
    showGrid: false,
  },
};

// ============================================
// Custom Formatter
// ============================================

export const WithCustomFormatter: Story = {
  args: {
    data: monthlyReturns,
    height: 250,
    valueFormatter: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
  },
  parameters: {
    docs: {
      description: {
        story: "With custom percentage formatter.",
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
        <h3 style={{ margin: 0, fontSize: "16px" }}>Monthly Returns</h3>
        <p style={{ color: "#78716c", fontSize: "14px", margin: "4px 0 0" }}>
          YTD: <span style={{ color: "#22c55e", fontWeight: 500 }}>+19.8%</span>
        </p>
      </div>
      <ReturnsChart
        data={monthlyReturns}
        height={200}
        showGrid={false}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Returns chart in a dashboard card.",
      },
    },
  },
};

// ============================================
// Comparison
// ============================================

export const YearOverYear: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#78716c" }}>2024</h4>
        <ReturnsChart
          data={monthlyReturns}
          height={150}
          showGrid={false}
        />
      </div>
      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#78716c" }}>2023</h4>
        <ReturnsChart
          data={monthlyReturns.map((d) => ({ ...d, value: d.value * 0.8 + Math.random() * 2 - 1 }))}
          height={150}
          showGrid={false}
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Year-over-year comparison.",
      },
    },
  },
};
