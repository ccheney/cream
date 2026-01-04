/**
 * Logo Stories
 *
 * Storybook stories for logo and loading logo components.
 *
 * @see docs/plans/ui/28-states.md lines 98-102
 */

import type { Meta, StoryObj } from "@storybook/react";
import { LoadingLogo, Logo } from "./logo";

// ============================================
// Logo Stories
// ============================================

const meta: Meta<typeof Logo> = {
  title: "UI/Brand/Logo",
  component: Logo,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Cream logo component with full and icon-only variants.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["full", "icon"],
      description: "Logo variant",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "Logo size",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Logo>;

export const Default: Story = {
  args: {
    variant: "full",
    size: "md",
  },
};

export const IconOnly: Story = {
  args: {
    variant: "icon",
    size: "md",
  },
};

export const Small: Story = {
  args: {
    variant: "full",
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    variant: "full",
    size: "lg",
  },
};

export const AllSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center" }}>
      <Logo variant="full" size="sm" />
      <Logo variant="full" size="md" />
      <Logo variant="full" size="lg" />
    </div>
  ),
};

export const IconSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Logo variant="icon" size="sm" />
      <Logo variant="icon" size="md" />
      <Logo variant="icon" size="lg" />
    </div>
  ),
};

// ============================================
// LoadingLogo Stories
// ============================================

export const LoadingDefault: StoryObj<typeof LoadingLogo> = {
  render: (args) => <LoadingLogo {...args} />,
  args: {
    size: "md",
  },
  parameters: {
    docs: {
      description: {
        story: "Logo with pulse animation for loading states.",
      },
    },
  },
};

export const LoadingWithText: StoryObj<typeof LoadingLogo> = {
  render: (args) => <LoadingLogo {...args} />,
  args: {
    size: "lg",
    text: "Loading...",
  },
};

export const LoadingSizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", alignItems: "center" }}>
      <LoadingLogo size="sm" text="Small" />
      <LoadingLogo size="md" text="Medium" />
      <LoadingLogo size="lg" text="Large" />
    </div>
  ),
};

// ============================================
// Full Page Example
// ============================================

export const FullPageLoading: StoryObj = {
  render: () => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fafaf9",
      }}
    >
      <LoadingLogo size="lg" text="Loading application..." />
    </div>
  ),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: "Full-page loading screen with centered logo.",
      },
    },
  },
};
