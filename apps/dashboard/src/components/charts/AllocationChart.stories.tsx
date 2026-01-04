/**
 * Allocation Chart Stories
 *
 * Storybook stories for allocation pie/donut chart component.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { Meta, StoryObj } from "@storybook/react";
import { AllocationChart } from "./AllocationChart";
import type { AllocationDataPoint } from "./AllocationChart";

// ============================================
// Sample Data
// ============================================

const sectorAllocation: AllocationDataPoint[] = [
  { name: "Technology", value: 35, color: "#3b82f6" },
  { name: "Healthcare", value: 20, color: "#22c55e" },
  { name: "Financials", value: 18, color: "#f59e0b" },
  { name: "Consumer", value: 15, color: "#8b5cf6" },
  { name: "Energy", value: 12, color: "#ef4444" },
];

const assetAllocation: AllocationDataPoint[] = [
  { name: "Equities", value: 60 },
  { name: "Bonds", value: 25 },
  { name: "Cash", value: 10 },
  { name: "Alternatives", value: 5 },
];

const positionAllocation: AllocationDataPoint[] = [
  { name: "AAPL", value: 25, color: "#78716c" },
  { name: "GOOGL", value: 20, color: "#3b82f6" },
  { name: "MSFT", value: 18, color: "#22c55e" },
  { name: "AMZN", value: 15, color: "#f59e0b" },
  { name: "NVDA", value: 12, color: "#8b5cf6" },
  { name: "Other", value: 10, color: "#a3a3a3" },
];

const simpleAllocation: AllocationDataPoint[] = [
  { name: "Long", value: 70, color: "#22c55e" },
  { name: "Short", value: 30, color: "#ef4444" },
];

// ============================================
// Meta
// ============================================

const meta: Meta<typeof AllocationChart> = {
  title: "Charts/Portfolio/Allocation",
  component: AllocationChart,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Pie or donut chart for portfolio allocation visualization. Built with Recharts.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "number", min: 150, max: 500 },
      description: "Chart size in pixels",
    },
    innerRadius: {
      control: { type: "number", min: 0, max: 80 },
      description: "Inner radius percentage (0 for pie, >0 for donut)",
    },
    showLegend: {
      control: "boolean",
      description: "Show legend",
    },
    showTooltip: {
      control: "boolean",
      description: "Show tooltip on hover",
    },
  },
};

export default meta;

type Story = StoryObj<typeof AllocationChart>;

// ============================================
// Stories
// ============================================

export const Default: Story = {
  args: {
    data: sectorAllocation,
    size: 300,
  },
};

export const PieChart: Story = {
  args: {
    data: sectorAllocation,
    size: 300,
    innerRadius: 0,
  },
  parameters: {
    docs: {
      description: {
        story: "Solid pie chart (no inner radius).",
      },
    },
  },
};

export const DonutChart: Story = {
  args: {
    data: sectorAllocation,
    size: 300,
    innerRadius: 60,
  },
  parameters: {
    docs: {
      description: {
        story: "Donut chart with 60% inner radius.",
      },
    },
  },
};

export const AssetClasses: Story = {
  args: {
    data: assetAllocation,
    size: 280,
  },
  parameters: {
    docs: {
      description: {
        story: "Asset class allocation with auto-generated colors.",
      },
    },
  },
};

export const TopPositions: Story = {
  args: {
    data: positionAllocation,
    size: 320,
    innerRadius: 55,
  },
  parameters: {
    docs: {
      description: {
        story: "Top positions by weight.",
      },
    },
  },
};

export const LongShort: Story = {
  args: {
    data: simpleAllocation,
    size: 200,
    innerRadius: 65,
  },
  parameters: {
    docs: {
      description: {
        story: "Simple long/short exposure split.",
      },
    },
  },
};

export const Compact: Story = {
  args: {
    data: sectorAllocation,
    size: 180,
    showLegend: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Compact view without legend.",
      },
    },
  },
};

export const WithLegend: Story = {
  args: {
    data: sectorAllocation,
    size: 280,
    showLegend: true,
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
        width: "320px",
      }}
    >
      <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>Sector Allocation</h3>
      <AllocationChart
        data={sectorAllocation}
        size={240}
        innerRadius: 55,
        showLegend
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Allocation chart in a dashboard card.",
      },
    },
  },
};

// ============================================
// All Sizes
// ============================================

export const SizeComparison: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
      <div>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "8px" }}>Small (150px)</p>
        <AllocationChart data={simpleAllocation} size={150} showLegend={false} />
      </div>
      <div>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "8px" }}>Medium (200px)</p>
        <AllocationChart data={simpleAllocation} size={200} showLegend={false} />
      </div>
      <div>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "8px" }}>Large (280px)</p>
        <AllocationChart data={simpleAllocation} size={280} showLegend={false} />
      </div>
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: "Size comparison.",
      },
    },
  },
};
