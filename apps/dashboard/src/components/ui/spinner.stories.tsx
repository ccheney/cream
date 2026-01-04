/**
 * Spinner Stories
 *
 * Storybook stories for inline spinner components.
 *
 * @see docs/plans/ui/28-states.md lines 89-97
 */

import type { Meta, StoryObj } from "@storybook/react";
import { ButtonLoading, Spinner, SpinnerBar, SpinnerDots, SpinnerOverlay } from "./spinner";

// ============================================
// Spinner Stories
// ============================================

const spinnerMeta: Meta<typeof Spinner> = {
  title: "UI/Loading/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Inline spinner with CSS border animation. Uses currentColor for color inheritance.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
      description: "Spinner size",
    },
    color: {
      control: "color",
      description: "Spinner color (defaults to currentColor)",
    },
    label: {
      control: "text",
      description: "Screen reader label",
    },
  },
};

export default spinnerMeta;

type SpinnerStory = StoryObj<typeof Spinner>;

export const Default: SpinnerStory = {
  args: {
    size: "md",
    label: "Loading",
  },
};

export const ExtraSmall: SpinnerStory = {
  args: {
    size: "xs",
    label: "Loading",
  },
};

export const Small: SpinnerStory = {
  args: {
    size: "sm",
    label: "Loading",
  },
};

export const Large: SpinnerStory = {
  args: {
    size: "lg",
    label: "Loading",
  },
};

export const CustomColor: SpinnerStory = {
  args: {
    size: "md",
    color: "#3b82f6",
    label: "Loading",
  },
};

export const AllSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Spinner size="xs" label="Extra small" />
      <Spinner size="sm" label="Small" />
      <Spinner size="md" label="Medium" />
      <Spinner size="lg" label="Large" />
    </div>
  ),
};

// ============================================
// SpinnerDots Stories
// ============================================

export const DotsDefault: StoryObj<typeof SpinnerDots> = {
  render: (args) => <SpinnerDots {...args} />,
  args: {
    size: "md",
    label: "Loading",
  },
  parameters: {
    docs: {
      description: {
        story: "Three-dot bounce animation spinner.",
      },
    },
  },
};

export const DotsAllSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
      <SpinnerDots size="xs" label="Extra small" />
      <SpinnerDots size="sm" label="Small" />
      <SpinnerDots size="md" label="Medium" />
      <SpinnerDots size="lg" label="Large" />
    </div>
  ),
};

// ============================================
// SpinnerBar Stories
// ============================================

export const BarDefault: StoryObj<typeof SpinnerBar> = {
  render: (args) => <SpinnerBar {...args} />,
  args: {
    size: "md",
    label: "Loading",
  },
  parameters: {
    docs: {
      description: {
        story: "Three-bar pulse animation spinner.",
      },
    },
  },
};

export const BarAllSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
      <SpinnerBar size="xs" label="Extra small" />
      <SpinnerBar size="sm" label="Small" />
      <SpinnerBar size="md" label="Medium" />
      <SpinnerBar size="lg" label="Large" />
    </div>
  ),
};

// ============================================
// ButtonLoading Stories
// ============================================

export const ButtonLoadingDefault: StoryObj<typeof ButtonLoading> = {
  render: (args) => <ButtonLoading {...args} />,
  args: {
    children: "Loading...",
    size: "sm",
  },
  parameters: {
    docs: {
      description: {
        story: "Spinner with text for button loading states.",
      },
    },
  },
};

export const ButtonLoadingVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <ButtonLoading size="xs">Saving...</ButtonLoading>
      <ButtonLoading size="sm">Loading...</ButtonLoading>
      <ButtonLoading size="md">Processing...</ButtonLoading>
    </div>
  ),
};

// ============================================
// SpinnerOverlay Stories
// ============================================

export const OverlayDefault: StoryObj<typeof SpinnerOverlay> = {
  render: (args) => (
    <div
      style={{ position: "relative", width: "300px", height: "200px", border: "1px solid #ccc" }}
    >
      <div style={{ padding: "16px" }}>
        <h3>Card Content</h3>
        <p>This content is behind the overlay.</p>
      </div>
      <SpinnerOverlay {...args} />
    </div>
  ),
  args: {
    label: "Loading content...",
  },
  parameters: {
    docs: {
      description: {
        story: "Centered spinner overlay for cards and containers.",
      },
    },
  },
};

export const OverlayWithText: StoryObj<typeof SpinnerOverlay> = {
  render: (args) => (
    <div
      style={{ position: "relative", width: "300px", height: "200px", border: "1px solid #ccc" }}
    >
      <div style={{ padding: "16px" }}>
        <h3>Card Content</h3>
        <p>This content is loading.</p>
      </div>
      <SpinnerOverlay {...args}>
        <span style={{ marginTop: "8px", color: "#78716c" }}>Loading data...</span>
      </SpinnerOverlay>
    </div>
  ),
  args: {
    label: "Loading",
  },
};
