/**
 * Skeleton Stories
 *
 * Storybook stories for skeleton loading components.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Skeleton,
  SkeletonText,
  SkeletonCircle,
  SkeletonCard,
  SkeletonTable,
  SkeletonList,
  SkeletonChart,
  SkeletonAvatar,
} from "./skeleton";

// ============================================
// Base Skeleton
// ============================================

const meta: Meta<typeof Skeleton> = {
  title: "UI/Loading/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Skeleton loading placeholders with shimmer animation for content loading states.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: "text",
      description: "Width (number for px, string for any unit)",
    },
    height: {
      control: "text",
      description: "Height (number for px, string for any unit)",
    },
    borderRadius: {
      control: "text",
      description: "Border radius",
    },
    animate: {
      control: "boolean",
      description: "Enable shimmer animation",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    width: 200,
    height: 20,
  },
};

export const NoAnimation: Story = {
  args: {
    width: 200,
    height: 20,
    animate: false,
  },
};

export const CustomShape: Story = {
  args: {
    width: 100,
    height: 100,
    borderRadius: "50%",
  },
};

// ============================================
// SkeletonText
// ============================================

export const TextDefault: StoryObj<typeof SkeletonText> = {
  render: (args) => <SkeletonText {...args} />,
  args: {
    lines: 3,
    width: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Multiple lines of text skeleton with varying widths.",
      },
    },
  },
};

export const TextSingleLine: StoryObj<typeof SkeletonText> = {
  render: (args) => <SkeletonText {...args} />,
  args: {
    lines: 1,
    width: 200,
  },
};

export const TextFiveLines: StoryObj<typeof SkeletonText> = {
  render: (args) => <SkeletonText {...args} />,
  args: {
    lines: 5,
    width: 400,
  },
};

// ============================================
// SkeletonCircle
// ============================================

export const CircleDefault: StoryObj<typeof SkeletonCircle> = {
  render: (args) => <SkeletonCircle {...args} />,
  args: {
    size: 48,
  },
  parameters: {
    docs: {
      description: {
        story: "Circular skeleton for avatars and icons.",
      },
    },
  },
};

export const CircleSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <SkeletonCircle size={24} />
      <SkeletonCircle size={32} />
      <SkeletonCircle size={48} />
      <SkeletonCircle size={64} />
    </div>
  ),
};

// ============================================
// SkeletonCard
// ============================================

export const CardDefault: StoryObj<typeof SkeletonCard> = {
  render: (args) => <SkeletonCard {...args} />,
  args: {
    width: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "Card skeleton with image, title, and text.",
      },
    },
  },
};

export const CardWithoutImage: StoryObj<typeof SkeletonCard> = {
  render: (args) => <SkeletonCard {...args} />,
  args: {
    width: 300,
    showImage: false,
  },
};

// ============================================
// SkeletonTable
// ============================================

export const TableDefault: StoryObj<typeof SkeletonTable> = {
  render: (args) => <SkeletonTable {...args} />,
  args: {
    rows: 5,
    columns: 4,
  },
  parameters: {
    docs: {
      description: {
        story: "Table skeleton with configurable rows and columns.",
      },
    },
  },
};

export const TableCompact: StoryObj<typeof SkeletonTable> = {
  render: (args) => <SkeletonTable {...args} />,
  args: {
    rows: 3,
    columns: 3,
  },
};

// ============================================
// SkeletonList
// ============================================

export const ListDefault: StoryObj<typeof SkeletonList> = {
  render: (args) => <SkeletonList {...args} />,
  args: {
    items: 4,
    showAvatar: true,
  },
  parameters: {
    docs: {
      description: {
        story: "List skeleton with optional avatars.",
      },
    },
  },
};

export const ListWithoutAvatar: StoryObj<typeof SkeletonList> = {
  render: (args) => <SkeletonList {...args} />,
  args: {
    items: 4,
    showAvatar: false,
  },
};

// ============================================
// SkeletonChart
// ============================================

export const ChartDefault: StoryObj<typeof SkeletonChart> = {
  render: (args) => <SkeletonChart {...args} />,
  args: {
    width: 400,
    height: 200,
  },
  parameters: {
    docs: {
      description: {
        story: "Chart skeleton with axis and bars.",
      },
    },
  },
};

// ============================================
// SkeletonAvatar
// ============================================

export const AvatarDefault: StoryObj<typeof SkeletonAvatar> = {
  render: (args) => <SkeletonAvatar {...args} />,
  args: {
    size: 48,
    showName: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Avatar skeleton with optional name text.",
      },
    },
  },
};

export const AvatarSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
      <SkeletonAvatar size={32} showName={false} />
      <SkeletonAvatar size={48} showName />
      <SkeletonAvatar size={64} showName />
    </div>
  ),
};

// ============================================
// Combined Example
// ============================================

export const ProfileCard: StoryObj = {
  render: () => (
    <div
      style={{
        width: 300,
        padding: "16px",
        border: "1px solid #e7e5e4",
        borderRadius: "8px",
      }}
    >
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <SkeletonCircle size={48} />
        <div style={{ flex: 1 }}>
          <SkeletonText lines={2} width="100%" />
        </div>
      </div>
      <SkeletonText lines={3} width="100%" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Combined skeleton example showing a profile card layout.",
      },
    },
  },
};
