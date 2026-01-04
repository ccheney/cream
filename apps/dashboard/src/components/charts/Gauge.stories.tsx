/**
 * Gauge Stories
 *
 * Storybook stories for gauge/meter chart component.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import type { Meta, StoryObj } from "@storybook/react";
import React, { useState, useEffect } from "react";
import { Gauge } from "./Gauge";

// ============================================
// Meta
// ============================================

const meta: Meta<typeof Gauge> = {
  title: "Charts/Indicators/Gauge",
  component: Gauge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Arc gauge for displaying percentage values with color-coded thresholds.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Current value (0-100)",
    },
    size: {
      control: { type: "number", min: 80, max: 200 },
      description: "Diameter in pixels",
    },
    showValue: {
      control: "boolean",
      description: "Show numeric value",
    },
    animate: {
      control: "boolean",
      description: "Animate value changes",
    },
    label: {
      control: "text",
      description: "Label text below value",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Gauge>;

// ============================================
// Threshold Stories
// ============================================

export const Comfortable: Story = {
  args: {
    value: 45,
    label: "Risk Level",
    size: 120,
  },
  parameters: {
    docs: {
      description: {
        story: "Value in comfortable zone (0-60%).",
      },
    },
  },
};

export const Warning: Story = {
  args: {
    value: 72,
    label: "Risk Level",
    size: 120,
  },
  parameters: {
    docs: {
      description: {
        story: "Value in warning zone (60-80%).",
      },
    },
  },
};

export const Critical: Story = {
  args: {
    value: 92,
    label: "Risk Level",
    size: 120,
  },
  parameters: {
    docs: {
      description: {
        story: "Value in critical zone (80-100%).",
      },
    },
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    label: "Utilization",
    size: 120,
  },
};

export const Full: Story = {
  args: {
    value: 100,
    label: "Capacity",
    size: 120,
  },
};

// ============================================
// Size Variants
// ============================================

export const Small: Story = {
  args: {
    value: 65,
    size: 80,
    showValue: true,
  },
};

export const Medium: Story = {
  args: {
    value: 65,
    size: 120,
    label: "Risk",
  },
};

export const Large: Story = {
  args: {
    value: 65,
    size: 180,
    label: "Risk Level",
  },
};

export const SizeComparison: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "flex-end" }}>
      <Gauge value={55} size={80} />
      <Gauge value={55} size={120} label="Risk" />
      <Gauge value={55} size={160} label="Risk Level" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Size comparison.",
      },
    },
  },
};

// ============================================
// Custom Thresholds
// ============================================

export const CustomThresholds: Story = {
  args: {
    value: 35,
    size: 120,
    label: "CPU",
    thresholds: {
      comfortable: 50,
      warning: 75,
      critical: 90,
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Custom threshold configuration.",
      },
    },
  },
};

// ============================================
// Without Value Display
// ============================================

export const NoValueDisplay: Story = {
  args: {
    value: 70,
    size: 100,
    showValue: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Gauge without numeric value display.",
      },
    },
  },
};

// ============================================
// Animation Demo
// ============================================

function AnimatedGaugeDemo() {
  const [value, setValue] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setValue((v) => {
        const next = v + (Math.random() - 0.5) * 20;
        return Math.max(0, Math.min(100, next));
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <Gauge value={value} size={150} label="Live Metric" animate />
      <p style={{ color: "#78716c", fontSize: "12px", marginTop: "8px" }}>
        Value updates every 2 seconds
      </p>
    </div>
  );
}

export const Animated: Story = {
  render: () => <AnimatedGaugeDemo />,
  parameters: {
    docs: {
      description: {
        story: "Animated gauge with live value updates.",
      },
    },
  },
};

// ============================================
// Dashboard Grid
// ============================================

export const DashboardGrid: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "24px",
        padding: "16px",
        backgroundColor: "#fafaf9",
        borderRadius: "8px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Gauge value={35} size={100} label="CPU" />
      </div>
      <div style={{ textAlign: "center" }}>
        <Gauge value={68} size={100} label="Memory" />
      </div>
      <div style={{ textAlign: "center" }}>
        <Gauge value={85} size={100} label="Disk" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Multiple gauges in a dashboard grid.",
      },
    },
  },
};

// ============================================
// All Zones
// ============================================

export const AllZones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "32px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#22c55e", marginBottom: "8px" }}>Comfortable</p>
        <Gauge value={40} size={100} />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#f59e0b", marginBottom: "8px" }}>Warning</p>
        <Gauge value={70} size={100} />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#ef4444", marginBottom: "8px" }}>Critical</p>
        <Gauge value={95} size={100} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All three threshold zones.",
      },
    },
  },
};
