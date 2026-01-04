/**
 * Button Stories
 *
 * Storybook stories for button components.
 *
 * @see docs/plans/ui/28-states.md lines 118-124
 */

import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { Button, IconButton } from "./button";
import type { ButtonState } from "./button";

// ============================================
// Button Stories
// ============================================

const meta: Meta<typeof Button> = {
  title: "UI/Actions/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Button component with variants, sizes, and loading states.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "destructive", "ghost", "link"],
      description: "Button variant",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
      description: "Button size",
    },
    state: {
      control: "select",
      options: ["idle", "loading", "success", "error"],
      description: "Button state",
    },
    disabled: {
      control: "boolean",
      description: "Disabled state",
    },
    fullWidth: {
      control: "boolean",
      description: "Full width button",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

// ============================================
// Variants
// ============================================

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary Button",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete",
  },
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost Button",
  },
};

export const Link: Story = {
  args: {
    variant: "link",
    children: "Link Button",
  },
};

export const AllVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

// ============================================
// Sizes
// ============================================

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small",
  },
};

export const Medium: Story = {
  args: {
    size: "md",
    children: "Medium",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large",
  },
};

export const AllSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

// ============================================
// States
// ============================================

export const Idle: Story = {
  args: {
    state: "idle",
    children: "Save Changes",
  },
};

export const Loading: Story = {
  args: {
    state: "loading",
    children: "Save Changes",
    loadingText: "Saving...",
  },
};

export const Success: Story = {
  args: {
    state: "success",
    successText: "Saved!",
  },
};

export const Error: Story = {
  args: {
    state: "error",
    errorText: "Failed",
  },
};

export const AllStates: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <Button state="idle">Idle</Button>
      <Button state="loading" loadingText="Loading...">Loading</Button>
      <Button state="success" successText="Done!">Success</Button>
      <Button state="error" errorText="Error">Error</Button>
    </div>
  ),
};

// ============================================
// With Icons
// ============================================

export const WithLeftIcon: Story = {
  args: {
    leftIcon: <span>📁</span>,
    children: "Open File",
  },
};

export const WithRightIcon: Story = {
  args: {
    rightIcon: <span>→</span>,
    children: "Continue",
  },
};

export const WithBothIcons: Story = {
  args: {
    leftIcon: <span>💾</span>,
    rightIcon: <span>✓</span>,
    children: "Save",
  },
};

// ============================================
// IconButton
// ============================================

export const IconButtonDefault: StoryObj<typeof IconButton> = {
  render: (args) => <IconButton {...args} />,
  args: {
    children: "🔔",
  },
  parameters: {
    docs: {
      description: {
        story: "Icon-only button with square dimensions.",
      },
    },
  },
};

export const IconButtonVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px" }}>
      <IconButton variant="primary">⚙️</IconButton>
      <IconButton variant="secondary">🔔</IconButton>
      <IconButton variant="ghost">✕</IconButton>
      <IconButton variant="destructive">🗑️</IconButton>
    </div>
  ),
};

// ============================================
// Full Width
// ============================================

export const FullWidth: Story = {
  args: {
    fullWidth: true,
    children: "Full Width Button",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
};

// ============================================
// Disabled
// ============================================

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled Button",
  },
};

export const DisabledVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <Button variant="primary" disabled>Primary</Button>
      <Button variant="secondary" disabled>Secondary</Button>
      <Button variant="destructive" disabled>Destructive</Button>
      <Button variant="ghost" disabled>Ghost</Button>
    </div>
  ),
};

// ============================================
// Interactive Demo
// ============================================

function InteractiveButtonDemo() {
  const [state, setState] = useState<ButtonState>("idle");

  const handleClick = async () => {
    setState("loading");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const success = Math.random() > 0.3;
    setState(success ? "success" : "error");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
      <Button
        state={state}
        onClick={handleClick}
        onStateReset={() => setState("idle")}
        loadingText="Saving..."
        successText="Saved!"
        errorText="Failed"
      >
        Save Changes
      </Button>
      <p style={{ color: "#78716c", fontSize: "14px" }}>
        70% success rate. State: <strong>{state}</strong>
      </p>
    </div>
  );
}

export const Interactive: StoryObj = {
  render: () => <InteractiveButtonDemo />,
  parameters: {
    docs: {
      description: {
        story: "Interactive demo with state transitions.",
      },
    },
  },
};

// ============================================
// Variant + Size Matrix
// ============================================

export const VariantSizeMatrix: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {(["primary", "secondary", "destructive", "ghost"] as const).map((variant) => (
        <div key={variant} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ width: "80px", fontSize: "12px", color: "#78716c" }}>
            {variant}
          </span>
          <Button variant={variant} size="sm">Small</Button>
          <Button variant={variant} size="md">Medium</Button>
          <Button variant={variant} size="lg">Large</Button>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Matrix showing all variant and size combinations.",
      },
    },
  },
};
