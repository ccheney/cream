/**
 * Sparkline Stories
 *
 * Storybook stories for sparkline chart component.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { Meta, StoryObj } from "@storybook/react";
import { Sparkline } from "./Sparkline";

// ============================================
// Sample Data
// ============================================

const upwardTrend = [10, 12, 11, 15, 18, 16, 20, 22, 25, 23, 28, 30];
const downwardTrend = [30, 28, 25, 22, 24, 20, 18, 15, 16, 12, 10, 8];
const flatTrend = [20, 19, 21, 20, 22, 21, 20, 19, 21, 20, 21, 20];
const volatileTrend = [15, 25, 12, 28, 10, 30, 8, 26, 14, 24, 16, 22];
const shortData = [10, 15, 12, 18, 20];
const longData = Array.from({ length: 50 }, () => Math.random() * 100);

// ============================================
// Meta
// ============================================

const meta: Meta<typeof Sparkline> = {
  title: "Charts/Indicators/Sparkline",
  component: Sparkline,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Compact inline chart for showing trends in small spaces like table cells.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 40, max: 200 },
      description: "Width in pixels",
    },
    height: {
      control: { type: "number", min: 16, max: 60 },
      description: "Height in pixels",
    },
    color: {
      control: "select",
      options: ["positive", "negative", "neutral", "primary"],
      description: "Color preset or custom color",
    },
    showLastPoint: {
      control: "boolean",
      description: "Show dot on last data point",
    },
    strokeWidth: {
      control: { type: "number", min: 0.5, max: 3, step: 0.5 },
      description: "Line stroke width",
    },
    autoColor: {
      control: "boolean",
      description: "Auto-detect color from trend direction",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Sparkline>;

// ============================================
// Trend Stories
// ============================================

export const Default: Story = {
  args: {
    data: upwardTrend,
    width: 80,
    height: 24,
  },
};

export const UpwardTrend: Story = {
  args: {
    data: upwardTrend,
    width: 80,
    height: 24,
    autoColor: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Upward trend with auto-detected green color.",
      },
    },
  },
};

export const DownwardTrend: Story = {
  args: {
    data: downwardTrend,
    width: 80,
    height: 24,
    autoColor: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Downward trend with auto-detected red color.",
      },
    },
  },
};

export const FlatTrend: Story = {
  args: {
    data: flatTrend,
    width: 80,
    height: 24,
    autoColor: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Flat trend with neutral gray color.",
      },
    },
  },
};

export const VolatileTrend: Story = {
  args: {
    data: volatileTrend,
    width: 100,
    height: 32,
  },
  parameters: {
    docs: {
      description: {
        story: "Volatile data with high variation.",
      },
    },
  },
};

// ============================================
// Size Variants
// ============================================

export const Compact: Story = {
  args: {
    data: upwardTrend,
    width: 50,
    height: 16,
    strokeWidth: 1,
    showLastPoint: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Very compact for tight spaces.",
      },
    },
  },
};

export const Wide: Story = {
  args: {
    data: longData,
    width: 160,
    height: 32,
  },
  parameters: {
    docs: {
      description: {
        story: "Wider sparkline with more data points.",
      },
    },
  },
};

export const Tall: Story = {
  args: {
    data: upwardTrend,
    width: 80,
    height: 48,
    strokeWidth: 2,
  },
  parameters: {
    docs: {
      description: {
        story: "Taller sparkline for more visual impact.",
      },
    },
  },
};

// ============================================
// Color Variants
// ============================================

export const PositiveColor: Story = {
  args: {
    data: upwardTrend,
    color: "positive",
    width: 80,
    height: 24,
  },
};

export const NegativeColor: Story = {
  args: {
    data: downwardTrend,
    color: "negative",
    width: 80,
    height: 24,
  },
};

export const NeutralColor: Story = {
  args: {
    data: flatTrend,
    color: "neutral",
    width: 80,
    height: 24,
  },
};

export const PrimaryColor: Story = {
  args: {
    data: upwardTrend,
    color: "primary",
    width: 80,
    height: 24,
  },
};

export const CustomColor: Story = {
  args: {
    data: upwardTrend,
    color: "#8b5cf6",
    width: 80,
    height: 24,
  },
  parameters: {
    docs: {
      description: {
        story: "Custom color using hex value.",
      },
    },
  },
};

// ============================================
// Last Point Indicator
// ============================================

export const WithLastPoint: Story = {
  args: {
    data: upwardTrend,
    showLastPoint: true,
    width: 80,
    height: 24,
  },
};

export const WithoutLastPoint: Story = {
  args: {
    data: upwardTrend,
    showLastPoint: false,
    width: 80,
    height: 24,
  },
};

// ============================================
// Table Cell Example
// ============================================

export const InTableCell: Story = {
  render: () => (
    <table style={{ borderCollapse: "collapse", fontSize: "14px" }}>
      <thead>
        <tr>
          <th style={{ padding: "8px 16px", textAlign: "left", borderBottom: "1px solid #e5e5e5" }}>Symbol</th>
          <th style={{ padding: "8px 16px", textAlign: "right", borderBottom: "1px solid #e5e5e5" }}>Price</th>
          <th style={{ padding: "8px 16px", textAlign: "right", borderBottom: "1px solid #e5e5e5" }}>Change</th>
          <th style={{ padding: "8px 16px", textAlign: "center", borderBottom: "1px solid #e5e5e5" }}>7D</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ padding: "8px 16px" }}>AAPL</td>
          <td style={{ padding: "8px 16px", textAlign: "right" }}>$178.52</td>
          <td style={{ padding: "8px 16px", textAlign: "right", color: "#22c55e" }}>+2.4%</td>
          <td style={{ padding: "8px 16px" }}>
            <Sparkline data={upwardTrend} width={60} height={20} autoColor />
          </td>
        </tr>
        <tr>
          <td style={{ padding: "8px 16px" }}>GOOGL</td>
          <td style={{ padding: "8px 16px", textAlign: "right" }}>$142.80</td>
          <td style={{ padding: "8px 16px", textAlign: "right", color: "#ef4444" }}>-1.2%</td>
          <td style={{ padding: "8px 16px" }}>
            <Sparkline data={downwardTrend} width={60} height={20} autoColor />
          </td>
        </tr>
        <tr>
          <td style={{ padding: "8px 16px" }}>MSFT</td>
          <td style={{ padding: "8px 16px", textAlign: "right" }}>$412.35</td>
          <td style={{ padding: "8px 16px", textAlign: "right", color: "#78716c" }}>+0.1%</td>
          <td style={{ padding: "8px 16px" }}>
            <Sparkline data={flatTrend} width={60} height={20} autoColor />
          </td>
        </tr>
      </tbody>
    </table>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: "Sparklines in a stock table.",
      },
    },
  },
};

// ============================================
// All Trends
// ============================================

export const AllTrends: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "4px" }}>Up</p>
        <Sparkline data={upwardTrend} autoColor />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "4px" }}>Down</p>
        <Sparkline data={downwardTrend} autoColor />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "4px" }}>Flat</p>
        <Sparkline data={flatTrend} autoColor />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#78716c", marginBottom: "4px" }}>Volatile</p>
        <Sparkline data={volatileTrend} color="primary" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All trend types with auto-color.",
      },
    },
  },
};
